"""Pydantic schemas for admin management APIs."""
from pydantic import BaseModel, Field
from typing import Optional, Any, List
from datetime import datetime


# ========== Tool Schemas ==========

class ToolParameter(BaseModel):
    """工具参数定义."""
    name: str
    type: str  # string, integer, boolean, array, object
    required: bool = False
    description: str = ""
    default: Any = None
    constraints: dict = Field(default_factory=dict)  # min, max, enum等


class ToolInputSchema(BaseModel):
    """工具输入Schema."""
    parameters: list[ToolParameter] = Field(default_factory=list)


class ToolOutputField(BaseModel):
    """工具输出字段定义."""
    name: str
    type: str
    description: str = ""


class ToolOutputSchema(BaseModel):
    """工具输出Schema."""
    type: str = "object"  # object, list, text
    item_fields: list[ToolOutputField] = Field(default_factory=list)


class ToolExecution(BaseModel):
    """工具执行配置."""
    type: str = "rest_api"  # rest_api, python_function
    config: dict = Field(default_factory=dict)  # HTTP配置或函数引用
    request_mapping: dict = Field(default_factory=dict)  # 请求参数映射
    response_mapping: dict = Field(default_factory=dict)  # 响应字段映射
    function_ref: Optional[str] = None  # Python函数引用


class ToolCallingExample(BaseModel):
    """工具调用示例."""
    scenario: str
    params: dict


class ToolDefinition(BaseModel):
    """完整的工具定义."""
    tool_id: Optional[str] = None
    name: str
    display_name: str
    description: str
    version: str = "1.0"
    calling_guide: str = ""
    calling_examples: list[ToolCallingExample] = Field(default_factory=list)
    input_schema: ToolInputSchema
    output_schema: ToolOutputSchema
    execution: ToolExecution
    requires_approval: bool = False
    required_role_level: int = 1
    enabled: bool = True
    is_builtin: bool = False


class ToolCreateRequest(BaseModel):
    """创建工具请求."""
    tool: ToolDefinition


class ToolPartialUpdate(BaseModel):
    """Partial update for an AdminTool — every field is optional so the
    frontend can PATCH just one attribute (e.g. `enabled`) without
    resubmitting the full definition."""
    name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    calling_guide: Optional[str] = None
    calling_examples: Optional[list[ToolCallingExample]] = None
    input_schema: Optional[ToolInputSchema] = None
    output_schema: Optional[ToolOutputSchema] = None
    execution: Optional[ToolExecution] = None
    requires_approval: Optional[bool] = None
    required_role_level: Optional[int] = None
    enabled: Optional[bool] = None
    is_builtin: Optional[bool] = None


class ToolUpdateRequest(BaseModel):
    """更新工具请求."""
    tool: ToolPartialUpdate


class ToolResponse(BaseModel):
    """工具响应."""
    id: int
    tool_id: str
    name: str
    display_name: str
    description: str
    version: str
    calling_guide: str
    calling_examples: list
    input_schema: dict
    output_schema: dict
    execution: dict
    requires_approval: bool
    required_role_level: int
    enabled: bool
    is_builtin: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserToolResponse(BaseModel):
    """用户工具响应."""
    id: int
    user_id: int
    tool_id: str
    name: str
    display_name: str
    description: str
    calling_guide: str
    calling_examples: list
    input_schema: dict
    output_schema: dict
    execution: dict
    requires_approval: bool
    required_role_level: int
    enabled: bool
    source: str  # admin_assigned, user_created
    admin_tool_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# ========== Skill Schemas ==========

class SkillDefinition(BaseModel):
    """完整的Skill定义."""
    skill_id: Optional[str] = None
    name: str
    display_name: str
    description: str
    category: str  # extraction, analysis, comparison, generation, evaluation, monitoring, prediction
    calling_guide: str = ""
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    prompt_template: str
    required_tools: List[str] = Field(default_factory=list)
    quality_criteria: list[str] = Field(default_factory=list)
    examples: dict = Field(default_factory=dict)
    requires_approval: bool = False
    required_role_level: int = 1
    version: str = "1.0"
    enabled: bool = True
    is_builtin: bool = False


class SkillCreateRequest(BaseModel):
    """创建Skill请求."""
    skill: SkillDefinition


