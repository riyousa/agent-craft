"""Provider abstraction.

A `ProviderSpec` declares the per-provider differences for an OpenAI-compatible
chat completion endpoint:

- `default_base_url` — used when the DB row leaves `base_url` empty
- `supports_reasoning` — whether the provider exposes a thinking/reasoning toggle
- `build_extra_body(extra_config, enable_reasoning)` — provider-specific extras
  to merge into the request body (e.g. Doubao's `thinking.type`)
- `display_name` / `description` — surfaced in the admin UI provider picker

For now every provider we support speaks OpenAI's chat completion schema, so
one shared client handles all of them. Adding a non-compatible provider in
the future means writing a separate adapter and selecting on `provider_key`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass(frozen=True)
class ProviderSpec:
    key: str
    display_name: str
    default_base_url: Optional[str]
    description: str = ""
    supports_reasoning: bool = False
    api_key_required: bool = True
    # (extra_config dict, enable_reasoning bool) -> extra_body dict (or None)
    build_extra_body: Optional[Callable[[dict, bool], Optional[dict]]] = None
    # If the model id needs special formatting per provider, plug in here.
    # Default: pass through.
    transform_model_id: Optional[Callable[[str], str]] = None
    # UI hints
    docs_url: str = ""
    notes: str = ""

    def resolved_base_url(self, override: str | None) -> str | None:
        return override.strip() if override and override.strip() else self.default_base_url


def _doubao_extra_body(extra_config: dict, enable_reasoning: bool) -> Optional[dict]:
    """Doubao (Volcano Engine) deep-thinking flag goes in extra_body.thinking.

    Only emit it when the model is one of the thinking variants — sending
    `thinking.type=disabled` to a non-thinking model is harmless but noisy.
    Caller can override via extra_config['extra_body'].
    """
    user_extra = (extra_config or {}).get("extra_body") or {}
    thinking_type = "enabled" if enable_reasoning else "disabled"
    body = {"thinking": {"type": thinking_type}}
    body.update(user_extra)
    return body


def _passthrough_extra_body(extra_config: dict, enable_reasoning: bool) -> Optional[dict]:
    """Default: only forward whatever the admin put into extra_config.extra_body."""
    user_extra = (extra_config or {}).get("extra_body") or None
    return user_extra


PROVIDERS: dict[str, ProviderSpec] = {
    "openai": ProviderSpec(
        key="openai",
        display_name="OpenAI",
        default_base_url="https://api.openai.com/v1",
        description="OpenAI 官方 API（GPT-4o / GPT-4 / GPT-3.5 等）",
        supports_reasoning=False,
        build_extra_body=_passthrough_extra_body,
        docs_url="https://platform.openai.com/docs/api-reference",
    ),
    "qwen": ProviderSpec(
        key="qwen",
        display_name="通义千问 (DashScope)",
        default_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        description="阿里云百炼 / DashScope OpenAI 兼容端点（qwen-max、qwen-plus 等）",
        supports_reasoning=False,
        build_extra_body=_passthrough_extra_body,
        docs_url="https://help.aliyun.com/zh/model-studio/getting-started/",
    ),
    "glm": ProviderSpec(
        key="glm",
        display_name="智谱 GLM",
        default_base_url="https://open.bigmodel.cn/api/paas/v4",
        description="智谱 AI（GLM-4-Plus、GLM-4 等）",
        supports_reasoning=False,
        build_extra_body=_passthrough_extra_body,
        docs_url="https://docs.bigmodel.cn/",
    ),
    "doubao": ProviderSpec(
        key="doubao",
        display_name="火山引擎 / 豆包 (Doubao)",
        default_base_url="https://ark.cn-beijing.volces.com/api/v3",
        description="火山引擎方舟（Doubao1.5-thinking-pro 等）",
        supports_reasoning=True,
        build_extra_body=_doubao_extra_body,
        docs_url="https://www.volcengine.com/docs/82379",
        notes="深度思考模型推荐使用 Doubao1.5-thinking-pro。",
    ),
    "gemini": ProviderSpec(
        key="gemini",
        display_name="Google Gemini",
        default_base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        description="Google Gemini 的 OpenAI 兼容端点（gemini-2.0-flash 等）",
        supports_reasoning=False,
        build_extra_body=_passthrough_extra_body,
        docs_url="https://ai.google.dev/gemini-api/docs/openai",
    ),
    "openai_compatible": ProviderSpec(
        key="openai_compatible",
        display_name="自定义 OpenAI 兼容",
        default_base_url=None,
        description="任意 OpenAI 兼容端点（自托管 vLLM、Ollama、内部代理等）",
        supports_reasoning=False,
        build_extra_body=_passthrough_extra_body,
        notes="必须填写 base_url。",
    ),
}


def get_provider(key: str) -> ProviderSpec:
    spec = PROVIDERS.get((key or "").lower())
    if not spec:
        raise ValueError(f"Unknown LLM provider: {key}. Known: {list(PROVIDERS.keys())}")
    return spec


def list_providers() -> list[dict]:
    """Public, JSON-serializable view of the registry — used by the admin UI."""
    return [
        {
            "key": p.key,
            "display_name": p.display_name,
            "description": p.description,
            "default_base_url": p.default_base_url,
            "supports_reasoning": p.supports_reasoning,
            "api_key_required": p.api_key_required,
            "docs_url": p.docs_url,
            "notes": p.notes,
        }
        for p in PROVIDERS.values()
    ]
