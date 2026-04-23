"""Turn-scoped tool/skill cache for LangGraph nodes.

A single user message can trigger multiple graph nodes (call_model →
approval check → execute_tools) plus multi-round tool calls. Without a
cache each node re-queries UserTool / UserSkill tables and rebuilds the
StructuredTool wrappers, multiplying DB sessions by 5+ per turn.

This module provides a per-thread, TTL-bounded cache. It intentionally
lives outside LangGraph state because StructuredTool instances contain
closures and async callables that can't be serialized into a checkpoint.

Cache semantics:
- Key: (thread_id, user_id)
- TTL: CACHE_TTL_SECONDS (default 30s, one user turn)
- Invalidation: turn-end via `clear(thread_id)` or TTL expiry
- Safety: never shared across user_ids, so admin-level permission changes
  affecting another user cannot leak through

Consistency trade-off: if an admin edits the user's tools mid-turn, the
change surfaces on the next message (after cache expiry or clear).
"""
import time
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession


CACHE_TTL_SECONDS = 30

_CacheKey = Tuple[str, int]


class CacheEntry:
    __slots__ = (
        "user_tools", "user_skills", "approval_tool_names", "approval_skill_names",
        "skill_required_tools", "expires_at",
    )

    def __init__(
        self,
        user_tools,
        user_skills,
        approval_tool_names,
        approval_skill_names,
        skill_required_tools,
        expires_at,
    ):
        self.user_tools = user_tools
        self.user_skills = user_skills
        self.approval_tool_names = approval_tool_names
        self.approval_skill_names = approval_skill_names
        # Map of bare skill name (no "skill_" prefix) → list of required tool names.
        # Consumed by the approval check so an approved skill's tools inherit
        # its approval without asking the user again.
        self.skill_required_tools: Dict[str, List[str]] = skill_required_tools
        self.expires_at = expires_at


_cache: Dict[_CacheKey, CacheEntry] = {}


async def get_entry(
    user_id: int,
    user_info: dict,
    available_system_tools: List[Any],
    thread_id: Optional[str],
    session: AsyncSession,
    *,
    now: Optional[float] = None,
) -> CacheEntry:
    """Return the full cache entry (tools + skills + approval name sets).

    One session on cache miss; zero on hit.
    """
    from src.tools.user_tools import get_user_tools, get_tools_requiring_approval
    from src.skills.user_skills import get_user_skills, get_skills_requiring_approval

    _now = now if now is not None else time.time()
    key: Optional[_CacheKey] = (thread_id, user_id) if thread_id else None

    if key is not None:
        cached = _cache.get(key)
        if cached is not None and cached.expires_at > _now:
            return cached
        if cached is not None:
            _cache.pop(key, None)

    user_tools = await get_user_tools(user_id, session, user_info)
    available_tools_for_skills = available_system_tools + user_tools
    user_skills = await get_user_skills(user_id, session, user_info, available_tools_for_skills)
    approval_tool_names = set(await get_tools_requiring_approval(user_id, session))
    approval_skill_names = {f"skill_{n}" for n in await get_skills_requiring_approval(user_id, session)}

    # Load the required_tools map for this user's skills (for cascaded approval).
    from sqlalchemy import select as _select
    from src.models import UserSkill
    skill_rows = (
        await session.execute(
            _select(UserSkill.name, UserSkill.required_tools).where(UserSkill.user_id == user_id)
        )
    ).all()
    skill_required_tools: Dict[str, List[str]] = {
        name: list(req_tools or []) for name, req_tools in skill_rows
    }

    entry = CacheEntry(
        user_tools,
        user_skills,
        approval_tool_names,
        approval_skill_names,
        skill_required_tools,
        _now + CACHE_TTL_SECONDS,
    )
    if key is not None:
        _cache[key] = entry
    return entry


async def get_user_tools_and_skills(
    user_id: int,
    user_info: dict,
    available_system_tools: List[Any],
    thread_id: Optional[str],
    session: AsyncSession,
    *,
    now: Optional[float] = None,
) -> Tuple[List[Any], List[Any]]:
    entry = await get_entry(user_id, user_info, available_system_tools, thread_id, session, now=now)
    return entry.user_tools, entry.user_skills


def clear(thread_id: Optional[str] = None, user_id: Optional[int] = None) -> None:
    """Drop cache entries. Pass nothing to clear all.

    Useful when an admin mutates a user's tools/skills and wants the next
    turn to pick up the change immediately.
    """
    if thread_id is None and user_id is None:
        _cache.clear()
        return
    for k in list(_cache.keys()):
        t_id, u_id = k
        if (thread_id is None or t_id == thread_id) and (user_id is None or u_id == user_id):
            _cache.pop(k, None)


def size() -> int:
    return len(_cache)
