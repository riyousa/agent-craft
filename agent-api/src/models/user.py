"""User model for employee information."""
from sqlalchemy import String, Integer, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """Employee/User model."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feishu_open_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=True)
    # role_level: 1=普通员工, 2=管理员, 3=超级管理员
    # is_active: 0=禁用, 1=启用
    # tags: 用户标签列表，如 ["研发", "产品"]
