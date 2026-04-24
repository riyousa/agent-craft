"""Make all created_at / updated_at / timestamp / last_active columns tz-aware

Reason: previous schema stored naive datetimes. The application now writes
tz-aware UTC instants and Pydantic serializes them with `+00:00`, so the
columns must be `TIMESTAMP WITH TIME ZONE` to round-trip correctly on
PostgreSQL. Existing values are interpreted as UTC (the container TZ),
matching what was written.

Revision ID: a8c7f3e9b1d4
Revises: 9c1d4f7a2b3e
Create Date: 2026-04-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c7f3e9b1d4'
down_revision: Union[str, Sequence[str], None] = '9c1d4f7a2b3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column) pairs that hold timestamps. Listed explicitly rather than
# discovered via reflection so the migration is reviewable / reproducible
# and doesn't depend on import-time model state.
_TIMESTAMP_COLS: list[tuple[str, str]] = [
    ("users", "created_at"),
    ("users", "updated_at"),
    ("api_keys", "created_at"),
    ("api_keys", "updated_at"),
    ("admin_tools", "created_at"),
    ("admin_tools", "updated_at"),
    ("user_tools", "created_at"),
    ("user_tools", "updated_at"),
    ("admin_skills", "created_at"),
    ("admin_skills", "updated_at"),
    ("user_skills", "created_at"),
    ("user_skills", "updated_at"),
    ("user_workspaces", "created_at"),
    ("user_workspaces", "updated_at"),
    ("user_files", "created_at"),
    ("user_files", "updated_at"),
    ("conversation_history", "created_at"),
    ("conversation_history", "updated_at"),
    ("audit_logs", "timestamp"),
    ("sessions", "last_active"),
    ("llm_models", "created_at"),
    ("llm_models", "updated_at"),
]


def upgrade() -> None:
    # SQLite stores no real type info — running ALTER COLUMN there is a no-op
    # (and SQLAlchemy's batch_alter would rebuild every table just to flip a
    # type marker that the engine ignores). PostgreSQL is where this matters.
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table, column in _TIMESTAMP_COLS:
        op.execute(
            f'ALTER TABLE {table} ALTER COLUMN "{column}" '
            f'TYPE TIMESTAMP WITH TIME ZONE '
            # Existing naive values were written by `datetime.now()` inside a
            # UTC container, so re-interpret them as UTC.
            f'USING "{column}" AT TIME ZONE \'UTC\''
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table, column in _TIMESTAMP_COLS:
        op.execute(
            f'ALTER TABLE {table} ALTER COLUMN "{column}" '
            f'TYPE TIMESTAMP WITHOUT TIME ZONE '
            f'USING "{column}" AT TIME ZONE \'UTC\''
        )
