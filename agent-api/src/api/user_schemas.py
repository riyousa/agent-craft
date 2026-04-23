"""Pydantic schemas for user APIs."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ========== File Management Schemas ==========

class FileUploadResponse(BaseModel):
    """文件上传响应."""
    id: int
    filename: str
    filepath: str
    file_type: str
    size_bytes: int
    created_at: datetime
    asset_url: Optional[str] = None  # Signed, time-limited URL (only for assets/generated)


class FileListResponse(BaseModel):
    """文件列表响应."""
    id: int
    filename: str
    filepath: str
    file_type: str
    size_bytes: int
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    asset_url: Optional[str] = None  # Signed, time-limited URL (only for assets/generated)


class WorkspaceInfoResponse(BaseModel):
    """工作空间信息响应."""
    id: int
    user_id: int
    workspace_path: str
    max_storage_mb: int
    used_storage_mb: int
    file_count: int


# ========== Conversation History Schemas ==========

class ConversationListItem(BaseModel):
    """对话列表项."""
    id: int
    thread_id: str
    title: Optional[str] = None
    message_count: int
    last_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConversationMessagesResponse(BaseModel):
    """对话消息响应."""
    thread_id: str
    messages: List[dict]
    total_count: int


# ========== Tool Management Schemas ==========

class UserToolCreateRequest(BaseModel):
    """用户创建工具请求."""
    name: str
    display_name: str
    description: str
    calling_guide: str = ""
    calling_examples: List[dict] = Field(default_factory=list)
    input_schema: dict
    output_schema: dict
    execution: dict
    requires_approval: bool = False


class UserToolUpdateRequest(BaseModel):
    """用户更新工具请求."""
    display_name: Optional[str] = None
    description: Optional[str] = None
    calling_guide: Optional[str] = None
    calling_examples: Optional[List[dict]] = None
    input_schema: Optional[dict] = None
    output_schema: Optional[dict] = None
    execution: Optional[dict] = None
    requires_approval: Optional[bool] = None
    enabled: Optional[bool] = None


class UserToolResponse(BaseModel):
    """用户工具响应."""
    id: int
    tool_id: str
    name: str
    display_name: str
    description: str
    calling_guide: str
    calling_examples: List[dict]
    input_schema: dict
    output_schema: dict
    execution: dict
    requires_approval: bool
    enabled: bool
    source: str  # admin_assigned, user_created
    created_at: datetime


# ========== Skill Management Schemas ==========

class UserSkillCreateRequest(BaseModel):
    """用户创建技能请求."""
    name: str
    display_name: str
    description: str
    category: str
    calling_guide: str = ""
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    prompt_template: str
    required_tools: List[str] = Field(default_factory=list)
    quality_criteria: List[str] = Field(default_factory=list)
    examples: dict = Field(default_factory=dict)
    requires_approval: bool = False


class UserSkillUpdateRequest(BaseModel):
    """用户更新技能请求."""
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    calling_guide: Optional[str] = None
    input_schema: Optional[dict] = None
    output_schema: Optional[dict] = None
    prompt_template: Optional[str] = None
    required_tools: Optional[List[str]] = None
    quality_criteria: Optional[List[str]] = None
    examples: Optional[dict] = None
    requires_approval: Optional[bool] = None
    enabled: Optional[bool] = None


class UserSkillResponse(BaseModel):
    """用户技能响应."""
    id: int
    skill_id: str
    name: str
    display_name: str
    description: str
    category: str
    calling_guide: str
    input_schema: dict
    output_schema: dict
    prompt_template: str
    required_tools: List[str]
    quality_criteria: List[str]
    examples: dict
    requires_approval: bool
    enabled: bool
    source: str  # admin_assigned, user_created
    created_at: datetime
