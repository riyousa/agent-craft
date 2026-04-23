"""Conversation history API."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete, func
from src.db import get_db
from src.models import ConversationHistory
from src.api.user_schemas import ConversationListItem, ConversationMessagesResponse
from src.api.auth_deps import get_current_user_id

router = APIRouter(prefix="/user/conversations", tags=["conversations"])


@router.get("/")
async def list_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """列出用户的对话（分页）."""
    base = select(ConversationHistory).where(ConversationHistory.user_id == user_id)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    result = await db.execute(
        base.order_by(ConversationHistory.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    conversations = result.scalars().all()

    return {
        "items": [
            ConversationListItem(
                id=conv.id, thread_id=conv.thread_id, title=conv.title,
                message_count=conv.message_count, last_message=conv.last_message,
                created_at=conv.created_at, updated_at=conv.updated_at,
            ) for conv in conversations
        ],
        "total": total,
        "has_more": page * page_size < total,
    }


@router.get("/{thread_id}/messages", response_model=ConversationMessagesResponse)
async def get_conversation_messages(
    thread_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取对话的消息列表."""

    print(f"[Conversations] Getting messages for thread_id: {thread_id}, user_id: {user_id}")

    # 验证对话属于当前用户（如果不存在也继续，因为可能是新对话）
    result = await db.execute(
        select(ConversationHistory).where(
            ConversationHistory.thread_id == thread_id,
            ConversationHistory.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        print("[Conversations] Conversation not found in database, will try to load from checkpoint")
        # 不抛出异常，尝试从 checkpoint 加载

    # 从checkpointer获取实际消息
    messages = []
    try:
        from src.api.app import agent_graph

        config = {"configurable": {"thread_id": thread_id}}
        print(f"[Conversations] Loading state from checkpoint with config: {config}")
        state_snapshot = await agent_graph.aget_state(config)
        print(f"[Conversations] State snapshot values keys: {state_snapshot.values.keys() if state_snapshot.values else 'None'}")

        raw_messages = state_snapshot.values.get("messages", [])
        print(f"[Conversations] Found {len(raw_messages)} messages in checkpoint")

        # Group messages into "turns" so the history view matches the live
        # streaming view. A single user question can trigger multiple
        # intermediate AIMessages (each one issues a batch of tool_calls,
        # waits for ToolMessage results, then the next AIMessage chains in)
        # before the model finally emits an AIMessage with actual `content`.
        #
        # Live streaming accumulates all these intermediate steps into one
        # `currentSteps` array and attaches them to the single final assistant
        # message. We replicate that behaviour here:
        #   - buffer all thinking / tool_call / tool_result steps until we
        #     hit an AIMessage that carries `content` → emit one assistant
        #     entry with the buffered steps and the content, then reset.
        #   - if the conversation ends mid-turn (no final-content AI yet),
        #     flush the buffer as a content-less assistant entry so the user
        #     can still see what was done.
        step_buffer: list = []
        turn_timestamp = None

        def _flush_turn(content: str = "", timestamp=None):
            """Emit one assistant message holding all buffered steps."""
            nonlocal step_buffer, turn_timestamp
            if not content and not step_buffer:
                return
            entry = {
                "role": "assistant",
                "content": content,
                "timestamp": timestamp or turn_timestamp,
            }
            if step_buffer:
                entry["steps"] = step_buffer
            messages.append(entry)
            step_buffer = []
            turn_timestamp = None

        i = 0
        while i < len(raw_messages):
            msg = raw_messages[i]
            msg_class = msg.__class__.__name__

            if msg_class == "HumanMessage":
                # New user turn: flush any leftover steps from a prior
                # incomplete turn before recording the user message.
                _flush_turn()
                messages.append({
                    "role": "user",
                    "content": msg.content if hasattr(msg, 'content') else "",
                    "timestamp": getattr(msg, "timestamp", None),
                })
                i += 1
                continue

            if msg_class == "AIMessage":
                content = msg.content if hasattr(msg, 'content') else ""
                timestamp = getattr(msg, "timestamp", None)
                if turn_timestamp is None:
                    turn_timestamp = timestamp

                # Accumulate thinking
                if hasattr(msg, 'additional_kwargs') and 'thinking' in msg.additional_kwargs:
                    thinking_content = msg.additional_kwargs['thinking']
                    if thinking_content:
                        step_buffer.append({
                            "type": "thinking",
                            "content": thinking_content,
                            "timestamp": timestamp,
                        })

                # Accumulate tool calls + their immediately-following tool results
                if hasattr(msg, 'tool_calls') and msg.tool_calls:
                    for tc in msg.tool_calls:
                        step_buffer.append({
                            "type": "tool_call",
                            "name": tc.get('name', ''),
                            "args": tc.get('args', {}),
                            "timestamp": timestamp,
                        })
                    j = i + 1
                    while j < len(raw_messages) and raw_messages[j].__class__.__name__ == "ToolMessage":
                        tool_msg = raw_messages[j]
                        step_buffer.append({
                            "type": "tool_result",
                            "name": getattr(tool_msg, 'name', ''),
                            "content": tool_msg.content if hasattr(tool_msg, 'content') else "",
                            "timestamp": getattr(tool_msg, "timestamp", None),
                        })
                        j += 1
                    i = j
                else:
                    i += 1

                # Only emit when this AIMessage carries the final reply text
                # for the turn. Intermediate tool-only AIMessages keep the
                # buffer growing.
                if isinstance(content, str) and content.strip():
                    _flush_turn(content=content, timestamp=timestamp)
                continue

            # Stray ToolMessage outside a recognized turn — skip.
            i += 1

        # Conversation may end mid-turn (e.g. waiting on approval) — surface
        # whatever steps we've collected so the UI doesn't drop them.
        _flush_turn()

        print(f"[Conversations] Processed {len(messages)} messages with steps")
    except Exception as e:
        print(f"[Conversations] Error loading messages from checkpoint: {e}")
        import traceback
        print(f"[Conversations] Traceback: {traceback.format_exc()}")

    print(f"[Conversations] Returning {len(messages)} messages")
    return ConversationMessagesResponse(
        thread_id=thread_id, messages=messages, total_count=len(messages)
    )


@router.delete("/{thread_id}")
async def delete_conversation(
    thread_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除对话."""

    # 验证对话属于当前用户
    result = await db.execute(
        select(ConversationHistory).where(
            ConversationHistory.thread_id == thread_id,
            ConversationHistory.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 删除对话记录
    await db.execute(
        sql_delete(ConversationHistory).where(
            ConversationHistory.thread_id == thread_id,
            ConversationHistory.user_id == user_id,
        )
    )
    await db.commit()

    # 删除checkpointer中的数据
    try:

        # LangGraph's SqliteSaver doesn't have a direct delete method
        # We'll let checkpoints naturally expire or clean up manually
        # For now, just remove from conversation_history table
        pass
    except Exception as e:
        print(f"Error deleting checkpoint data: {e}")

    return {"message": "Conversation deleted successfully"}


@router.put("/{thread_id}/title")
async def update_conversation_title(
    thread_id: str,
    title: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新对话标题."""

    result = await db.execute(
        select(ConversationHistory).where(
            ConversationHistory.thread_id == thread_id,
            ConversationHistory.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.title = title
    await db.commit()

    return {"message": "Title updated successfully"}
