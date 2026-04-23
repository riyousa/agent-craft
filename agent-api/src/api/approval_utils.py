"""Shared approval-details extraction for /chat and /chat/stream.

Both endpoints need to inspect the LangGraph state snapshot to build
the tool-call details shown to the user (or API caller) when a tool
or skill triggers an interrupt.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.tool import UserTool
from src.utils.logger import api_logger


async def extract_approval_details(
    messages: list,
    user_id: int | None,
    db: AsyncSession,
) -> Optional[List[Dict[str, Any]]]:
    """Walk backwards through `messages` to find the pending tool calls.

    Returns a list of dicts suitable for the API response / SSE event::

        [
            {
                "name": "update_channel_quota",
                "display_name": "修改渠道配额",
                "description": "...",
                "args": {"id": "...", "quota": 26},
            },
            ...
        ]

    Returns ``None`` if no pending tool calls were found.
    """
    # Find the last AIMessage that has tool_calls.
    target_msg = None
    for msg in reversed(messages):
        if msg.__class__.__name__ == "AIMessage" and getattr(msg, "tool_calls", None):
            target_msg = msg
            break
    if target_msg is None:
        return None

    # Load user-tool metadata for enriched display (name → display_name, description).
    tool_metadata: Dict[str, Dict[str, str]] = {}
    if user_id:
        try:
            result = await db.execute(
                select(UserTool).where(UserTool.user_id == user_id, UserTool.enabled == True)
            )
            for t in result.scalars().all():
                tool_metadata[t.name] = {
                    "display_name": t.display_name or t.name,
                    "description": t.description or "",
                }
        except Exception as e:
            api_logger.warning(f"Failed to load tool metadata for approval details: {e}")

    details: List[Dict[str, Any]] = []
    for tc in target_msg.tool_calls:
        name = tc.get("name", "")
        meta = tool_metadata.get(name, {})
        details.append({
            "name": name,
            "display_name": meta.get("display_name", name),
            "description": meta.get("description", ""),
            "args": tc.get("args", {}),
        })

    api_logger.info(f"Extracted {len(details)} approval details")
    return details if details else None
