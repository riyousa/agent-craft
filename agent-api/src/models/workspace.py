"""Workspace and file models."""
from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey, BigInteger
from src.models.base import Base, utc_now


class UserWorkspace(Base):
    """用户工作空间."""
    __tablename__ = "user_workspaces"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    workspace_path = Column(String(500), nullable=False)
    max_storage_mb = Column(Integer, default=1000)
    used_storage_mb = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        {'sqlite_autoincrement': True},
    )


class UserFile(Base):
    """用户文件."""
    __tablename__ = "user_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workspace_id = Column(Integer, ForeignKey("user_workspaces.id"), nullable=True)

    filename = Column(String(255), nullable=False)
    filepath = Column(String(500), nullable=False)
    file_type = Column(String(50))
    mime_type = Column(String(100))
    size_bytes = Column(BigInteger, default=0)

    description = Column(Text)
    is_deleted = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        {'sqlite_autoincrement': True},
    )


class ConversationHistory(Base):
    """对话历史记录."""
    __tablename__ = "conversation_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    thread_id = Column(String(200), nullable=False, index=True)

    title = Column(String(200))
    message_count = Column(Integer, default=0)
    last_message = Column(Text)

    # Per-conversation aggregates surfaced in 对话历史:
    # `tokens_total` accumulates `usage.total_tokens` from every LLM call;
    # `tools_called` increments once per tool/skill invocation; `is_starred`
    # is the user-toggleable favorite flag exposed in the history list.
    is_starred = Column(Boolean, default=False, nullable=False)
    tokens_total = Column(BigInteger, default=0, nullable=False)
    tools_called = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        {'sqlite_autoincrement': True},
    )
