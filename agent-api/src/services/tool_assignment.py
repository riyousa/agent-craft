"""Helpers for assigning/updating admin tools onto users.

Extracted so `admin_tools.assign_tool_to_users` and the skill-assignment
cascade both go through the same upsert logic.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Iterable, List


# Matches `{{tool:tool_name}}` or `{{tool:tool_name(...)}}` in a prompt template.
_TOOL_REF_PATTERN = re.compile(r"\{\{\s*tool:([A-Za-z0-9_]+)")


def extract_tool_names_from_template(prompt_template: str) -> List[str]:
    """Pull tool names out of a skill's prompt_template.

    Used as a fallback when `required_tools` wasn't populated at skill
    creation time (legacy skills, or skills created via a path that
    skipped the frontend extraction step).
    """
    if not prompt_template:
        return []
    seen: List[str] = []
    for m in _TOOL_REF_PATTERN.finditer(prompt_template):
        name = m.group(1)
        if name not in seen:
            seen.append(name)
    return seen


def resolve_required_tools(admin_skill) -> List[str]:
    """Return the effective required tool names for an admin skill.

    Prefers the explicit `required_tools` column, falls back to parsing
    the prompt template so we never miss a dependency on legacy rows.
    """
    explicit = list(getattr(admin_skill, "required_tools", []) or [])
    if explicit:
        return [t for t in explicit if t]
    return extract_tool_names_from_template(getattr(admin_skill, "prompt_template", "") or "")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.models import AdminTool, UserTool
from src.utils.logger import api_logger


@dataclass
class ToolSyncResult:
    inserted: int = 0
    updated: int = 0
    missing_tool_names: List[str] = None  # admin tools named in required_tools but not found

    def __post_init__(self):
        if self.missing_tool_names is None:
            self.missing_tool_names = []

    @property
    def touched(self) -> int:
        return self.inserted + self.updated


async def upsert_user_tool_from_admin(
    db: AsyncSession, user_id: int, admin_tool: AdminTool
) -> str:
    """Insert or update a UserTool row from an AdminTool template.

    Returns "inserted", "updated", or "noop" (if caller passed an
    already-up-to-date row — currently always insert/update).
    """
    existing_result = await db.execute(
        select(UserTool).where(
            UserTool.user_id == user_id,
            (UserTool.tool_id == admin_tool.tool_id) | (UserTool.name == admin_tool.name),
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing is None:
        db.add(UserTool(
            user_id=user_id,
            tool_id=admin_tool.tool_id,
            admin_tool_id=admin_tool.tool_id,
            name=admin_tool.name,
            display_name=admin_tool.display_name,
            description=admin_tool.description,
            calling_guide=admin_tool.calling_guide,
            calling_examples=copy.deepcopy(admin_tool.calling_examples),
            input_schema=copy.deepcopy(admin_tool.input_schema),
            output_schema=copy.deepcopy(admin_tool.output_schema),
            execution=copy.deepcopy(admin_tool.execution),
            requires_approval=admin_tool.requires_approval,
            required_role_level=admin_tool.required_role_level,
            enabled=True,
            source="admin_assigned",
        ))
        return "inserted"

    existing.name = admin_tool.name
    existing.display_name = admin_tool.display_name
    existing.description = admin_tool.description
    existing.calling_guide = admin_tool.calling_guide
    existing.calling_examples = copy.deepcopy(admin_tool.calling_examples)
    existing.input_schema = copy.deepcopy(admin_tool.input_schema)
    existing.output_schema = copy.deepcopy(admin_tool.output_schema)
    existing.execution = copy.deepcopy(admin_tool.execution)
    existing.requires_approval = admin_tool.requires_approval
    existing.required_role_level = admin_tool.required_role_level
    for col in ("calling_examples", "input_schema", "output_schema", "execution"):
        flag_modified(existing, col)
    return "updated"


async def sync_required_tools_for_users(
    db: AsyncSession,
    user_ids: Iterable[int],
    required_tool_names: Iterable[str],
) -> ToolSyncResult:
    """For each user_id, upsert every admin tool named in required_tool_names.

    Any tool name that has no matching AdminTool row is reported back in
    `missing_tool_names` so the caller can surface a warning rather than
    silently skipping it.
    """
    result = ToolSyncResult()
    raw_names = [n for n in (required_tool_names or []) if n]
    if not raw_names:
        return result

    # Built-in tools (e.g. `get_current_time`, `render_chart`) are bound to the
    # LLM directly from the in-process registry — they have no AdminTool row
    # and don't need per-user provisioning. Strip them up-front so they don't
    # show up as bogus "missing dependencies" in the assign response.
    from src.tools.registry import get_builtin_tool_names
    builtin_names = set(get_builtin_tool_names())
    names = [n for n in raw_names if n not in builtin_names]
    if not names:
        return result

    tools_result = await db.execute(select(AdminTool).where(AdminTool.name.in_(names)))
    admin_tools = {t.name: t for t in tools_result.scalars().all()}

    api_logger.info(
        f"[sync_required_tools] requested_names={raw_names!r} "
        f"after_builtin_filter={names!r} "
        f"found_in_admin_tools={sorted(admin_tools.keys())!r}"
    )

    result.missing_tool_names = sorted(set(names) - set(admin_tools.keys()))
    if result.missing_tool_names:
        api_logger.warning(
            f"[sync_required_tools] missing admin tools: {result.missing_tool_names}"
        )

    for user_id in user_ids:
        for _name, admin_tool in admin_tools.items():
            action = await upsert_user_tool_from_admin(db, user_id, admin_tool)
            api_logger.info(
                f"[sync_required_tools] user_id={user_id} tool={admin_tool.name!r} action={action}"
            )
            if action == "inserted":
                result.inserted += 1
            elif action == "updated":
                result.updated += 1

    return result
