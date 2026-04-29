"""Tool / skill invocation history.

Per-call rows used by the metrics endpoints surfaced in 工具 / 技能
list views (calls_7d, p95_ms, runs_7d, users_using).

Both tables are write-mostly, append-only logs — read paths only do
windowed aggregations (`WHERE created_at > now() - 7d`). Indexes
favor that pattern: composite (`name`, `created_at desc`) so each tool
or skill row in the list page costs one index lookup + a small range
scan.
"""
from sqlalchemy import Column, String, Integer, DateTime, Index, Text
from src.models.base import Base, utc_now


class ToolInvocation(Base):
    """One row per tool execution dispatched by the agent."""
    __tablename__ = "tool_invocations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # We log by name (slug) rather than by FK because admin / user tool
    # tables are separate and a tool can be migrated between them.
    # Name is what the LLM saw; uniquely identifies the implementation.
    tool_name = Column(String(200), nullable=False, index=True)

    user_id = Column(Integer, nullable=False, index=True)
    thread_id = Column(String(200), nullable=False, index=True)

    # 'success' | 'error' | (future) 'rejected'
    status = Column(String(32), nullable=False, default="success")
    latency_ms = Column(Integer, nullable=False, default=0)
    # Truncated to keep noisy stack traces from bloating the table.
    error = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True,
    )

    __table_args__ = (
        Index("ix_tool_invocations_name_created", "tool_name", "created_at"),
        {"sqlite_autoincrement": True},
    )


class SkillRun(Base):
    """One row per skill execution (skill_<name> dispatched as a tool)."""
    __tablename__ = "skill_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # The bare skill name (no `skill_` prefix that LLM uses for routing).
    skill_name = Column(String(200), nullable=False, index=True)

    user_id = Column(Integer, nullable=False, index=True)
    thread_id = Column(String(200), nullable=False, index=True)

    status = Column(String(32), nullable=False, default="success")
    total_latency_ms = Column(Integer, nullable=False, default=0)
    # Number of underlying tool calls the skill rolled up; populated when
    # the skill orchestrator can report it. For now defaults to 1 since
    # a skill is dispatched as a single tool from the agent's point of
    # view.
    tools_called = Column(Integer, nullable=False, default=1)
    error = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True,
    )

    __table_args__ = (
        Index("ix_skill_runs_name_created", "skill_name", "created_at"),
        {"sqlite_autoincrement": True},
    )
