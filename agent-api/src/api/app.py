"""FastAPI application."""
# Load environment variables first
from pathlib import Path
from dotenv import load_dotenv

# Get project root (agent-api/) and load .env
project_root = Path(__file__).parent.parent.parent
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

# Resolve all runtime paths relative to project root
DATA_DIR = str(project_root / "data")
DB_PATH = str(project_root / "data" / "agent.db")

from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager
from src.api.schemas import (
    ChatRequest,
    ChatResponse,
    CallbackRequest,
    CallbackResponse,
    HistoryResponse,
    HealthResponse,
)
from src.db import init_db, get_db, AsyncSessionLocal
from src.agent.graph import create_agent_graph_with_checkpointer
from src.utils import AsyncSqliteConnectionWrapper
from src.utils.logger import api_logger
from langchain_core.messages import HumanMessage


def _build_human_message(
    text: str,
    file_urls: list = None,
    *,
    original_file_urls: list = None,
) -> HumanMessage:
    """Build a HumanMessage, using multimodal content if files are present.

    `file_urls` are the **bridged** URLs the LLM should consume (data: /
    oss: / http(s) / file-xxx). `original_file_urls` are the user-facing
    URLs (`/assets/<id>?sig=...`) — they live on `additional_kwargs` so
    the conversation loader can render them in the user bubble even
    though the bridged URLs (data: blobs / Files API ids) are no longer
    suitable for an `<img>` tag.

    URL detection rules for the bridged content list:
      - `data:<mime>;base64,...` → inline image data URL (Doubao image
                            bridge produces these; OpenAI-compatible).
      - `oss://...`       → Qwen DashScope temp asset, emit `image_url`.
      - any image extension (.jpg/.png/...) → `image_url`.
      - `file-...`        → Doubao Files API id (PDFs/docs/videos);
                            multimodal chat rejects these in image_url
                            ("Only base64, http or https URLs are
                            supported"), so emit a text reference.
      - everything else   → text reference, so the model at least sees
                            that an attachment exists (download itself
                            happens out-of-band).
    """
    additional_kwargs: dict = {}
    if original_file_urls:
        additional_kwargs["original_file_urls"] = [str(u) for u in original_file_urls]

    if not file_urls:
        if additional_kwargs:
            return HumanMessage(content=text, additional_kwargs=additional_kwargs)
        return HumanMessage(content=text)

    image_exts = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp')
    content: list = [{"type": "text", "text": text}]
    for url in file_urls:
        url_str = str(url)
        lower = url_str.lower()
        is_image = lower.endswith(image_exts)
        is_data_image = lower.startswith("data:image/")
        is_qwen_oss = lower.startswith("oss://")
        if is_image or is_data_image or is_qwen_oss:
            content.append({"type": "image_url", "image_url": {"url": url_str}})
        else:
            # Files API ids (`file-xxx`) and unknown URLs land here —
            # surface them as a text reference rather than a bogus
            # image_url block. The model sees that an attachment exists;
            # the actual lookup happens out-of-band.
            label = url_str if not url_str.startswith("file-") else f"已上传文件 {url_str}"
            content.append({"type": "text", "text": f"\n[附件: {label}]"})

    return HumanMessage(content=content)
import json
import os
import traceback
from datetime import datetime
from src.config import settings as app_settings
from src.models.base import utc_now as _utc_now


