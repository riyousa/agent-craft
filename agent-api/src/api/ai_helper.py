"""AI Helper API for tool configuration assistance."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from src.db import get_db
from src.agent.llm import get_llm
from src.utils.logger import api_logger
from src.skills.utils import extract_required_tools, check_requires_approval
from typing import List
import json

router = APIRouter(prefix="/ai-helper", tags=["ai-helper"])


class AIHelperRequest(BaseModel):
    """Request model for AI helper."""
    description: str


class AIHelperResponse(BaseModel):
    """Response model for AI helper."""
    tool_config: dict
    explanation: str


SYSTEM_PROMPT = """You are an AI assistant that helps users configure API tools. Given a user's description of an API endpoint, parse it and generate a valid tool configuration in JSON format.

The tool configuration should follow this structure:
{
  "name": "tool_name_in_snake_case",
  "display_name": "Display Name",
  "description": "Brief description of what this tool does",
  "calling_guide": "When to use this tool and how",
  "input_schema": {
    "parameters": [
      {
        "name": "param_name",
        "type": "string|integer|number|boolean|array",
        "required": true|false,
        "description": "Parameter description"
      }
    ]
  },
  "output_schema": {
    "type": "list|object",
    "item_fields": [
      {
        "name": "field_name",
        "type": "string|integer|number|boolean|array|object",
        "description": "Field description"
      }
    ]
  },
  "execution": {
    "type": "rest_api",
    "config": {
      "method": "GET|POST|PUT|DELETE|PATCH",
      "endpoint": "https://api.example.com/endpoint",
      "headers": {
        "Content-Type": "application/json"
      },
      "auth": {
        "type": "none|bearer_token|api_key|basic",
        "env_key": "ENV_VARIABLE_NAME",
        "header_name": "X-Api-Key"
      },
      "timeout": 10,
      "retry": {
        "max_attempts": 3,
        "backoff_ms": 1000
      }
    },
    "polling": {
      "enabled": false,
      "status_endpoint": "https://api.example.com/status/{{task_id}}",
      "task_id_path": "task_id",
      "status_field": "status",
      "completed_value": "completed",
      "failed_value": "failed",
      "result_path": "",
      "interval_seconds": 5,
      "max_attempts": 60
    },
    "request_mapping": {},
    "response_mapping": {
      "root_path": "data",
      "field_mapping": {}
    }
  },
  "requires_approval": false,
  "enabled": true
}

Important notes:
1. For endpoint, ALWAYS use {{param_name}} placeholders for every parameter value — both path segments and query string values. Example: if the user provides a sample curl `GET https://api.x.com/foo?mobile=18684023570&city=Beijing`, the endpoint MUST be `https://api.x.com/foo?mobile={{mobile}}&city={{city}}`, NEVER the literal sample values. The sample values are examples only — they must NOT appear in the stored endpoint.
2. ⛔ FORBIDDEN: Do NOT copy concrete example values from the user's curl/description into `endpoint`, `headers`, `request_mapping`, or parameter `default` fields. Sample values like specific phone numbers, IDs, tokens, city names etc. belong in documentation, not in the tool config. Leaving them in makes the LLM think the param is pre-filled and it will call the tool with empty args.
3. ⛔ FORBIDDEN: Do NOT set a `default` on a parameter unless the user explicitly says "default to X" or the API documentation explicitly defines a default. Missing `default` is correct and preferred.
4. For headers and request_mapping, environment variables use ${ENV_VAR} syntax
5. For request_mapping, parameter references use {{param_name}} syntax
6. User info references use ${user.id}, ${user.username}, ${user.name}, ${user.email}, ${user.role_level}
7. For response_mapping.root_path, specify the JSON path to the data (e.g., "data", "result.items", "data.users")
8. Set auth.type to "none" if no authentication is mentioned
9. Default retry to 3 attempts
10. Infer parameter types from context. Mark parameters as `required: true` by default unless the user explicitly says a parameter is optional.
11. Parameter `description` must clearly describe what the caller needs to provide (meaning, format, example). A good description is what tells the LLM to extract the value from the user's message before calling.
12. For async APIs (video generation, image generation, etc.), set polling.enabled=true and configure status_endpoint, task_id_path, status_field, completed_value, failed_value, result_path, interval_seconds, max_attempts
13. polling.status_endpoint uses {{task_id}} placeholder for the task ID
14. polling.task_id_path is the JSON path in the initial response to extract the task ID
15. polling.result_path is the JSON path in the polling response to extract the final result

Examples:
User: "I need to query IP address location. The API is https://api.ipapi.com/ip/{ip}?access_key=MY_KEY. It returns JSON with country, city, region fields under a 'location' object."

