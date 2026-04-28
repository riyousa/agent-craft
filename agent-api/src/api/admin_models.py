"""Admin API for LLM model management."""
from __future__ import annotations

import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.agent.llm_providers import list_providers
from src.api.admin_schemas import (
    LLMModelCreateRequest,
    LLMModelPartialUpdate,
    LLMModelResponse,
    LLMModelTestRequest,
    LLMModelUpdateRequest,
    UserVisibleModel,
)
from src.api.admin_users import require_super_admin
from src.api.auth_deps import get_current_user_id
from src.db import get_db
from src.models import LLMModel, User
from src.services.llm_service import (
    LLMConfigError,
    invalidate_cache,
    mask_api_key,
    resolve_model,
)
from src.utils.logger import api_logger

router = APIRouter(prefix="/admin/models", tags=["admin-models"])
user_router = APIRouter(prefix="/user/models", tags=["user-models"])


def _to_response(row: LLMModel) -> LLMModelResponse:
    return LLMModelResponse(
        id=row.id,
        name=row.name,
        display_name=row.display_name,
        description=row.description or "",
        provider=row.provider,
        model=row.model,
        api_key_masked=mask_api_key(row.api_key or ""),
        base_url=row.base_url or "",
        extra_config=dict(row.extra_config or {}),
        enabled=row.enabled,
        visible_to_users=row.visible_to_users,
        is_default=row.is_default,
        sort_order=row.sort_order,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/providers")
async def get_providers(admin: User = Depends(require_super_admin)):
    """返回内置 provider 注册表 — 前端用来填表单的 provider 下拉。"""
    return {"providers": list_providers()}


@router.get("/", response_model=List[LLMModelResponse])
async def list_models(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LLMModel).order_by(LLMModel.sort_order.asc(), LLMModel.id.asc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/", response_model=LLMModelResponse)
async def create_model(
    request: LLMModelCreateRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    payload = request.model_def

    # Uniqueness check on slug
    existing = await db.execute(select(LLMModel).where(LLMModel.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"模型名称 '{payload.name}' 已存在")

    new_row = LLMModel(
        name=payload.name,
        display_name=payload.display_name,
        description=payload.description,
        provider=payload.provider,
        model=payload.model,
        api_key=payload.api_key,
        base_url=payload.base_url,
        extra_config=payload.extra_config or {},
        enabled=payload.enabled,
        visible_to_users=payload.visible_to_users,
        is_default=False,  # set via dedicated PATCH below to enforce single-default invariant
        sort_order=payload.sort_order,
    )
    db.add(new_row)
    await db.flush()

    if payload.is_default:
        await _set_default_unique(db, new_row.id)

    await db.commit()
    await db.refresh(new_row)
    invalidate_cache()
    return _to_response(new_row)


@router.put("/{model_id}", response_model=LLMModelResponse)
async def update_model(
    model_id: int,
    request: LLMModelUpdateRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_or_404(db, model_id)
    patch = request.model_def

    # All fields are optional. `api_key=""` (empty string) is treated as
    # "leave key unchanged" so the admin UI can safely PATCH other fields
    # without having to round-trip the secret.
    data = patch.model_dump(exclude_unset=True)
    if "api_key" in data and (data["api_key"] is None or data["api_key"] == ""):
        data.pop("api_key")

    is_default_request = data.pop("is_default", None)

    # Uniqueness check if renaming
    if "name" in data and data["name"] != row.name:
        existing = await db.execute(select(LLMModel).where(LLMModel.name == data["name"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"模型名称 '{data['name']}' 已存在")

    for k, v in data.items():
        setattr(row, k, v)

    if is_default_request is True:
        await _set_default_unique(db, row.id)
    elif is_default_request is False:
        row.is_default = False

    await db.commit()
    await db.refresh(row)
    invalidate_cache(row.name)
    return _to_response(row)


@router.delete("/{model_id}")
async def delete_model(
    model_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_or_404(db, model_id)
    name = row.name
    await db.delete(row)
    await db.commit()
    invalidate_cache(name)
    return {"ok": True, "message": f"模型 '{name}' 已删除"}


@router.post("/{model_id}/test")
async def test_model(
    model_id: int,
    request: Optional[LLMModelTestRequest] = None,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """实际发一次极短 chat completion，验证连通性 + key 有效性."""
    row = await _get_or_404(db, model_id)

    prompt = (request.prompt if request else None) or "ping"
    start = time.time()
    try:
        # Bypass visibility check — admin testing should work even if
        # `visible_to_users=False` while debugging a not-yet-released model.
        cfg = await resolve_model(db, model_name=row.name, for_user=False)
    except LLMConfigError as e:
        return {"ok": False, "message": str(e), "latency_ms": 0}

    # Build a one-shot non-streaming client and ping it.
    from openai import AsyncOpenAI

    try:
        client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
        resp = await client.chat.completions.create(
            model=cfg.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=16,
            temperature=0.0,
            stream=False,
        )
        latency = int((time.time() - start) * 1000)
        text = ""
        if resp.choices and resp.choices[0].message:
            text = resp.choices[0].message.content or ""
        return {
            "ok": True,
            "message": f"调用成功 ({latency}ms)",
            "latency_ms": latency,
            "data": {"reply": text[:500]},
        }
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        api_logger.error(f"test_model failed for {row.name}: {e}", exc_info=True)
        return {"ok": False, "message": str(e), "latency_ms": latency}


# ---------------------------------------------------------------------------
# User endpoints (any authenticated user)
# ---------------------------------------------------------------------------


@user_router.get("", response_model=List[UserVisibleModel])
async def list_user_visible_models(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """返回当前用户可选的模型清单（enabled & visible_to_users）。"""
    from src.agent.llm_providers import get_provider

    result = await db.execute(
        select(LLMModel)
        .where(LLMModel.enabled == True, LLMModel.visible_to_users == True)  # noqa: E712
        .order_by(LLMModel.is_default.desc(), LLMModel.sort_order.asc(), LLMModel.id.asc())
    )
    rows = result.scalars().all()

    out: List[UserVisibleModel] = []
    for r in rows:
        try:
            spec = get_provider(r.provider)
            supports_reasoning = spec.supports_reasoning
            supports_file_upload = spec.supports_file_upload
        except Exception:
            supports_reasoning = False
            supports_file_upload = False
        # Allow per-model override via extra_config — handy when only some
        # of a provider's models actually take attachments (e.g. only
        # qwen-vl-* in the Qwen family).
        extra = r.extra_config or {}
        if "supports_file_upload" in extra:
            supports_file_upload = bool(extra.get("supports_file_upload"))
        if "supports_reasoning" in extra:
            supports_reasoning = bool(extra.get("supports_reasoning"))
        out.append(
            UserVisibleModel(
                name=r.name,
                display_name=r.display_name,
                description=r.description or "",
                provider=r.provider,
                supports_reasoning=supports_reasoning,
                supports_file_upload=supports_file_upload,
                is_default=r.is_default,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, model_id: int) -> LLMModel:
    row = await db.get(LLMModel, model_id)
    if not row:
        raise HTTPException(status_code=404, detail="模型不存在")
    return row


async def _set_default_unique(db: AsyncSession, model_id: int) -> None:
    """Maintain at most one row with `is_default=True`."""
    await db.execute(
        update(LLMModel).where(LLMModel.id != model_id).values(is_default=False)
    )
    await db.execute(
        update(LLMModel).where(LLMModel.id == model_id).values(is_default=True)
    )
