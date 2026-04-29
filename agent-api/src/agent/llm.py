"""LLM integration — DB-driven, multi-provider.

Provides a single OpenAI-compatible chat model class and an async resolver
that picks the right model row from the `llm_models` table. All supported
providers (OpenAI / Qwen / GLM / Doubao / Gemini / custom) speak the OpenAI
chat completion schema, so one client serves all of them. Provider-specific
quirks (Doubao's `thinking.type`, etc.) live in `llm_providers/base.py`.
"""
from __future__ import annotations

from typing import Any, List, Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from pydantic import Field

from src.services.llm_service import LLMConfigError, ModelConfig, resolve_model
from src.utils.logger import agent_logger


def _sanitize_user_content(content: Any) -> Any:
    """Strip image_url blocks whose URL the provider can't dereference.

    Background: a previous turn may have stored an `image_url` block with
    a Doubao Files API id (`file-xxx`). Replaying that on the next turn
    fails with HTTP 400 ("Only base64, http or https URLs are
    supported") because the chat endpoint expects a directly-fetchable
    URL or a `data:` URI. The bridge produces those for new turns, but
    checkpointed history keeps the old format. We replace each problem
    block with a text reference so the model still sees an attachment
    existed; for fully-formed URLs (data:/http(s):/oss:/) we leave the
    block alone so vision still works on the live turn.
    """
    if not isinstance(content, list):
        return content
    cleaned: list = []
    for block in content:
        if not isinstance(block, dict):
            cleaned.append(block)
            continue
        if block.get("type") == "image_url":
            url = ((block.get("image_url") or {}).get("url") or "")
            lower = url.lower()
            ok = (
                lower.startswith("data:")
                or lower.startswith("http://")
                or lower.startswith("https://")
                or lower.startswith("oss://")
            )
            if ok:
                cleaned.append(block)
            else:
                cleaned.append({
                    "type": "text",
                    "text": f"[历史附件: {url or '已失效'}]",
                })
        else:
            cleaned.append(block)
    return cleaned