Response:
{
  "name": "query_ip_location",
  "display_name": "Query IP Location",
  "description": "Query geographical location information for an IP address",
  "calling_guide": "Use this tool when you need to find the geographical location (country, city, region) of an IP address",
  "input_schema": {
    "parameters": [
      {
        "name": "ip",
        "type": "string",
        "required": true,
        "description": "The IP address to query"
      }
    ]
  },
  "output_schema": {
    "type": "object",
    "item_fields": [
      {
        "name": "country",
        "type": "string",
        "description": "Country name"
      },
      {
        "name": "city",
        "type": "string",
        "description": "City name"
      },
      {
        "name": "region",
        "type": "string",
        "description": "Region name"
      }
    ]
  },
  "execution": {
    "type": "rest_api",
    "config": {
      "method": "GET",
      "endpoint": "https://api.ipapi.com/ip/{{ip}}?access_key=${IPAPI_ACCESS_KEY}",
      "headers": {
        "Content-Type": "application/json"
      },
      "auth": {
        "type": "none"
      },
      "timeout": 10,
      "retry": {
        "max_attempts": 3,
        "backoff_ms": 1000
      }
    },
    "request_mapping": {},
    "response_mapping": {
      "root_path": "location",
      "field_mapping": {}
    }
  },
  "requires_approval": false,
  "enabled": true
}

IMPORTANT: All display_name, description, calling_guide and explanation fields MUST be in Chinese (中文).

Now parse the user's API description and return valid JSON configuration."""


@router.post("/parse-tool-config", response_model=AIHelperResponse)
async def parse_tool_config(
    request: AIHelperRequest,
    db: AsyncSession = Depends(get_db),
):
    """Parse natural language API description into tool configuration.

    Args:
        request: User's description of the API
        db: Database session

    Returns:
        Parsed tool configuration and explanation
    """
    try:
        api_logger.info(f"AI Helper: Parsing tool config from description: {request.description[:100]}...")

        # Get LLM instance (non-streaming + larger token budget for full JSON output)
        llm = await get_llm(streaming=False, max_tokens=8000, for_user=False)

        # Create prompt
        user_prompt = f"""Parse this API description into a valid tool configuration:

{request.description}

Return your response in this exact JSON format:
{{
  "config": {{ ... complete tool configuration ... }},
  "explanation": "Brief explanation of what you configured and any assumptions made"
}}"""

        from langchain_core.messages import SystemMessage, HumanMessage
        lc_messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt)
        ]

        response = await llm.ainvoke(lc_messages)
        response_text = response.content

        api_logger.debug(f"LLM Response: {response_text[:500]}...")

        # Parse JSON response
        try:
            # Try to extract JSON from markdown code blocks if present
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()

            parsed = json.loads(response_text)

            if "config" not in parsed or "explanation" not in parsed:
                raise ValueError("Response missing 'config' or 'explanation' fields")

            api_logger.info("Successfully parsed tool configuration")

            return AIHelperResponse(
                tool_config=parsed["config"],
                explanation=parsed["explanation"]
            )

        except json.JSONDecodeError as e:
            api_logger.error(f"Failed to parse JSON from LLM response: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"AI生成的配置格式错误: {str(e)}"
            )

    except Exception as e:
        api_logger.error(f"AI Helper error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"AI助手处理失败: {str(e)}"
        )


# ========== Skill Configuration Helper ==========


class AvailableToolInfo(BaseModel):
    """可用Tool信息."""
    name: str
    display_name: str
    description: str
    requires_approval: bool = False
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)


class SkillHelperRequest(BaseModel):
    """Skill配置助手请求."""
    description: str
    available_tools: List[AvailableToolInfo] = Field(default_factory=list)


class SkillConfigResponse(BaseModel):
    """Skill配置响应."""
    name: str
    display_name: str
    description: str
    calling_guide: str
    category: str
    prompt_template: str
    input_schema: dict
    output_schema: dict
    required_tools: List[str]
    requires_approval: bool
    quality_criteria: List[str] = Field(default_factory=list)
    examples: dict = Field(default_factory=dict)


class SkillHelperResponse(BaseModel):
    """Skill助手响应."""
    skill_config: SkillConfigResponse
    suggested_tools: List[str]
    requires_approval: bool
    explanation: str