# Global graph instance
agent_graph = None
checkpointer_conn = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    global agent_graph, checkpointer_conn

    await init_db()

    # First-time bootstrap: seed a default LLM model from LLM_API_KEY when the
    # llm_models table is empty. Runtime always reads from the table, not env.
    try:
        from src.services.llm_service import seed_default_model_from_env
        async with AsyncSessionLocal() as _seed_session:
            await seed_default_model_from_env(_seed_session)
    except Exception as _seed_err:  # pragma: no cover - non-fatal
        api_logger.warning(f"LLM seed step skipped: {_seed_err}")

    if app_settings.is_postgres:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg_pool import AsyncConnectionPool

        cp_url = app_settings.checkpoint_database_url or app_settings.database_url
        cp_url = cp_url.replace("postgresql+asyncpg://", "postgresql://")

        # Use a connection pool instead of a single connection to avoid
        # "another command is already in progress" errors during concurrent
        # checkpoint reads/writes in streaming mode
        async with AsyncConnectionPool(
            conninfo=cp_url,
            min_size=2,
            max_size=10,
            kwargs={"autocommit": True, "prepare_threshold": 0},
        ) as pool:
            checkpointer = AsyncPostgresSaver(conn=pool)
            await checkpointer.setup()
            agent_graph = await create_agent_graph_with_checkpointer(checkpointer)
            print("Database initialized (PostgreSQL, connection pool) and agent graph created")
            yield
            print("Shutting down...")
    else:
        import aiosqlite
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        os.makedirs(DATA_DIR, exist_ok=True)
        conn = await aiosqlite.connect(DB_PATH)
        checkpointer_conn = AsyncSqliteConnectionWrapper(conn)
        checkpointer = AsyncSqliteSaver(checkpointer_conn)
        await checkpointer.setup()
        agent_graph = await create_agent_graph_with_checkpointer(checkpointer)
        print("Database initialized (SQLite) and agent graph created")
        yield
        print("Shutting down...")
        await checkpointer_conn.close()
        print("Checkpointer connection closed")


app = FastAPI(
    title="Internal Employee Platform Assistant",
    description="LangGraph-based AI Agent for internal company operations",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
# Explicit methods + headers since allow_credentials=True — wildcards are
# unsafe with credentialed requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.3.118:3000",
        "http://192.168.3.42:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# RFC 9457 Problem Details for all error responses.
from src.api import problem_details
problem_details.register(app)

# All first-party APIs are mounted under /api/v1 for versioning.
# Exceptions (mounted at root):
#   /health                 — unversioned operational endpoint
#   /assets/{id}            — public signed URLs already in the wild
API_V1 = "/api/v1"

# Include admin routers
from src.api import admin_tools, admin_skills, admin_users, admin_models

app.include_router(admin_tools.router, prefix=API_V1)
app.include_router(admin_skills.router, prefix=API_V1)
app.include_router(admin_users.router, prefix=API_V1)
app.include_router(admin_models.router, prefix=API_V1)
app.include_router(admin_models.user_router, prefix=API_V1)

# Include user routers
from src.api import auth, user_files, user_tools_skills, conversations, ai_helper, api_keys, state, observability

app.include_router(auth.router, prefix=API_V1)
app.include_router(user_files.router, prefix=API_V1)
app.include_router(user_files.public_router)  # /assets/* stays at root
app.include_router(user_tools_skills.router, prefix=API_V1)
app.include_router(conversations.router, prefix=API_V1)
app.include_router(ai_helper.router, prefix=API_V1)
app.include_router(api_keys.router, prefix=API_V1)
app.include_router(state.router, prefix=API_V1)
app.include_router(observability.router, prefix=API_V1)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="healthy")


# Non-identity preference fields the client may set in `user_info` — these are
# passed through to the agent but can't spoof identity.
_CLIENT_PREFERENCE_KEYS = frozenset({
    "enable_reasoning",  # 火山引擎深度思考开关
})


def _merge_client_preferences(identity: dict, client_info: Optional[dict]) -> dict:
    """Overlay client-supplied preference fields on top of server-derived identity."""
    if isinstance(client_info, dict):
        for k in _CLIENT_PREFERENCE_KEYS:
            if k in client_info:
                identity[k] = client_info[k]
    return identity


async def _resolve_user_info(request: ChatRequest, http_request: Request, db: AsyncSession) -> dict:
    """Resolve user_info from API key (sk-xxx) or JWT.

    Identity fields (user_id, name, role_level) are always derived server-side
    from the Authorization header — the request body cannot spoof them. A small
    allow-list of preference fields (see `_CLIENT_PREFERENCE_KEYS`) is passed
    through from the request body so UI toggles like "deep thinking" still work.
    """
    auth_header = http_request.headers.get("authorization", "") if http_request else ""
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    raw_token = auth_header[7:]

    # API key path
    if raw_token.startswith("sk-"):
        from src.api.api_keys import get_user_and_key
        pair = await get_user_and_key(raw_token, db)
        if not pair:
            raise HTTPException(status_code=401, detail="Invalid API Key")
        user, api_key_record = pair
        if not user.is_active:
            raise HTTPException(status_code=403, detail="User disabled")
        identity = {
            "user_id": user.id,
            "name": user.name,
            "role_level": user.role_level,
            "auto_approve": bool(api_key_record.auto_approve),
        }
        merged = _merge_client_preferences(identity, request.user_info)
        if request.model_id:
            merged["model_id"] = request.model_id
        return merged

    # JWT path
    from src.utils.auth import decode_access_token_with_error
    from sqlalchemy import select
    from src.models.user import User

    user_id, error_code = decode_access_token_with_error(raw_token)
    if error_code or user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")

    identity = {
        "user_id": user.id,
        "name": user.name,
        "role_level": user.role_level,
    }
    merged = _merge_client_preferences(identity, request.user_info)
    if request.model_id:
        merged["model_id"] = request.model_id
    return merged


