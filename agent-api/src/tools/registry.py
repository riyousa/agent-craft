"""Tool registry for managing all built-in tools.

Built-in tools are defined in code and available to every user without
admin assignment. User-specific tools live in the `user_tools` table and
are loaded per-user in the graph nodes.
"""
from typing import List
from langchain_core.tools import StructuredTool

from .render_chart import build_render_chart_tool


def get_all_tools() -> List[StructuredTool]:
    """Return all built-in tools as LangChain StructuredTools."""
    return [
        build_render_chart_tool(),
    ]


def get_tools_requiring_approval() -> List[str]:
    """Names of built-in tools that require human approval before execution."""
    # render_chart is pure formatting, no side effects → no approval needed.
    return []
