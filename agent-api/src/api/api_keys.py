"""API Key management endpoints."""
import secrets
import hashlib
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from src.db import get_db
from src.models.api_key import ApiKey
from src.models.user import User
from src.api.auth_deps import get_current_user

router = APIRouter(prefix="/auth/api-keys", tags=["api-keys"])


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _generate_key() -> str:
    return f"sk-{secrets.token_urlsafe(32)}"


# ========== Schemas ==========

class ApiKeyCreateRequest(BaseModel):
    name: str
    auto_approve: bool = False


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    is_active: bool
    auto_approve: bool = False
    last_used_at: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Only returned on creation — includes the full key."""
    full_key: str


# ========== Endpoints ==========

@router.get("/", response_model=List[ApiKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出当前用户的所有 API Key."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == current_user.id).order_by(ApiKey.created_at.desc())
    )
    return [ApiKeyResponse.model_validate(k) for k in result.scalars().all()]


@router.post("/", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(
    request: ApiKeyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建 API Key. 返回的 full_key 仅此一次可见."""
    raw_key = _generate_key()
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:11]  # "sk-" + first 8 chars

    api_key = ApiKey(
        user_id=current_user.id,
        name=request.name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        is_active=True,
        auto_approve=request.auto_approve,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return ApiKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        full_key=raw_key,
    )


@router.delete("/{key_id}")
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除 API Key."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key 不存在")

    await db.delete(api_key)
    await db.commit()
    return {"message": "已删除"}


# ========== Helper: resolve user from API key ==========

from typing import Tuple


async def get_user_and_key(raw_key: str, db: AsyncSession) -> Optional[Tuple[User, ApiKey]]:
    """Look up the user AND the api_key record from a raw key string.

    Returns (User, ApiKey) or None if the key is invalid/inactive.
    """
    key_hash = _hash_key(raw_key)
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
    )
    api_key_record = result.scalar_one_or_none()
    if not api_key_record:
        return None

    api_key_record.last_used_at = datetime.now().isoformat()
    await db.commit()

    user_result = await db.execute(select(User).where(User.id == api_key_record.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return None
    return user, api_key_record


async def get_user_from_api_key(raw_key: str, db: AsyncSession) -> Optional[User]:
    """Backwards-compatible helper — returns just the User."""
    pair = await get_user_and_key(raw_key, db)
    return pair[0] if pair else None
