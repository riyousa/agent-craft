"""LangGraph graph construction."""
from langgraph.graph import StateGraph, END
from src.agent.state import AgentState
from src.agent.nodes import call_model, should_continue, execute_tools_with_audit


def create_workflow():
    """Create the workflow (graph structure without checkpointer).

    Returns:
        StateGraph workflow
    """
    # Create graph
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("call_model", call_model)
    workflow.add_node("execute_tools", execute_tools_with_audit)

    # Set entry point
    workflow.set_entry_point("call_model")

    # Add conditional edges
    workflow.add_conditional_edges(
        "call_model",
        should_continue,
        {
            "execute_tools": "execute_tools",
            "end": END,
        },
    )

    # Add edge from execute_tools back to call_model
    workflow.add_edge("execute_tools", "call_model")

    return workflow


async def create_agent_graph_with_checkpointer(checkpointer):
    """Compile the graph with a checkpointer.

    Args:
        checkpointer: AsyncSqliteSaver instance

    Returns:
        Compiled graph
    """
    workflow = create_workflow()

    # Note: We don't use global interrupt_before anymore
    # Instead, we check dynamically in the nodes whether tools require approval
    # This allows us to only interrupt for specific tool calls that need approval
    # rather than interrupting all tool calls when ANY tool in the system requires approval

    # Compile graph with checkpointing (no static interrupt)
    # recursion_limit caps the total number of graph steps to prevent
    # infinite tool-call loops (e.g. when the API keeps returning empty data)
    graph = workflow.compile(
        checkpointer=checkpointer,
        interrupt_before=None,  # Dynamic approval checking in nodes
    )
    # graph.recursion_limit = 25  # ~12 rounds of call_model → execute_tools

    return graph


def create_agent_graph_simple():
    """Create agent graph without checkpointer for simple use cases.

    Returns:
        Compiled graph without persistence
    """
    workflow = create_workflow()
    # Compile graph without checkpointing. Approval is handled dynamically
    # in-node; no static interrupt list is needed here.
    return workflow.compile()
