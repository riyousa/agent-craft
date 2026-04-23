"""LangGraph nodes implementation."""
from typing import Literal, Optional
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt import ToolNode
from src.agent.state import AgentState
from src.agent.llm import get_llm, create_system_prompt
from src.agent import tools_cache
from src.tools.registry import get_all_tools
from src.utils.logger import agent_logger


def _thread_id(config: Optional[dict]) -> Optional[str]:
    if not config:
        return None
    return (config.get("configurable") or {}).get("thread_id")


async def _load_tools_and_skills(
    user_id: int,
    user_info: dict,
    system_tools: list,
    thread_id: Optional[str],
):
    """Load user tools + skills via the turn-scoped cache.

    Opens a single DB session on cache miss. On hit, no DB round-trip.
    """
    try:
        from src.db import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            user_tools, user_skills = await tools_cache.get_user_tools_and_skills(
                user_id=user_id,
                user_info=user_info,
                available_system_tools=system_tools,
                thread_id=thread_id,
                session=session,
            )
        agent_logger.info(
            f"✅ Loaded {len(user_tools)} tools + {len(user_skills)} skills for user {user_id}"
        )
        return user_tools, user_skills
    except Exception as e:
        agent_logger.error(f"❌ Failed to load user tools/skills: {str(e)}", exc_info=True)
        return [], []


