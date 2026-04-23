"""State management API — recovery, history, rollback.

Leverages LangGraph's PostgresSaver/SqliteSaver checkpoint system.
"""
from fastapi import APIRouter, Depends, HTTPException
from src.api.auth_deps import get_current_user_id
from src.utils.logger import api_logger

router = APIRouter(prefix="/state", tags=["state"])


def _get_graph():
    from src.api.app import agent_graph
    if not agent_graph:
        raise HTTPException(status_code=503, detail="Agent graph not initialized")
    return agent_graph


@router.get("/thread/{thread_id}")
async def get_thread_state(
    thread_id: str,
    checkpoint_id: str = None,
    user_id: int = Depends(get_current_user_id),
):
    """获取线程当前状态（用于对话恢复）.

    传 checkpoint_id 可获取指定版本的状态。
    """
    graph = _get_graph()
    config = {"configurable": {"thread_id": thread_id}}
    if checkpoint_id:
        config["configurable"]["checkpoint_id"] = checkpoint_id

    try:
        state = await graph.aget_state(config)
    except Exception as e:
        api_logger.error(f"Failed to get state for thread {thread_id}: {e}")
        raise HTTPException(status_code=404, detail="对话不存在或无法恢复")

    if not state or not state.values:
        raise HTTPException(status_code=404, detail="对话不存在")

    messages = state.values.get("messages", [])
    next_nodes = list(state.next) if state.next else []

    serialized = []
    for msg in messages:
        cls = msg.__class__.__name__
        entry = {"type": cls, "content": msg.content if hasattr(msg, "content") else ""}
        if cls == "AIMessage" and hasattr(msg, "tool_calls") and msg.tool_calls:
            entry["tool_calls"] = msg.tool_calls
        if cls == "AIMessage" and hasattr(msg, "additional_kwargs"):
            thinking = msg.additional_kwargs.get("thinking")
            if thinking:
                entry["thinking"] = thinking
        if cls == "ToolMessage":
            entry["tool_call_id"] = getattr(msg, "tool_call_id", "")
            entry["name"] = getattr(msg, "name", "")
        serialized.append(entry)

    return {
        "thread_id": thread_id,
        "messages": serialized,
        "next_nodes": next_nodes,
        "requires_approval": "execute_tools" in next_nodes,
        "checkpoint_id": state.config.get("configurable", {}).get("checkpoint_id") if state.config else None,
    }


@router.get("/thread/{thread_id}/history")
async def get_thread_history(
    thread_id: str,
    limit: int = 20,
    user_id: int = Depends(get_current_user_id),
):
    """获取线程的 checkpoint 历史（用于回溯）.

    每个 checkpoint 包含 checkpoint_id 和 parent_checkpoint_id，
    用于构建版本树。
    """
    graph = _get_graph()
    config = {"configurable": {"thread_id": thread_id}}

    history = []
    seen_msg_counts = set()
    count = 0

    async for state in graph.aget_state_history(config):
        if count >= limit:
            break
        messages = state.values.get("messages", []) if state.values else []
        msg_count = len(messages)

        # Deduplicate: skip checkpoints with same message count as previous
        # (intermediate checkpoints from the same turn)
        if msg_count in seen_msg_counts and msg_count > 0:
            count += 1
            continue
        seen_msg_counts.add(msg_count)

        cp_config = state.config.get("configurable", {}) if state.config else {}
        cp_id = cp_config.get("checkpoint_id")
        parent_id = state.parent_config.get("configurable", {}).get("checkpoint_id") if state.parent_config else None

        last_msg = ""
        last_role = ""
        for msg in reversed(messages):
            cls = msg.__class__.__name__
            if cls in ("HumanMessage", "AIMessage") and hasattr(msg, "content") and msg.content:
                content = msg.content if isinstance(msg.content, str) else str(msg.content)
                last_msg = content[:100]
                last_role = "user" if cls == "HumanMessage" else "assistant"
                break

        history.append({
            "checkpoint_id": cp_id,
            "parent_id": parent_id,
            "message_count": msg_count,
            "last_message_preview": last_msg,
            "last_message_role": last_role,
        })
        count += 1

    return {"thread_id": thread_id, "checkpoints": history}


@router.post("/thread/{thread_id}/rollback")
async def rollback_thread(
    thread_id: str,
    checkpoint_id: str,
    user_id: int = Depends(get_current_user_id),
):
    """回溯到指定 checkpoint.

    不会修改历史，而是返回该 checkpoint 的状态信息。
    前端使用返回的 checkpoint_id 作为后续对话的起点（fork）。
    """
    graph = _get_graph()
    target_config = {"configurable": {"thread_id": thread_id, "checkpoint_id": checkpoint_id}}

    try:
        state = await graph.aget_state(target_config)
        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Checkpoint 不存在")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"无法加载 checkpoint: {e}")

    messages = state.values.get("messages", [])
    api_logger.info(f"Rollback thread {thread_id} to checkpoint {checkpoint_id}, messages: {len(messages)}")

    return {
        "thread_id": thread_id,
        "checkpoint_id": checkpoint_id,
        "message_count": len(messages),
    }


@router.post("/thread/{thread_id}/resume")
async def resume_thread(
    thread_id: str,
    user_id: int = Depends(get_current_user_id),
):
    """恢复中断的对话执行."""
    graph = _get_graph()
    config = {"configurable": {"thread_id": thread_id}}

    try:
        state = await graph.aget_state(config)
    except Exception:
        raise HTTPException(status_code=404, detail="对话不存在")

    if not state or not state.values:
        raise HTTPException(status_code=404, detail="对话不存在")

    next_nodes = list(state.next) if state.next else []
    if not next_nodes:
        return {"thread_id": thread_id, "status": "completed", "message": "对话已完成"}

    try:
        await graph.ainvoke(None, config)
        new_state = await graph.aget_state(config)
        return {
            "thread_id": thread_id,
            "status": "resumed",
            "message_count": len(new_state.values.get("messages", [])),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"恢复失败: {e}")
