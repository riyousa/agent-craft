"""Base tool decorator and utilities."""
from typing import Callable, Any, Optional
from functools import wraps
from pydantic import BaseModel
from langchain_core.tools import StructuredTool


class BaseTool:
    """Base class for tool metadata."""

    def __init__(
        self,
        name: str,
        description: str,
        args_schema: Optional[type[BaseModel]] = None,
        requires_approval: bool = False,
    ):
        self.name = name
        self.description = description
        self.args_schema = args_schema
        self.requires_approval = requires_approval


def tool(
    name: str,
    description: str,
    args_schema: Optional[type[BaseModel]] = None,
    requires_approval: bool = False,
):
    """Decorator to register a function as a tool.

    Args:
        name: Tool name
        description: Tool description for LLM
        args_schema: Pydantic model for argument validation
        requires_approval: Whether this tool requires human approval before execution

    Example:
        ```python
        class QueryInventoryArgs(BaseModel):
            product_id: str

        @tool(
            name="query_inventory",
            description="Query product inventory",
            args_schema=QueryInventoryArgs,
            requires_approval=False
        )
        async def query_inventory(product_id: str) -> dict:
            # Implementation
            return {"product_id": product_id, "stock": 100}
        ```
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            return await func(*args, **kwargs)

        # Store metadata on the function
        wrapper._tool_metadata = BaseTool(
            name=name,
            description=description,
            args_schema=args_schema,
            requires_approval=requires_approval,
        )
        wrapper._original_func = func

        return wrapper

    return decorator


def create_langchain_tool(func: Callable) -> StructuredTool:
    """Convert a decorated function to a LangChain StructuredTool.

    Args:
        func: Function decorated with @tool

    Returns:
        StructuredTool instance
    """
    if not hasattr(func, "_tool_metadata"):
        raise ValueError(f"Function {func.__name__} is not decorated with @tool")

    metadata = func._tool_metadata

    return StructuredTool.from_function(
        coroutine=func,
        name=metadata.name,
        description=metadata.description,
        args_schema=metadata.args_schema,
    )
