"""add conversation_history aggregates

Per-conversation aggregates surfaced in 对话历史:
  is_starred    — user-toggleable favorite flag (☆ in 对话历史)
  tokens_total  — cumulative LLM token usage across this thread
  tools_called  — count of tool/skill invocations on this thread

See `backend_update.md` § 1 for the rationale and write-side wiring.

Revision ID: 5ff038219ae5
Revises: a8c7f3e9b1d4
Create Date: 2026-04-29 11:24:05.981680
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5ff038219ae5'
down_revision: Union[str, Sequence[str], None] = 'a8c7f3e9b1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversation_history",
        sa.Column(
            "is_starred",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "conversation_history",
        sa.Column(
            "tokens_total",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "conversation_history",
        sa.Column(
            "tools_called",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("conversation_history", "tools_called")
    op.drop_column("conversation_history", "tokens_total")
    op.drop_column("conversation_history", "is_starred")
