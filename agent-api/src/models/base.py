"""Base database model."""
from datetime import datetime, timezone
from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    """Timezone-aware UTC `now()` — single source of truth for all model
    defaults / onupdate hooks.

    Reason: `datetime.now()` returns a naive datetime that gets serialized
    by Pydantic without a timezone marker, which the browser then parses as
    local time (off by N hours for non-UTC clients). Using a tz-aware UTC
    instant + `DateTime(timezone=True)` columns end-to-end means the JSON
    response carries `+00:00` and the frontend renders correctly without
    any client-side workaround.
    """
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps (UTC, tz-aware)."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
