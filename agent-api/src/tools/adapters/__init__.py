"""Tool adapters for executing different types of tools.

Each configured tool record stores `execution.type` (default "rest_api")
which selects the adapter at runtime.
"""
from typing import Optional

from src.tools.adapters.base import BaseToolAdapter, ToolExecutionError
from src.tools.adapters.rest_api import rest_api_adapter
from src.tools.adapters.mcp import mcp_adapter


_ADAPTERS: dict[str, BaseToolAdapter] = {
    "rest_api": rest_api_adapter,
    "mcp": mcp_adapter,
}


def get_adapter(execution_type: Optional[str]) -> BaseToolAdapter:
    """Return the adapter for the given execution type.

    Defaults to `rest_api` for backwards compatibility with existing tools
    that have no explicit `type` field.
    """
    key = (execution_type or "rest_api").lower()
    adapter = _ADAPTERS.get(key)
    if adapter is None:
        raise ToolExecutionError(key, f"Unknown execution type: {execution_type}")
    return adapter


__all__ = ["BaseToolAdapter", "ToolExecutionError", "get_adapter", "rest_api_adapter", "mcp_adapter"]
