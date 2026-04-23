"""Pydantic schemas for API requests and responses."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ChatRequest(BaseModel):
    """Request schema for /chat endpoint."""
    thread_id: str = Field(..., description="Thread ID for conversation isolation")
    message: str = Field(..., description="User message")
    user_info: Optional[dict] = Field(default=None, description="Deprecated — ignored server-side. Identity derived from Authorization header.")
    file_urls: list = Field(default_factory=list, description="Optional file URLs to send with message")
    checkpoint_id: str = Field(default="", description="Optional checkpoint ID to fork from (for rollback)")
    model_id: Optional[str] = Field(default=None, description="LLM model name to pin for this call. If unset, uses the default model.")


class ChatResponse(BaseModel):
    """Response schema for /chat endpoint."""
    thread_id: str
    response: str
    status: str = Field(default="success")
    requires_approval: bool = Field(default=False)
    approval_details: Optional[list] = Field(default=None)


class CallbackRequest(BaseModel):
    """Request schema for /callback endpoint (e.g., Feishu button clicks)."""
    thread_id: str
    action: str = Field(..., description="Action type (approve/reject)")
    callback_data: Optional[dict] = None


class CallbackResponse(BaseModel):
    """Response schema for /callback endpoint."""
    thread_id: str
    status: str
    message: str
    new_messages: Optional[list[dict]] = None  # New messages after approval execution


class HistoryMessage(BaseModel):
    """Schema for a single message in history."""
    role: str  # user, assistant, system
    content: str
    timestamp: Optional[datetime] = None
    tool_calls: Optional[list] = None


class HistoryResponse(BaseModel):
    """Response schema for /history endpoint."""
    thread_id: str
    messages: list[HistoryMessage]
    total_count: int


class HealthResponse(BaseModel):
    """Response schema for health check."""
    status: str
    version: str = "1.0.0"
