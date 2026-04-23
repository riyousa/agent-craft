"""认证相关的Pydantic schemas."""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime


class UserRegisterRequest(BaseModel):
    """用户注册请求."""
    phone: str = Field(..., min_length=11, max_length=11, description="手机号")
    password: str = Field(..., min_length=6, max_length=50, description="密码")
    name: str = Field(..., min_length=1, max_length=100, description="姓名")
    email: Optional[EmailStr] = Field(None, description="邮箱")


class UserLoginRequest(BaseModel):
    """用户登录请求."""
    phone: str = Field(..., description="手机号")
    password: str = Field(..., description="密码")


class TokenResponse(BaseModel):
    """Token响应."""
    access_token: str = Field(..., description="访问令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    user: "UserInfoResponse" = Field(..., description="用户信息")


class UserInfoResponse(BaseModel):
    """用户信息响应."""
    id: int
    name: str
    phone: str
    email: Optional[str] = None
    role_level: int
    is_active: bool
    tags: Optional[List[str]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    """修改密码请求."""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=6, max_length=50, description="新密码")