class OpenAICompatibleLLM(BaseChatModel):
    """OpenAI-compatible chat model driven by a `ModelConfig`."""

    # Identity / display
    model_name: str = ""
    provider_key: str = ""

    # Connection
    base_url: str = ""
    api_key: str = ""
    upstream_model: str = ""

    # Behavior
    temperature: float = 0.7
    # `None` means "don't send max_tokens" → providers fall back to their
    # native max output limit. Admins can pin a number via extra_config when
    # they want to cap cost, but the default is uncapped so long replies and
    # AI-generated skill JSON aren't silently truncated.
    max_tokens: Optional[int] = None
    bound_tools: List[Any] = Field(default_factory=list)
    enable_reasoning: bool = False
    streaming: bool = True

    # Provider quirks merged into the OpenAI request body via extra_body.
    extra_body: Optional[dict] = None
    # Additional HTTP headers (e.g. Qwen's X-DashScope-OssResourceResolve).
    extra_headers: Optional[dict] = None

    @property
    def _llm_type(self) -> str:
        return f"openai-compat:{self.provider_key or 'unknown'}"

    @classmethod
    def from_config(
        cls,
        cfg: ModelConfig,
        *,
        enable_reasoning: bool = False,
        streaming: bool = True,
        max_tokens: Optional[int] = None,
    ) -> "OpenAICompatibleLLM":
        """Build an instance from a resolved `ModelConfig`."""
        defaults = cfg.extra_config or {}
        # Per-model defaults from extra_config (admin can override here).
        temperature = float(defaults.get("temperature", 0.7))
        # No hard default — None means "let the provider use its full output
        # budget". Admin can still pin a number via extra_config.max_tokens.
        raw_default_max = defaults.get("max_tokens")
        default_max_tokens: Optional[int] = int(raw_default_max) if raw_default_max else None
        upstream = cfg.model
        if cfg.provider.transform_model_id:
            upstream = cfg.provider.transform_model_id(upstream)

        # Provider-specific extra_body (e.g. Doubao thinking flag) merged
        # with whatever the admin put into extra_config.extra_body.
        extra_body: Optional[dict] = None
        if cfg.provider.build_extra_body is not None:
            extra_body = cfg.provider.build_extra_body(defaults, enable_reasoning)

        # Provider-specific HTTP headers (e.g. Qwen's OSS resource resolve).
        extra_headers: Optional[dict] = None
        if cfg.provider.build_extra_headers is not None:
            extra_headers = cfg.provider.build_extra_headers(defaults)

        return cls(
            model_name=cfg.name,
            provider_key=cfg.provider_key,
            base_url=cfg.base_url or "",
            api_key=cfg.api_key,
            upstream_model=upstream,
            temperature=temperature,
            max_tokens=max_tokens if max_tokens is not None else default_max_tokens,
            enable_reasoning=enable_reasoning,
            streaming=streaming,
            extra_body=extra_body,
            extra_headers=extra_headers,
        )

    def bind_tools(self, tools: list, **kwargs: Any) -> "OpenAICompatibleLLM":
        try:
            return self.model_copy(update={"bound_tools": tools})
        except Exception:
            # Fallback for older Pydantic — reconstruct manually.
            return OpenAICompatibleLLM(
                model_name=self.model_name,
                provider_key=self.provider_key,
                base_url=self.base_url,
                api_key=self.api_key,
                upstream_model=self.upstream_model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                bound_tools=tools,
                enable_reasoning=self.enable_reasoning,
                streaming=self.streaming,
                extra_body=self.extra_body,
                extra_headers=self.extra_headers,
            )

    def _generate(self, messages: List[BaseMessage], **kwargs: Any) -> Any:
        raise NotImplementedError("Use async version")

    async def _agenerate(self, messages: List[BaseMessage], **kwargs: Any) -> Any:
        from langchain_core.outputs import ChatGeneration, ChatResult
        from openai import AsyncOpenAI

        try:
            client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

            formatted_messages = []
            for msg in messages:
                if isinstance(msg, SystemMessage):
                    formatted_messages.append({"role": "system", "content": msg.content})
                elif isinstance(msg, HumanMessage):
                    formatted_messages.append({"role": "user", "content": _sanitize_user_content(msg.content)})
                elif isinstance(msg, ToolMessage):
                    formatted_messages.append({
                        "role": "tool",
                        "content": msg.content,
                        "tool_call_id": getattr(msg, 'tool_call_id', ''),
                    })
                else:  # AIMessage
                    msg_dict: dict = {"role": "assistant"}
                    if msg.content:
                        msg_dict["content"] = msg.content
                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                        msg_dict["tool_calls"] = [
                            {
                                "id": tc.get("id", ""),
                                "type": "function",
                                "function": {
                                    "name": tc.get("name", ""),
                                    "arguments": str(tc.get("args", {})),
                                },
                            }
                            for tc in msg.tool_calls
                        ]
                    formatted_messages.append(msg_dict)

            api_params: dict = {
                "model": self.upstream_model,
                "messages": formatted_messages,
                "temperature": self.temperature,
                "stream": self.streaming,
            }
            # Only forward max_tokens when it's explicitly set; otherwise let
            # the provider apply its own (typically much larger) default.
            if self.max_tokens is not None:
                api_params["max_tokens"] = self.max_tokens

            if self.extra_body:
                api_params["extra_body"] = self.extra_body
            if self.extra_headers:
                api_params["extra_headers"] = self.extra_headers

            if self.bound_tools:
                tools = []
                for tool in self.bound_tools:
                    tool_schema = {
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                        },
                    }
                    if hasattr(tool, 'args_schema') and tool.args_schema:
                        try:
                            schema = tool.args_schema.model_json_schema()
                            tool_schema["function"]["parameters"] = {
                                "type": "object",
                                "properties": schema.get("properties", {}),
                                "required": schema.get("required", []),
                            }
                        except Exception as e:
                            agent_logger.warning(
                                f"Failed to get schema for tool {tool.name}: {e}"
                            )
                    tools.append(tool_schema)
                api_params["tools"] = tools
                api_params["tool_choice"] = "auto"

            if self.streaming:
                content = ""
                thinking_content = ""
                tool_calls: list = []
                tool_calls_dict: dict = {}
                # Token usage is only emitted on the final chunk when
                # `stream_options.include_usage` is set; we ask for it
                # here so the chat finally-block aggregator can sum
                # total_tokens into `conversation_history.tokens_total`.
                api_params["stream_options"] = {"include_usage": True}
                usage_total = 0

                stream = await client.chat.completions.create(**api_params)
                async for chunk in stream:
                    # Final usage-only chunk has no `choices`, only `usage`.
                    if hasattr(chunk, 'usage') and chunk.usage:
                        try:
                            usage_total = int(chunk.usage.total_tokens or 0)
                        except (TypeError, ValueError):
                            usage_total = 0
                    if not (chunk.choices and len(chunk.choices) > 0):
                        continue
                    delta = chunk.choices[0].delta

                    if hasattr(delta, 'content') and delta.content:
                        content += delta.content
                        print(f"[LLM Stream] Content chunk: {delta.content}", flush=True)

                    # Some providers expose deep-thinking content as
                    # `reasoning_content`; others use `thinking`. Capture both.
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        thinking_content += delta.reasoning_content
                    if hasattr(delta, 'thinking') and delta.thinking:
                        thinking_content += delta.thinking

                    if hasattr(delta, 'tool_calls') and delta.tool_calls:
                        for tc_delta in delta.tool_calls:
                            idx = tc_delta.index
                            entry = tool_calls_dict.setdefault(idx, {'id': '', 'name': '', 'arguments': ''})
                            if tc_delta.id:
                                entry['id'] = tc_delta.id
                            if hasattr(tc_delta, 'function') and tc_delta.function:
                                if tc_delta.function.name:
                                    entry['name'] = tc_delta.function.name
                                if tc_delta.function.arguments:
                                    entry['arguments'] += tc_delta.function.arguments

                if tool_calls_dict:
                    import json
                    for idx in sorted(tool_calls_dict.keys()):
                        tc = tool_calls_dict[idx]
                        try:
                            args = json.loads(tc['arguments']) if tc['arguments'] else {}
                        except Exception:
                            args = {}
                        tool_calls.append({"name": tc['name'], "args": args, "id": tc['id']})

                additional_kwargs = {}
                if thinking_content:
                    additional_kwargs['thinking'] = thinking_content
                if usage_total:
                    # Stash on the AIMessage so the checkpointer keeps it;
                    # the chat finally-block sums these into
                    # `conversation_history.tokens_total`.
                    additional_kwargs['usage_total_tokens'] = usage_total

                ai_message = (
                    AIMessage(content=content, tool_calls=tool_calls, additional_kwargs=additional_kwargs)
                    if tool_calls
                    else AIMessage(content=content, additional_kwargs=additional_kwargs)
                )
            else:
                response = await client.chat.completions.create(**api_params)
                if response.choices and len(response.choices) > 0:
                    message = response.choices[0].message
                    content = message.content or ""
                    tool_calls = []
                    if hasattr(message, 'tool_calls') and message.tool_calls:
                        import json
                        for tc in message.tool_calls:
                            try:
                                args = json.loads(tc.function.arguments)
                            except Exception:
                                args = {}
                            tool_calls.append({
                                "name": tc.function.name,
                                "args": args,
                                "id": tc.id,
                            })
                    additional_kwargs = {}
                    try:
                        if response.usage and response.usage.total_tokens:
                            additional_kwargs['usage_total_tokens'] = int(response.usage.total_tokens)
                    except Exception:
                        pass
                    ai_message = (
                        AIMessage(content=content, tool_calls=tool_calls, additional_kwargs=additional_kwargs)
                        if tool_calls
                        else AIMessage(content=content, additional_kwargs=additional_kwargs)
                    )
                else:
                    ai_message = AIMessage(content="抱歉，我没有收到有效的响应。")

            return ChatResult(generations=[ChatGeneration(message=ai_message)])

        except Exception as e:
            agent_logger.error(
                f"Error calling LLM provider '{self.provider_key}' model '{self.upstream_model}': {e}",
                exc_info=True,
            )
            ai_message = AIMessage(content=f"抱歉，调用LLM时出错: {e}")
            return ChatResult(generations=[ChatGeneration(message=ai_message)])


