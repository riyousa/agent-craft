"""用户管理API - 仅管理员可访问."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime

from src.db import get_db
from src.models.user import User
from src.api.auth_deps import get_current_user
from src.utils.auth import get_password_hash

router = APIRouter(prefix="/admin/users", tags=["admin-users"])

# ========== 权限依赖 ==========

SUPER_ADMIN_LEVEL = 3


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """要求当前用户为管理员(role_level >= 2)."""
    if current_user.role_level < 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，需要管理员权限",
        )
    return current_user


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """要求当前用户为超级管理员(role_level >= 3)."""
    if current_user.role_level < SUPER_ADMIN_LEVEL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，需要超级管理员权限",
        )
    return current_user


# ========== 请求/响应模型 ==========

class UserResponse(BaseModel):
    id: int
    name: str
    phone: str
    email: Optional[str] = None
    role_level: int
    is_active: bool
    tags: Optional[List[str]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    users: List[UserResponse]
    total: int


class UserCreateRequest(BaseModel):
    name: str
    phone: str
    password: str
    email: Optional[str] = None
    role_level: int = 1
    tags: Optional[List[str]] = None


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role_level: Optional[int] = None
    is_active: Optional[bool] = None
    tags: Optional[List[str]] = None


class UserResetPasswordRequest(BaseModel):
    new_password: str


class TagListResponse(BaseModel):
    tags: List[str]


# ========== 接口 ==========

@router.get("/tags", response_model=TagListResponse)
async def list_all_tags(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取系统中所有已使用的标签."""
    result = await db.execute(select(User.tags))
    all_tags_raw = result.scalars().all()
    tags_set: set[str] = set()
    for tags in all_tags_raw:
        if tags:
            for t in tags:
                tags_set.add(t)
    return TagListResponse(tags=sorted(tags_set))


@router.get("/", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    role_level: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取用户列表（分页）."""
    query = select(User)

    if search:
        query = query.where(
            (User.name.contains(search)) | (User.phone.contains(search))
        )
    if role_level is not None:
        query = query.where(User.role_level == role_level)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 分页
    query = query.order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    # 如果按标签过滤，在应用层做（SQLite JSON支持有限）
    user_list = [UserResponse.model_validate(u) for u in users]
    if tag:
        user_list = [u for u in user_list if u.tags and tag in u.tags]

    return UserListResponse(users=user_list, total=total if not tag else len(user_list))


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取单个用户详情."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserResponse.model_validate(user)


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    req: UserCreateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """创建用户（管理员）."""
    # 超级管理员权限仅可通过数据库修改
    if req.role_level >= SUPER_ADMIN_LEVEL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="超级管理员权限仅可通过数据库直接修改",
        )
    # 不允许创建比自己权限高的用户
    if req.role_level >= admin.role_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能创建权限等级大于等于自己的用户",
        )

    existing = await db.execute(select(User).where(User.phone == req.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="手机号已存在")

    user = User(
        name=req.name,
        phone=req.phone,
        password_hash=get_password_hash(req.password),
        email=req.email,
        role_level=req.role_level,
        is_active=True,
        tags=req.tags or [],
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    req: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新用户信息."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 不能修改超级管理员（除非自己是超级管理员改自己非角色字段）
    if user.role_level >= SUPER_ADMIN_LEVEL and user.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能修改超级管理员用户",
        )
    # 不能修改权限等级 >= 自己的用户（非超级管理员场景）
    if user.role_level >= admin.role_level and user.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能修改权限等级大于等于自己的用户",
        )
    # 超级管理员权限仅可通过数据库修改
    if req.role_level is not None and req.role_level >= SUPER_ADMIN_LEVEL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="超级管理员权限仅可通过数据库直接修改",
        )
    if req.role_level is not None and req.role_level >= admin.role_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能将用户权限提升至大于等于自己的等级",
        )

    if req.name is not None:
        user.name = req.name
    if req.email is not None:
        user.email = req.email
    if req.role_level is not None:
        user.role_level = req.role_level
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.tags is not None:
        user.tags = req.tags

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    req: UserResetPasswordRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """重置用户密码."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.role_level >= admin.role_level and user.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能重置权限等级大于等于自己的用户的密码",
        )

    user.password_hash = get_password_hash(req.new_password)
    await db.commit()
    return {"message": "密码已重置"}


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除用户（仅超级管理员）."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="不能删除自己")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    await db.delete(user)
    await db.commit()
    return {"message": "用户已删除"}
