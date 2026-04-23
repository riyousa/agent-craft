"""Skill models for JSON-based skill system."""
from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey, JSON
from datetime import datetime
from src.models.base import Base


class AdminSkill(Base):
    """管理员管理的全局Skill模板."""
    __tablename__ = "admin_skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_id = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)  # extraction, analysis, comparison, etc.

    # Skill调用指南
    calling_guide = Column(Text, default="")

    # JSON格式的schema定义
    input_schema = Column(JSON, nullable=False, default=dict)
    output_schema = Column(JSON, nullable=False, default=dict)

    # Skill执行的核心prompt（流程定义）
    prompt_template = Column(Text, nullable=False)

    # 依赖的Tools列表（JSON数组，存储tool名称）
    required_tools = Column(JSON, nullable=False, default=list)

    # 质量标准
    quality_criteria = Column(JSON, nullable=False, default=list)

    # 示例
    examples = Column(JSON, nullable=False, default=dict)

    # 权限和审批
    requires_approval = Column(Boolean, default=False)
    required_role_level = Column(Integer, default=1)

    # 元数据
    version = Column(String(20), default="1.0")
    enabled = Column(Boolean, default=True)
    is_builtin = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class UserSkill(Base):
    """用户私有Skill."""
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    skill_id = Column(String(100), nullable=False, index=True)

    # 从admin_skill_id复制而来，如果为空则是用户自定义
    admin_skill_id = Column(String(100), nullable=True)

    name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)

    # Skill调用指南
    calling_guide = Column(Text, default="")

    input_schema = Column(JSON, nullable=False, default=dict)
    output_schema = Column(JSON, nullable=False, default=dict)

    # Skill执行流程（可包含tool占位符）
    prompt_template = Column(Text, nullable=False)

    # 依赖的Tools列表
    required_tools = Column(JSON, nullable=False, default=list)

    quality_criteria = Column(JSON, nullable=False, default=list)
    examples = Column(JSON, nullable=False, default=dict)

    # 权限和审批
    requires_approval = Column(Boolean, default=False)
    required_role_level = Column(Integer, default=1)

    # 用户可自定义是否启用
    enabled = Column(Boolean, default=True)

    # 来源：admin_assigned, user_created
    source = Column(String(20), default="user_created")

    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # 确保同一用户不会有重复的skill_id
    __table_args__ = (
        {'sqlite_autoincrement': True},
    )
