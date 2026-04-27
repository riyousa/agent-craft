"""Tool registry for managing all built-in tools.

Built-in tools are defined in code and available to every user without
admin assignment. User-specific tools live in the `user_tools` table and
are loaded per-user in the graph nodes.
"""
from typing import List
from langchain_core.tools import StructuredTool

from .get_current_time import build_get_current_time_tool
from .render_chart import build_render_chart_tool


def get_all_tools() -> List[StructuredTool]:
    """Return all built-in tools as LangChain StructuredTools."""
    return [
        build_get_current_time_tool(),
        build_render_chart_tool(),
    ]


def get_tools_requiring_approval() -> List[str]:
    """Names of built-in tools that require human approval before execution."""
    # All built-ins are read-only / pure formatting → no approval needed.
    return []