SKILL_SYSTEM_PROMPT = """You are an AI assistant that helps users create Skill configurations. A Skill is a workflow that orchestrates multiple Tools to accomplish complex tasks.

Given a user's description of what they want to achieve, generate a complete Skill configuration including:
1. A prompt_template with placeholder syntax for Tool calls
2. Input and output schemas
3. List of required Tools
4. Quality criteria

# Placeholder Syntax

Use these placeholder types in prompt_template:

1. **Input Parameter**: {{input.param_name}}
   - References the Skill's input parameters

2. **Tool Call**: {{tool:tool_name(arg1="value", arg2="{{input.x}}")}}
   - Executes a specific Tool
   - Supports nested parameter references

3. **Tool Result**: {{result.tool_name}} or {{result.tool_name.field_name}}
   - {{result.tool_name}} references the entire result (useful for lists)
   - {{result.tool_name.field_name}} references a specific field
   - Supports nested field access

# Example Workflow

```
步骤1: 查询用户信息
{{tool:query_database(table="users", filter="id={{input.user_id}}")}}

步骤2: 分析用户行为
{{tool:analyze_behavior(user_data="{{result.query_database}}")}}

步骤3: 生成报告
基于分析结果 {{result.analyze_behavior.summary}}，
用户活跃度为 {{result.analyze_behavior.activity_score}}
```

When a Tool returns a list and you need the user to select from it, describe the display format and selection logic in natural language — the AI agent will handle formatting at runtime. Do NOT use loops or iteration syntax.

# Response Format

Return your response in this JSON format:
{
  "skill_config": {
    "name": "skill_name_in_snake_case",
    "display_name": "Skill Display Name",
    "description": "Brief description of what this skill does",
    "calling_guide": "When to use this skill and how it helps",
    "category": "analysis|extraction|comparison|automation|reporting",
    "prompt_template": "Multi-step workflow with {{tool:...}} placeholders",
    "input_schema": {
      "parameters": [
        {
          "name": "param_name",
          "type": "string|integer|number|boolean|array|object",
          "required": true|false,
          "description": "Parameter description"
        }
      ]
    },
    "output_schema": {
      "type": "object|list|string",
      "fields": [
        {
          "name": "field_name",
          "type": "string|integer|number|boolean|array|object",
          "description": "Field description"
        }
      ]
    },
    "required_tools": ["tool1", "tool2"],
    "requires_approval": false,
    "quality_criteria": [
      "质量标准1",
      "质量标准2"
    ],
    "examples": {
      "example1": {
        "input": {...},
        "output": {...}
      }
    }
  },
  "suggested_tools": ["tool1", "tool2"],
  "requires_approval": false,
  "explanation": "Brief explanation of the workflow design and any assumptions made"
}

# Important Notes

1. Use only the Tools from the available_tools list provided by the user
2. If a required Tool is not available, suggest alternatives or explain what's missing
3. Set requires_approval to true if ANY of the used Tools requires approval
4. Design the prompt_template as a clear, step-by-step workflow
5. Use descriptive Chinese text for workflow steps
6. Ensure placeholder syntax is correct
7. Make input_schema match the {{input.xxx}} references in prompt_template
8. Categories: analysis (分析), extraction (提取), comparison (对比), automation (自动化), reporting (报告生成)
9. Quality criteria should be specific and measurable
10. IMPORTANT: All display_name, description, calling_guide, quality_criteria and explanation fields MUST be in Chinese (中文)

# CRITICAL: Forbidden Syntax

NEVER use Jinja2 or any template engine syntax in prompt_template. The following are ALL FORBIDDEN:
- {% for %}, {% endfor %}, {% if %}, {% endif %} (Jinja2 control flow)
- {{loop.index}}, {{loop.index0}} (Jinja2 loop variables)
- {{item.xxx}} (Jinja2 iteration variables)
- Any syntax not matching the three placeholder types: {{tool:...}}, {{input.xxx}}, {{result.xxx.yyy}}

Only these three placeholder types are supported:
- {{input.param_name}} — input parameters
- {{tool:tool_name(args)}} — tool calls
- {{result.tool_name.field_name}} — tool result references

When a Tool returns a list of items:
- Reference the entire list result using {{result.tool_name}}, or a specific field using {{result.tool_name.field_name}}
- DO NOT attempt to iterate/loop over results with for/endfor
- Write natural language instructions telling the AI agent how to format and present list data at runtime
- The AI agent will read the tool result and format it as a numbered list automatically

# Handling List Results and User Selection

When a workflow involves querying a list, letting the user select, and then acting on the selection, structure it as follows:

Example — product quota modification workflow:
```
步骤1：查询匹配的产品配额信息
{{tool:query_product_total_quota(proName={{input.product_name_tokens}}, province={{input.province}})}}

步骤2：展示查询结果供用户选择
请将 {{result.query_product_total_quota}} 的查询结果以编号列表形式展示给用户，每项显示产品名称和当前配额，格式如：
1. 产品A — 当前配额: 100
2. 产品B — 当前配额: 200
然后询问用户需要修改哪个产品的序号。

步骤3：根据用户选择的产品调用修改配额接口
用户选择后，从步骤1的查询结果中取出对应项的id（value字段），调用修改接口：
{{tool:update_product_total_quota(id=<用户选择的产品id>, quota={{input.new_quota}})}}

步骤4：验证修改结果
根据 {{result.update_product_total_quota.status}} 判断：
- 如果成功，告知用户修改结果：{{result.update_product_total_quota.message}}
- 如果失败，告知用户错误信息：{{result.update_product_total_quota.errorInfo}}
```

Key points for list handling:
- Use {{result.tool_name}} to reference the entire result (including lists)
- Describe the display format in natural language (the AI agent will follow these instructions)
- For user selection steps, describe how to extract the needed field from the selected item
- Use {{result.tool_name.field}} to reference specific fields of a subsequent tool's result"""


