"""Tool models for JSON-based tool system."""
from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey, JSON
from datetime import datetime
from src.models.base import Base


class AdminTool(Base):
    """管理员管理的全局Tool模板."""
    __tablename__ = "admin_tools"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tool_id = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)

    # Tool调用指南
    calling_guide = Column(Text, default="")
    calling_examples = Column(JSON, nullable=False, default=list)

    # 输入输出schema
    input_schema = Column(JSON, nullable=False, default=dict)
    output_schema = Column(JSON, nullable=False, default=dict)

    # 执行配置
    execution = Column(JSON, nullable=False, default=dict)

    # 权限和审批
    requires_approval = Column(Boolean, default=False)
    required_role_level = Column(Integer, default=1)

    # 元数据
    version = Column(String(20), default="1.0")
    enabled = Column(Boolean, default=True)
    is_builtin = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class UserTool(Base):
    """用户私有Tool."""
    __tablename__ = "user_tools"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tool_id = Column(String(100), nullable=False, index=True)

    # 从admin_tool_id复制而来，如果为空则是用户自定义
    admin_tool_id = Column(String(100), nullable=True)

    name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)

    calling_guide = Column(Text, default="")
    calling_examples = Column(JSON, nullable=False, default=list)
    input_schema = Column(JSON, nullable=False, default=dict)
    output_schema = Column(JSON, nullable=False, default=dict)
    execution = Column(JSON, nullable=False, default=dict)

    requires_approval = Column(Boolean, default=False)
    required_role_level = Column(Integer, default=1)

    # 用户可自定义是否启用
    enabled = Column(Boolean, default=True)

    # 来源：admin_assigned, user_created
    source = Column(String(20), default="user_created")

    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        {'sqlite_autoincrement': True},
    )