@app.post(f"{API_V1}/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    http_request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle chat messages with streaming support.

    Args:
        request: Chat request with thread_id, message, and user_info
        db: Database session

    Returns:
        Chat response with agent's reply
    """
    user_info = await _resolve_user_info(request, http_request, db)

    api_logger.info("="*60)
    api_logger.info(f"Chat request: thread_id={request.thread_id}, user_id={user_info.get('user_id')}")
    api_logger.debug(f"Message: {request.message[:100]}...")

    try:
        configurable = {"thread_id": request.thread_id}
        if request.checkpoint_id:
            configurable["checkpoint_id"] = request.checkpoint_id
        config = {"configurable": configurable, "recursion_limit": 50}

        from src.agent.file_bridge import rewrite_file_urls_for_model
        bridged_file_urls = await rewrite_file_urls_for_model(
            request.file_urls or [], model_id=user_info.get("model_id"), db=db,
        )

        initial_state = {
            "messages": [_build_human_message(
                request.message,
                bridged_file_urls,
                original_file_urls=request.file_urls or [],
            )],
            "user_info": user_info,
            "current_skill": "",
            "approval_granted": False,  # Reset approval flag for new message
            # NOTE: `approved_skills` is intentionally NOT reset here.
            # Skill workflows often span multiple user messages (e.g. "please
            # pick which record to modify"), so the approval granted in turn N
            # must carry into the user's reply in turn N+1. LangGraph's
            # checkpointer preserves prior state values for any key we omit
            # from this dict.
        }

        api_logger.debug(f"Initial state: {initial_state}")

        # Invoke graph
        result = await agent_graph.ainvoke(initial_state, config)

        # Get last message
        last_message = result["messages"][-1]
        response_text = last_message.content if hasattr(last_message, "content") else str(last_message)

        # Check if waiting for approval
        state_snapshot = await agent_graph.aget_state(config)
        requires_approval = state_snapshot.next == ("execute_tools",)

        approval_details = None
        if requires_approval:
            from src.api.approval_utils import extract_approval_details
            _uid = user_info.get("user_id") or user_info.get("id")
            approval_details = await extract_approval_details(
                state_snapshot.values.get("messages", []), _uid, db,
            )

        api_logger.info(f"Chat response generated successfully. Requires approval: {requires_approval}")
        api_logger.info("="*60)

        return ChatResponse(
            thread_id=request.thread_id,
            response=response_text,
            status="pending_approval" if requires_approval else "success",
            requires_approval=requires_approval,
            approval_details=approval_details,
        )

    except Exception as e:
        api_logger.error("="*60)
        api_logger.error(f"Chat request failed: {str(e)}")
        api_logger.error(f"Error type: {type(e).__name__}")
        api_logger.error(f"Traceback:\n{traceback.format_exc()}")
        api_logger.error("="*60)
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@app.post(f"{API_V1}/chat/stream")
async def chat_stream(
    request: ChatRequest,
    http_request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle chat messages with streaming support."""
    user_info = await _resolve_user_info(request, http_request, db)
    api_logger.info(f"Stream chat request: thread_id={request.thread_id}, user_id={user_info.get('user_id')}")

    async def generate():
        try:
            configurable = {"thread_id": request.thread_id}
            if request.checkpoint_id:
                configurable["checkpoint_id"] = request.checkpoint_id
            config = {"configurable": configurable, "recursion_limit": 50}

            from src.agent.file_bridge import rewrite_file_urls_for_model
            bridged_file_urls = await rewrite_file_urls_for_model(
                request.file_urls or [], model_id=user_info.get("model_id"), db=db,
            )

            initial_state = {
                "messages": [_build_human_message(
                request.message,
                bridged_file_urls,
                original_file_urls=request.file_urls or [],
            )],
                "user_info": user_info,
                "current_skill": "",
                "approval_granted": False,  # Reset approval flag for new message
            # NOTE: `approved_skills` is intentionally NOT reset here.
            # Skill workflows often span multiple user messages (e.g. "please
            # pick which record to modify"), so the approval granted in turn N
            # must carry into the user's reply in turn N+1. LangGraph's
            # checkpointer preserves prior state values for any key we omit
            # from this dict.
            }

            api_logger.debug("Starting stream...")

            # Get checkpoint to check existing message count
            try:
                checkpoint_state = await agent_graph.aget_state(config)
                existing_messages = len(checkpoint_state.values.get("messages", [])) if checkpoint_state and checkpoint_state.values else 0
                api_logger.info(f"Existing messages in checkpoint: {existing_messages}")
            except Exception as e:
                api_logger.warning(f"Could not load checkpoint state: {e}")
                existing_messages = 0

            # Track which messages we've already sent (start from existing messages)
            sent_message_count = existing_messages

            # Stream events from graph with detailed step information
            # Use "values" mode to get complete state after each node
            async for event in agent_graph.astream(initial_state, config, stream_mode="values"):
                api_logger.debug(f"Stream event keys: {event.keys() if isinstance(event, dict) else 'not a dict'}")

                # Extract messages from complete state
                if "messages" in event:
                    messages = event["messages"]
                    api_logger.info(f"Messages in state: {len(messages)}, sent_message_count: {sent_message_count}")
                    api_logger.info(f"New messages to process: {len(messages[sent_message_count:])}")

                    # Process new messages
                    for message in messages[sent_message_count:]:
                            message_type = message.__class__.__name__
                            api_logger.info(f"Processing message type: {message_type}")

                            if message_type == "HumanMessage":
                                # User message
                                api_logger.debug(f"User message: {message.content[:100]}")
                                yield f"data: {json.dumps({'type': 'user_message', 'content': message.content})}\n\n"
                                sent_message_count += 1

                            elif message_type == "AIMessage":
                                # Log full message details
                                api_logger.info(f"AI message content: {message.content[:200] if message.content else 'None'}")
                                api_logger.info(f"AI message has tool_calls attr: {hasattr(message, 'tool_calls')}")
                                if hasattr(message, 'tool_calls'):
                                    api_logger.info(f"AI message tool_calls: {message.tool_calls}")

                                # Check for thinking content in additional_kwargs
                                thinking_content = None
                                if hasattr(message, 'additional_kwargs') and message.additional_kwargs:
                                    thinking_content = message.additional_kwargs.get('thinking')
                                    if thinking_content:
                                        api_logger.info(f"Found thinking content: {len(thinking_content)} chars")

                                # Send thinking content first if present
                                if thinking_content:
                                    api_logger.info("Yielding thinking content")
                                    yield f"data: {json.dumps({'type': 'thinking', 'content': thinking_content})}\n\n"

                                # Check if tool_calls exist and are not empty
                                if hasattr(message, 'tool_calls') and message.tool_calls:
                                    # AI is calling tools
                                    tool_calls = []
                                    for tc in message.tool_calls:
                                        tool_calls.append({
                                            'name': tc.get('name', ''),
                                            'args': tc.get('args', {}),
                                            'id': tc.get('id', '')
                                        })
                                    api_logger.info(f"Yielding tool_calls: {tool_calls}")
                                    yield f"data: {json.dumps({'type': 'tool_calls', 'tool_calls': tool_calls})}\n\n"
                                elif message.content:
                                    # AI response text - filter out function call markers
                                    if not ('<|FunctionCallBegin|>' in message.content or '<|FunctionCallEnd|>' in message.content):
                                        api_logger.debug(f"Yielding AI message: {message.content[:100]}")
                                        yield f"data: {json.dumps({'type': 'ai_message', 'content': message.content})}\n\n"
                                    else:
                                        api_logger.warning("Skipping AI message with function call markers")

                                sent_message_count += 1

                            elif message_type == "ToolMessage":
                                # Tool execution result
                                api_logger.info(f"Tool result: {message.content[:200]}")
                                tool_result = {
                                    'type': 'tool_result',
                                    'content': message.content,
                                    'tool_call_id': getattr(message, 'tool_call_id', ''),
                                    'name': getattr(message, 'name', '')
                                }
                                yield f"data: {json.dumps(tool_result)}\n\n"
                                sent_message_count += 1

            # Check if requires approval
            state_snapshot = await agent_graph.aget_state(config)
            requires_approval = state_snapshot.next == ("execute_tools",)

            api_logger.info(f"State snapshot next: {state_snapshot.next}")
            api_logger.info(f"Requires approval: {requires_approval}")

            # Get final response - find the last AIMessage that's not a tool call
            final_messages = state_snapshot.values.get("messages", [])
            final_content = ""

            # Prepare approval details if needed
            approval_details = None
            if requires_approval:
                api_logger.info("Tool execution requires approval - sending approval request")
                final_content = "正在等待操作审批..."
                from src.api.approval_utils import extract_approval_details
                _uid = user_info.get("user_id") or user_info.get("id")
                approval_details = await extract_approval_details(final_messages, _uid, db)
            else:
                # Look for the last meaningful AI response
                for msg in reversed(final_messages):
                    if msg.__class__.__name__ == "AIMessage":
                        # Skip messages with function call markers
                        if msg.content and not ('<|FunctionCallBegin|>' in msg.content or '<|FunctionCallEnd|>' in msg.content):
                            final_content = msg.content
                            break
                        # If no content but has tool_calls, skip
                        elif hasattr(msg, 'tool_calls') and msg.tool_calls:
                            continue

                # If no AI message found, look for the last ToolMessage
                if not final_content:
                    for msg in reversed(final_messages):
                        if msg.__class__.__name__ == "ToolMessage":
                            final_content = msg.content
                            break

            api_logger.info(f"Final content: {final_content[:200] if final_content else 'No content'}")
            api_logger.info(f"Sending final event with requires_approval={requires_approval}")

            final_event = {
                'type': 'final',
                'content': final_content,
                'requires_approval': requires_approval
            }
            if approval_details:
                final_event['approval_details'] = approval_details

            yield f"data: {json.dumps(final_event)}\n\n"

            api_logger.info("Stream completed successfully")
            yield "data: [DONE]\n\n"

        except Exception as e:
            api_logger.error(f"Stream error: {str(e)}", exc_info=True)
            api_logger.error(f"Traceback:\n{traceback.format_exc()}")
            error_detail = f"{type(e).__name__}: {str(e)}"
            yield f"data: {json.dumps({'type': 'error', 'error': error_detail})}\n\n"
        finally:
            # 无论成功、出错还是被取消，都尝试保存对话历史
            try:
                from sqlalchemy import select as _sel
                from src.models.workspace import ConversationHistory as _CH

                def _text(content):
                    if isinstance(content, str): return content
                    if isinstance(content, list):
                        return " ".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
                    return str(content) if content else ""

                _uid = user_info.get('user_id') or user_info.get('id')
                if _uid and agent_graph:
                    _state = await agent_graph.aget_state(config)
                    _msgs = _state.values.get("messages", []) if _state and _state.values else []
                    if _msgs:
                        _count = len([m for m in _msgs if m.__class__.__name__ in ("HumanMessage", "AIMessage")])
                        _last = ""
                        for m in reversed(_msgs):
                            if m.__class__.__name__ in ("HumanMessage", "AIMessage") and m.content:
                                _last = _text(m.content)[:200]; break
                        _title = None
                        for m in _msgs:
                            if m.__class__.__name__ == "HumanMessage" and m.content:
                                _title = _text(m.content)[:50]; break

                        # Per-conversation aggregates:
                        # `tools_called` = count of ToolMessage records in
                        # state — one per tool/skill execution. `tokens_total`
                        # sums `usage_total_tokens` stashed on AIMessage by
                        # OpenAICompatibleLLM. We recompute from full state
                        # each turn (rather than +=) so retries / forks /
                        # rollbacks self-correct without drift.
                        _tools_called = sum(
                            1 for m in _msgs if m.__class__.__name__ == "ToolMessage"
                        )
                        _tokens_total = 0
                        for m in _msgs:
                            if m.__class__.__name__ != "AIMessage":
                                continue
                            kw = getattr(m, 'additional_kwargs', None) or {}
                            try:
                                _tokens_total += int(kw.get('usage_total_tokens') or 0)
                            except (TypeError, ValueError):
                                pass

                        async with AsyncSessionLocal() as _db:
                            r = await _db.execute(_sel(_CH).where(_CH.thread_id == request.thread_id, _CH.user_id == _uid))
                            conv = r.scalar_one_or_none()
                            if conv:
                                conv.message_count = _count
                                conv.last_message = _last
                                conv.updated_at = _utc_now()
                                conv.tokens_total = _tokens_total
                                conv.tools_called = _tools_called
                                if _title and not conv.title: conv.title = _title
                            else:
                                _now = _utc_now()
                                _db.add(_CH(user_id=_uid, thread_id=request.thread_id, title=_title or "新对话",
                                           message_count=_count, last_message=_last,
                                           tokens_total=_tokens_total, tools_called=_tools_called,
                                           created_at=_now, updated_at=_now))
                            await _db.commit()
                            api_logger.info(
                                f"[finally] Saved conversation: {request.thread_id} "
                                f"(msgs={_count} tools={_tools_called} tokens={_tokens_total})"
                            )
            except Exception as _e:
                api_logger.error(f"[finally] Failed to save conversation: {_e}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
    )


@app.post(f"{API_V1}/callback", response_model=CallbackResponse)
async def callback(
    request: CallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Handle callbacks from IM platforms (e.g., Feishu button clicks).

    Args:
        request: Callback request with thread_id and action
        db: Database session

    Returns:
        Callback response
    """
    try:
        config = {"configurable": {"thread_id": request.thread_id}}

        if request.action == "approve":
            api_logger.info(f"Approval received for thread: {request.thread_id}")

            # Get state before execution to know which messages are new
            state_before = await agent_graph.aget_state(config)
            messages_before_count = len(state_before.values.get("messages", []))
            api_logger.info(f"Messages before approval execution: {messages_before_count}")

            # Update state to indicate approval has been granted
            # This prevents the interrupt from triggering again
            await agent_graph.aupdate_state(
                config,
                {"approval_granted": True}
            )
            api_logger.info("✅ State updated with approval_granted=True")

            # Resume graph execution after approval
            # This will continue from the interrupt point
            await agent_graph.ainvoke(None, config)

            # Get the updated state after execution
            state_after = await agent_graph.aget_state(config)
            all_messages = state_after.values.get("messages", [])
            api_logger.info(f"Messages after approval execution: {len(all_messages)}")

            # Extract new messages that were added after approval
            new_messages = []
            for msg in all_messages[messages_before_count:]:
                message_type = msg.__class__.__name__
                msg_dict = {
                    "type": message_type,
                    "content": msg.content if hasattr(msg, "content") else "",
                }

                # Add tool_calls for AIMessage
                if message_type == "AIMessage" and hasattr(msg, "tool_calls") and msg.tool_calls:
                    msg_dict["tool_calls"] = msg.tool_calls

                # Add tool metadata for ToolMessage
                if message_type == "ToolMessage":
                    msg_dict["tool_call_id"] = getattr(msg, "tool_call_id", "")
                    msg_dict["name"] = getattr(msg, "name", "")

                new_messages.append(msg_dict)
                api_logger.info(f"New message: {message_type} - {msg_dict.get('content', '')[:100]}")

            return CallbackResponse(
                thread_id=request.thread_id,
                status="approved",
                message="Tool execution approved and completed",
                new_messages=new_messages,
            )

        elif request.action == "reject":
            # Cancel the execution
            # You might want to add custom logic here to update state
            return CallbackResponse(
                thread_id=request.thread_id,
                status="rejected",
                message="Tool execution rejected",
            )

        else:
            raise HTTPException(status_code=400, detail="Invalid action")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{API_V1}/history/{{thread_id}}", response_model=HistoryResponse)
async def get_history(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get conversation history for a thread.

    Args:
        thread_id: Thread ID
        db: Database session

    Returns:
        Conversation history
    """
    try:
        config = {"configurable": {"thread_id": thread_id}}

        # Get state snapshot
        state_snapshot = await agent_graph.aget_state(config)

        # Convert messages to history format
        messages = []
        for msg in state_snapshot.values.get("messages", []):
            role = "user" if msg.__class__.__name__ == "HumanMessage" else "assistant"
            messages.append({
                "role": role,
                "content": msg.content,
                "timestamp": getattr(msg, "timestamp", None),
                "tool_calls": getattr(msg, "tool_calls", None),
            })

        return HistoryResponse(
            thread_id=thread_id,
            messages=messages,
            total_count=len(messages),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