class SkillPartialUpdate(BaseModel):
    """Partial update for an AdminSkill — mirrors ToolPartialUpdate."""
    name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    calling_guide: Optional[str] = None
    input_schema: Optional[dict] = None
    output_schema: Optional[dict] = None
    prompt_template: Optional[str] = None
    required_tools: Optional[List[str]] = None
    quality_criteria: Optional[list[str]] = None
    examples: Optional[dict] = None
    requires_approval: Optional[bool] = None
    required_role_level: Optional[int] = None
    version: Optional[str] = None
    enabled: Optional[bool] = None
    is_builtin: Optional[bool] = None


class SkillUpdateRequest(BaseModel):
    """更新Skill请求."""
    skill: SkillPartialUpdate


class SkillResponse(BaseModel):
    """Skill响应."""
    id: int
    skill_id: str
    name: str
    display_name: str
    description: str
    category: str
    calling_guide: str = ""
    input_schema: dict
    output_schema: dict
    prompt_template: str
    required_tools: List[str] = Field(default_factory=list)
    quality_criteria: list
    examples: dict
    requires_approval: bool = False
    required_role_level: int
    version: str
    enabled: bool
    is_builtin: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserSkillResponse(BaseModel):
    """用户Skill响应."""
    id: int
    user_id: int
    skill_id: str
    name: str
    display_name: str
    description: str
    category: str
    calling_guide: str = ""
    input_schema: dict
    output_schema: dict
    prompt_template: str
    required_tools: List[str] = Field(default_factory=list)
    quality_criteria: list
    examples: dict
    requires_approval: bool = False
    required_role_level: int
    enabled: bool
    source: str  # admin_assigned, user_created
    admin_skill_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# ========== Assignment Schemas ==========

class AssignToolRequest(BaseModel):
    """分配工具给用户请求."""
    user_ids: list[int]
    tool_id: str
    mode: str = "assign"  # "assign" (新下发) or "update" (更新下发)


class AssignSkillRequest(BaseModel):
    """分配Skill给用户请求."""
    user_ids: list[int]
    skill_id: str
    mode: str = "assign"  # "assign" or "update"


class RevokeRequest(BaseModel):
    """撤回工具/技能请求."""
    user_ids: list[int]


class AssignmentResponse(BaseModel):
    """分配响应."""
    success: bool
    message: str
    assigned_count: int
    # Populated by skill-assign when required tools were cascaded onto users.
    tools_inserted: int = 0
    tools_updated: int = 0
    missing_tool_names: List[str] = []


# ========== Admin Auth Schemas ==========

class AdminLoginRequest(BaseModel):
    """管理员登录请求."""
    password: str


# ========== LLM Model Schemas ==========

class LLMModelDefinition(BaseModel):
    """完整的 LLM 模型定义（用于 POST /admin/models）."""
    name: str = Field(..., description="对外稳定的 slug，如 gpt-4o-prod")
    display_name: str
    description: str = ""
    provider: str = Field(..., description="provider key，见 GET /admin/models/providers")
    model: str = Field(..., description="provider 的 model id，如 gpt-4o")
    api_key: str = Field("", description="明文 API key 或 ${ENV_VAR} 占位符")
    base_url: str = Field("", description="留空则用 provider 默认")
    extra_config: dict = Field(default_factory=dict)
    enabled: bool = True
    visible_to_users: bool = True
    is_default: bool = False
    sort_order: int = 0


class LLMModelCreateRequest(BaseModel):
    model_def: LLMModelDefinition = Field(..., alias="model")

    class Config:
        populate_by_name = True


class LLMModelPartialUpdate(BaseModel):
    """PATCH 输入 — 所有字段可选；空字符串的 api_key 表示"不修改"."""
    name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    extra_config: Optional[dict] = None
    enabled: Optional[bool] = None
    visible_to_users: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class LLMModelUpdateRequest(BaseModel):
    model_def: LLMModelPartialUpdate = Field(..., alias="model")

    class Config:
        populate_by_name = True


class LLMModelResponse(BaseModel):
    """管理员视图 — api_key 永远只返回掩码."""
    id: int
    name: str
    display_name: str
    description: str
    provider: str
    model: str
    api_key_masked: str
    base_url: str
    extra_config: dict
    enabled: bool
    visible_to_users: bool
    is_default: bool
    sort_order: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserVisibleModel(BaseModel):
    """用户视图 — 只暴露选择需要的字段."""
    name: str
    display_name: str
    description: str = ""
    provider: str
    supports_reasoning: bool = False
    is_default: bool = False


class LLMModelTestRequest(BaseModel):
    """快速 ping 一个模型 — 可选 prompt，默认走「Hello」."""
    prompt: Optional[str] = None


class AdminLoginResponse(BaseModel):
    """管理员登录响应."""
    success: bool
    message: str
    token: Optional[str] = None
