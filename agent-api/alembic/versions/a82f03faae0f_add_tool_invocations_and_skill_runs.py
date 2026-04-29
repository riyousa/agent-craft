"""add tool_invocations and skill_runs

Per-call history tables backing the calls_7d / runs_7d / users_using
/ p95_ms metrics on 工具 / 技能 list views. See `backend_update.md`
§ 2 / § 3.

Revision ID: a82f03faae0f
Revises: 5ff038219ae5
Create Date: 2026-04-29 11:42:14.879576
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a82f03faae0f'
down_revision: Union[str, Sequence[str], None] = '5ff038219ae5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tool_invocations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tool_name", sa.String(length=200), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="success"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_tool_invocations_tool_name", "tool_invocations", ["tool_name"])
    op.create_index("ix_tool_invocations_user_id", "tool_invocations", ["user_id"])
    op.create_index("ix_tool_invocations_thread_id", "tool_invocations", ["thread_id"])
    op.create_index("ix_tool_invocations_created_at", "tool_invocations", ["created_at"])
    op.create_index(
        "ix_tool_invocations_name_created",
        "tool_invocations",
        ["tool_name", "created_at"],
    )

    op.create_table(
        "skill_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("skill_name", sa.String(length=200), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="success"),
        sa.Column(
            "total_latency_ms",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "tools_called",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_skill_runs_skill_name", "skill_runs", ["skill_name"])
    op.create_index("ix_skill_runs_user_id", "skill_runs", ["user_id"])
    op.create_index("ix_skill_runs_thread_id", "skill_runs", ["thread_id"])
    op.create_index("ix_skill_runs_created_at", "skill_runs", ["created_at"])
    op.create_index(
        "ix_skill_runs_name_created",
        "skill_runs",
        ["skill_name", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_skill_runs_name_created", table_name="skill_runs")
    op.drop_index("ix_skill_runs_created_at", table_name="skill_runs")
    op.drop_index("ix_skill_runs_thread_id", table_name="skill_runs")
    op.drop_index("ix_skill_runs_user_id", table_name="skill_runs")
    op.drop_index("ix_skill_runs_skill_name", table_name="skill_runs")
    op.drop_table("skill_runs")

    op.drop_index("ix_tool_invocations_name_created", table_name="tool_invocations")
    op.drop_index("ix_tool_invocations_created_at", table_name="tool_invocations")
    op.drop_index("ix_tool_invocations_thread_id", table_name="tool_invocations")
    op.drop_index("ix_tool_invocations_user_id", table_name="tool_invocations")
    op.drop_index("ix_tool_invocations_tool_name", table_name="tool_invocations")
    op.drop_table("tool_invocations")
