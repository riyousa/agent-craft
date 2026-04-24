"""Audit log model for tracking tool usage."""
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, utc_now


class AuditLog(Base):
    """Audit log for tool execution tracking."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    thread_id: Mapped[str] = mapped_column(String(100), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    input_params: Mapped[dict] = mapped_column(JSON, nullable=True)
    output_result: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # success, error, interrupted
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
