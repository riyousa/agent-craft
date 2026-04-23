"""Agent state definition."""
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State for the agent graph.

    Attributes:
        messages: List of messages in the conversation, managed by add_messages
        user_info: User information including employee ID, department, permission level
        current_skill: Currently executing skill module name
        approval_granted: Flag indicating that human approval has been granted for pending tool execution
        approved_skills: Skill names approved in this turn. Their required_tools
            inherit the approval so the workflow runs end-to-end without
            re-prompting for each step.

    Note:
        User tools are NOT stored in state to avoid serialization issues.
        They are loaded dynamically in nodes using user_id from user_info.
    """
    messages: Annotated[list[BaseMessage], add_messages]
    user_info: dict  # {user_id, feishu_open_id, name, role_level, department}
    current_skill: str  # Current skill being executed
    approval_granted: bool  # True if human approval has been granted
    approved_skills: list[str]  # Skills approved this turn; their tools skip approval