async def call_model(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
    """Call LLM with current state."""
    agent_logger.debug("Calling model with state")

    user_info = state.get("user_info", {}) or {}
    enable_reasoning = user_info.get("enable_reasoning", False)
    model_id = user_info.get("model_id") or None
    agent_logger.debug(
        f"Reasoning mode: {'enabled' if enable_reasoning else 'disabled'}, model_id={model_id or '(default)'}"
    )

    from src.services.llm_service import LLMConfigError
    try:
        llm = await get_llm(model_id=model_id, enable_reasoning=enable_reasoning, streaming=True)
    except LLMConfigError as cfg_err:
        agent_logger.error(f"LLM resolution failed: {cfg_err}")
        # Surface a clean assistant message so the UI shows the actual issue.
        return {"messages": [AIMessage(content=f"⚠️ {cfg_err}")]}

    system_tools = get_all_tools()
    agent_logger.debug(f"Loaded {len(system_tools)} system tools")

    user_id = state["user_info"].get("user_id") or state["user_info"].get("id")
    user_tools: list = []
    user_skills: list = []
    if user_id:
        user_tools, user_skills = await _load_tools_and_skills(
            user_id, state["user_info"], system_tools, _thread_id(config),
        )

    # Combine all: system tools + user tools + user skills (as tools)
    # Put skills first so LLM sees them as preferred options
    all_tools = user_skills + system_tools + user_tools
    agent_logger.info(f"Total capabilities: {len(all_tools)} ({len(user_skills)} skills + {len(system_tools)} system tools + {len(user_tools)} user tools)")

    # Bind tools to LLM
    llm_with_tools = llm.bind_tools(all_tools)

    # Create system prompt with user context and available capabilities
    system_message = create_system_prompt(
        state["user_info"],
        skills=user_skills,
        tools=system_tools + user_tools
    )

    # Prepare messages
    messages = [system_message] + state["messages"]

    # Call LLM
    response = await llm_with_tools.ainvoke(messages)

    return {"messages": [response]}


async def should_continue(state: AgentState, config: Optional[RunnableConfig] = None) -> Literal["execute_tools", "end"]:
    """Determine if we should continue to tool execution or end.

    Args:
        state: Current agent state

    Returns:
        Next node to execute
    """
    last_message = state["messages"][-1]

    # If the LLM makes a tool call, check if any require approval
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        # Check if any of the called tools require approval
        needs_approval = await check_tool_approval_needed(state, config)
        agent_logger.info(f"Tool calls require approval: {needs_approval}")

        # Note: We always return execute_tools here
        # LangGraph's interrupt mechanism will be handled by graph configuration
        return "execute_tools"

    # Otherwise, end
    return "end"


async def check_tool_approval_needed(state: AgentState, config: Optional[RunnableConfig] = None) -> bool:
    """Check if any called tool/skill requires approval.

    Honors `state["approved_skills"]`: once a skill has been approved this
    turn, tool calls in its `required_tools` inherit the approval so the
    workflow can run end-to-end without re-prompting per step.
    """
    # API keys with auto_approve bypass all approval checks.
    if state.get("user_info", {}).get("auto_approve"):
        agent_logger.info("[AUTO-APPROVE] Skipping all approval checks (API key auto_approve=True)")
        return False

    last_message = state["messages"][-1]

    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return False

    from src.tools.registry import get_tools_requiring_approval as get_system_approval_tools
    system_approval_tools = set(get_system_approval_tools())

    user_id = state["user_info"].get("user_id") or state["user_info"].get("id")
    user_approval_tools: set = set()
    user_approval_skills: set = set()
    skill_required_tools: dict = {}

    if user_id:
        try:
            from src.db import AsyncSessionLocal
            system_tools = get_all_tools()
            async with AsyncSessionLocal() as session:
                entry = await tools_cache.get_entry(
                    user_id=user_id,
                    user_info=state["user_info"],
                    available_system_tools=system_tools,
                    thread_id=_thread_id(config),
                    session=session,
                )
            user_approval_tools = entry.approval_tool_names
            user_approval_skills = entry.approval_skill_names
            skill_required_tools = entry.skill_required_tools
        except Exception as e:
            agent_logger.error(f"Failed to get user approval tools/skills: {e}")

    all_approval_items = system_approval_tools | user_approval_tools | user_approval_skills

    # Tools already covered by an approved skill this turn.
    approved_skills = set(state.get("approved_skills", []) or [])
    inherited_tool_exemptions: set = set()
    for skill_name in approved_skills:
        for tname in skill_required_tools.get(skill_name, []):
            inherited_tool_exemptions.add(tname)

    agent_logger.info(
        f"All tools/skills requiring approval: {all_approval_items}; "
        f"approved_skills_this_turn: {approved_skills}; "
        f"inherited_tool_exemptions: {inherited_tool_exemptions}"
    )

    for tool_call in last_message.tool_calls:
        tool_name = tool_call.get('name', '')
        if tool_name not in all_approval_items:
            continue

        # Skill call: exempt if already approved this turn.
        if tool_name.startswith("skill_"):
            bare = tool_name[len("skill_"):]
            if bare in approved_skills:
                agent_logger.info(f"Skill '{tool_name}' already approved this turn — skipping interrupt")
                continue
            agent_logger.warning(f"⚠️  Skill '{tool_name}' requires approval!")
            return True

        # Tool call: exempt if it's in an approved skill's required_tools.
        if tool_name in inherited_tool_exemptions:
            agent_logger.info(
                f"Tool '{tool_name}' is in an approved skill's required_tools — skipping interrupt"
            )
            continue

        agent_logger.warning(f"⚠️  Tool '{tool_name}' requires approval!")
        return True

    agent_logger.info("✅ No tools/skills require approval")
    return False


async def execute_tools_with_audit(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
    """Execute tools and log to audit trail."""
    agent_logger.debug("Executing tools")

    last_message = state["messages"][-1]

    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        agent_logger.warning("No tool calls found in last message")
        return {"messages": []}

    approval_granted = state.get("approval_granted", False)

    # Track any skill names approved by this resume so their required_tools
    # skip individual approval prompts for the rest of the turn.
    newly_approved_skills: list = []
    if approval_granted:
        agent_logger.info("✅ Approval already granted - proceeding with tool execution")
        for tc in last_message.tool_calls:
            tname = tc.get("name", "")
            if tname.startswith("skill_"):
                newly_approved_skills.append(tname[len("skill_"):])
        if newly_approved_skills:
            agent_logger.info(
                f"Recording newly approved skills for this turn: {newly_approved_skills}"
            )
    else:
        needs_approval = await check_tool_approval_needed(state, config)
        if needs_approval:
            agent_logger.warning("⚠️  Tool execution requires approval - triggering interrupt")
            from langgraph.errors import NodeInterrupt
            raise NodeInterrupt("Tool execution requires human approval")

    system_tools = get_all_tools()

    user_id = state["user_info"].get("user_id") or state["user_info"].get("id")
    user_tools: list = []
    user_skills: list = []
    if user_id:
        user_tools, user_skills = await _load_tools_and_skills(
            user_id, state["user_info"], system_tools, _thread_id(config),
        )

    all_tools = user_skills + system_tools + user_tools
    agent_logger.info(
        f"Executing with {len(all_tools)} capabilities ({len(user_skills)} skills + {len(system_tools)} system tools + {len(user_tools)} user tools)"
    )

    tool_node = ToolNode(all_tools)

    try:
        result = await tool_node.ainvoke(state)
        agent_logger.info("Tools executed successfully")
    except Exception as e:
        agent_logger.error(f"Tool execution failed: {str(e)}", exc_info=True)
        raise

    for tool_call in last_message.tool_calls:
        u_id = state['user_info'].get('user_id', 'unknown')
        tool_name = tool_call['name']
        tool_args = tool_call.get('args', {})
        agent_logger.info(f"Audit: User {u_id} called tool {tool_name} with args: {tool_args}")

    # Turn complete — drop this thread's cache so next user message sees
    # any admin-side tool/skill changes made in the meantime.
    tools_cache.clear(thread_id=_thread_id(config))

    # Persist approved-skill list across the remaining steps of this turn.
    prior_approved = list(state.get("approved_skills", []) or [])
    merged_approved = prior_approved + [s for s in newly_approved_skills if s not in prior_approved]
    result["approval_granted"] = False
    result["approved_skills"] = merged_approved
    return result