async def get_llm(
    *,
    model_id: Optional[str] = None,
    enable_reasoning: bool = False,
    streaming: bool = True,
    max_tokens: Optional[int] = None,
    for_user: bool = True,
    db=None,
) -> BaseChatModel:
    """Resolve an LLM from DB (or pinned via `model_id`) and return a ready-to-call instance.

    Args:
        model_id: Model `name` slug to pin. If None, uses the default model
            (or the first enabled model when no default is set).
        enable_reasoning: Toggle deep-thinking mode (only meaningful for
            providers that advertise `supports_reasoning`).
        streaming: Whether to use SSE streaming.
        max_tokens: Per-call override; falls back to extra_config.max_tokens.
        for_user: True for end-user chat (respects `visible_to_users`),
            False for admin-internal helpers (any enabled model qualifies).
        db: Optional pre-opened AsyncSession. If not provided we open one.

    Raises:
        LLMConfigError when no usable model exists.
    """
    if db is not None:
        cfg = await resolve_model(db, model_name=model_id, for_user=for_user)
    else:
        from src.db import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            cfg = await resolve_model(session, model_name=model_id, for_user=for_user)

    return OpenAICompatibleLLM.from_config(
        cfg,
        enable_reasoning=enable_reasoning,
        streaming=streaming,
        max_tokens=max_tokens,
    )


