"""Base skill decorator and utilities."""
from typing import Callable, Any
from functools import wraps


class BaseSkill:
    """Base class for skill metadata."""

    def __init__(
        self,
        name: str,
        description: str,
        required_role_level: int = 1,
    ):
        self.name = name
        self.description = description
        self.required_role_level = required_role_level


def skill(
    name: str,
    description: str,
    required_role_level: int = 1,
):
    """Decorator to register a function as a skill.

    Args:
        name: Skill name
        description: Skill description
        required_role_level: Minimum role level required to execute this skill

    Example:
        ```python
        @skill(
            name="analyze_and_scale",
            description="Analyze server logs and auto-scale resources",
            required_role_level=2
        )
        async def analyze_and_scale(server_id: str, user_info: dict) -> dict:
            # Implementation combining multiple tools
            return {"status": "scaled"}
        ```
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            return await func(*args, **kwargs)

        # Store metadata on the function
        wrapper._skill_metadata = BaseSkill(
            name=name,
            description=description,
            required_role_level=required_role_level,
        )

        return wrapper

    return decorator
