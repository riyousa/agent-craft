"""Base tool adapter."""
from abc import ABC, abstractmethod
from typing import Any, Optional


class ToolExecutionError(Exception):
    """Tool execution error."""

    def __init__(self, tool_id: str, message: str):
        self.tool_id = tool_id
        self.message = message
        super().__init__(f"[{tool_id}] {message}")


class BaseToolAdapter(ABC):
    """Base class for tool adapters."""

    @abstractmethod
    def execute(self, tool_config: dict, params: dict, user_info: Optional[dict] = None) -> Any:
        """Execute the tool with given parameters.

        Args:
            tool_config: Tool execution configuration
            params: Tool parameters
            user_info: Optional user information (user_id, username, name, email, role_level, etc.)

        Returns:
            Tool execution result

        Raises:
            ToolExecutionError: If execution fails
        """
        pass

    @abstractmethod
    def test_connection(self, tool_config: dict, custom_params: Optional[dict] = None) -> dict:
        """Test tool connectivity.

        Args:
            tool_config: Tool execution configuration
            custom_params: Optional test parameters

        Returns:
            dict with keys:
                - ok (bool): Whether connection is successful
                - message (str): Status message
                - latency_ms (int): Response time in milliseconds
                - details (dict, optional): Additional details
        """
        pass