def create_system_prompt(user_info: dict, skills: list = None, tools: list = None) -> SystemMessage:
    """Create system prompt with user context and available capabilities."""
    skill_names = [s.name for s in (skills or [])]
    tool_names = [t.name for t in (tools or [])]

    capabilities_text = ""
    if skill_names:
        capabilities_text += "\n📋 **可用技能(Skills)**：\n"
        for n in skill_names:
            capabilities_text += f"  - {n}\n"
    if tool_names:
        capabilities_text += "\n🔧 **可用工具(Tools)**：\n"
        for n in tool_names:
            capabilities_text += f"  - {n}\n"
    if not capabilities_text:
        capabilities_text = "\n暂无可用的技能和工具。\n"

    prompt = f"""你是一个强大的内部员工平台助手，可以帮助员工完成各种任务。

当前用户信息：
- 姓名：{user_info.get('name', 'Unknown')}
- 员工ID：{user_info.get('user_id', 'Unknown')}
- 权限等级：{user_info.get('role_level', 1)}
{capabilities_text}
💡 **工作流程**：
1. 分析用户需求
2. 首先查找是否有匹配的**Skill**（名称以skill_开头）
   - 如果有合适的Skill，优先调用Skill
   - Skill会返回工作流程指导，按照指导执行后续步骤
3. 如果没有合适的Skill，查找并调用合适的**Tools**
4. 基于结果给用户提供答案

**重要规则**：
- ⭐ **优先使用Skills处理复杂任务**，Skills会自动编排多个工具
- 🔧 当有合适的工具或技能时，使用function calling调用，获取准确信息
- 💬 当没有合适的工具或技能时，直接用自己的知识回答用户问题
- ⚠️ 不要调用不存在的工具或技能
- 对于敏感操作，系统会自动要求人工确认
- 生成的文件会保存在用户专属目录
- 如果用户发送了文件（图片、文档等），请分析文件内容并结合用户问题回答
- 始终保持专业和礼貌
- ⏰ **涉及"现在/今天/昨天/明天/本周/几月几号/星期几"等时间问题，必须先调用 `get_current_time` 工具拿到真实时间**，不要凭训练记忆作答

🎯 **调用工具/技能的参数规则（严格遵守）**：
1. 调用前必须先阅读工具的参数 schema，识别所有 **required** 参数。
2. 必须从**当前用户消息**或**本次对话历史**中抽取每一个 required 参数的具体值再发起调用。
3. ⛔ **禁止空参或缺参调用**。如果 required 参数无法从对话中确定，必须先用自然语言向用户澄清索取，禁止直接用空 `{{}}` 或省略字段调用工具。
4. ⛔ 不要假设工具内部有默认值、不要把示例值当默认值、不要依赖"工具自己会取默认参数"这种想法。
5. 同一个工具连续返回空/失败时，先检查自己传的参数是否完整正确，而不是换工具或换参数盲试。如果已经确认参数正确但结果为空，直接告诉用户"未查询到数据"，不要重复调用。

📋 **数据展示默认规则**：
当工具返回多行结构化数据（列表/表格类结果）时：
- **默认用 Markdown 表格展示**，不要写成散文或编号列表
- 表头用字段的中文名（如有），数值靠右对齐
- 单位写在表头里，单元格只放数字，例：`| 剩余配额(GB) |`
- 只有用户**明确要求**可视化时（"画图"、"柱状图"、"趋势图"、"对比图"、"可视化"等）才改用图表

📊 **数据可视化（仅当用户明确要求时）**：
需要时可选两种方式：
- **优先调用 `render_chart` 工具**（强校验，出错会提示修复）
- 也可以直接输出 ```chart 代码块（JSON 格式），前端会渲染
- 支持类型：bar（柱）、line（折线）、scatter（散点）、pie（饼）、area（面积）
- 规范格式: {{"type":"bar","title":"...","xKey":"字段","series":[{{"dataKey":"字段","name":"显示名"}}],"data":[{{"字段":"值"}}]}}
- 数值字段必须是 number，不要带单位；单位写在 series.name 里
- 调用成功后简短说明图表含义，不要重复原始数据
"""
    return SystemMessage(content=prompt)