@router.post("/parse-skill-config", response_model=SkillHelperResponse)
async def parse_skill_config(
    request: SkillHelperRequest,
    db: AsyncSession = Depends(get_db),
):
    """Parse natural language description into Skill configuration.

    Args:
        request: User's description and available tools
        db: Database session

    Returns:
        Parsed skill configuration with tool dependencies
    """
    try:
        api_logger.info(f"Skill Helper: Parsing skill from description: {request.description[:100]}...")

        # Get LLM instance (non-streaming + larger token budget: skill configs with long
        # prompt_templates easily exceed 2000 tokens and get truncated mid-JSON-string)
        llm = await get_llm(streaming=False, max_tokens=8000, for_user=False)

        # Format available tools for the prompt (include input/output schemas)
        tools_info_parts = []
        for tool in request.available_tools:
            parts = [f"### {tool.name} ({tool.display_name})"]
            parts.append(f"描述: {tool.description}")
            parts.append(f"需要审批: {'是' if tool.requires_approval else '否'}")
            if tool.input_schema and tool.input_schema.get("parameters"):
                params_desc = []
                for p in tool.input_schema["parameters"]:
                    req = "必填" if p.get("required") else "可选"
                    params_desc.append(f"  - {p['name']} ({p.get('type', 'string')}, {req}): {p.get('description', '')}")
                parts.append("输入参数:\n" + "\n".join(params_desc))
            if tool.output_schema:
                out_type = tool.output_schema.get("type", "object")
                fields = tool.output_schema.get("item_fields", [])
                if fields:
                    fields_desc = [f"  - {f['name']} ({f.get('type', 'string')}): {f.get('description', '')}" for f in fields]
                    parts.append(f"返回结果 (type={out_type}):\n" + "\n".join(fields_desc))
                else:
                    parts.append(f"返回结果类型: {out_type}")
            tools_info_parts.append("\n".join(parts))
        tools_info = "\n\n".join(tools_info_parts)

        # Create prompt
        user_prompt = f"""根据以下需求创建Skill配置:

需求描述:
{request.description}

可用的Tools:
{tools_info if tools_info else "无可用Tools"}

请返回完整的Skill配置JSON。确保:
1. 只使用上述可用的Tools
2. prompt_template使用正确的占位符语法
3. 如果任一Tool需要审批，设置requires_approval为true
4. 提供清晰的步骤说明"""

        # Call LLM
        from langchain_core.messages import SystemMessage, HumanMessage
        lc_messages = [
            SystemMessage(content=SKILL_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt)
        ]

        response = await llm.ainvoke(lc_messages)
        response_text = response.content

        api_logger.debug(f"LLM Response: {response_text[:500]}...")

        # Parse JSON response
        try:
            # Extract JSON from markdown code blocks if present
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()

            parsed = json.loads(response_text)

            # Validate response structure
            if "skill_config" not in parsed:
                raise ValueError("Response missing 'skill_config' field")

            skill_config = parsed["skill_config"]
            explanation = parsed.get("explanation", "AI生成的Skill配置")

            # Extract required tools from prompt_template
            prompt_template = skill_config.get("prompt_template", "")
            extracted_tools = extract_required_tools(prompt_template)

            # Update required_tools if not provided or empty
            if not skill_config.get("required_tools"):
                skill_config["required_tools"] = extracted_tools

            # Build tool approval map
            tool_approval_map = {
                tool.name: tool.requires_approval
                for tool in request.available_tools
            }

            # Check if approval is required
            requires_approval = check_requires_approval(
                skill_config["required_tools"],
                tool_approval_map
            )

            # Override requires_approval based on tool dependencies
            skill_config["requires_approval"] = requires_approval

            # Build response
            skill_config_obj = SkillConfigResponse(**skill_config)

            api_logger.info(f"Successfully parsed skill configuration: {skill_config['name']}")

            return SkillHelperResponse(
                skill_config=skill_config_obj,
                suggested_tools=extracted_tools,
                requires_approval=requires_approval,
                explanation=explanation
            )

        except json.JSONDecodeError as e:
            api_logger.error(f"Failed to parse JSON from LLM response: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"AI生成的配置格式错误: {str(e)}"
            )
        except Exception as e:
            api_logger.error(f"Failed to validate skill config: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"配置验证失败: {str(e)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        api_logger.error(f"Skill Helper error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"AI助手处理失败: {str(e)}"
        )
