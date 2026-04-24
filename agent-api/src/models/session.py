"""Session model for conversation tracking."""
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, utc_now


class Session(Base):
    """Conversation session model."""

    __tablename__ = "sessions"

    thread_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    last_active: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
    session_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)
