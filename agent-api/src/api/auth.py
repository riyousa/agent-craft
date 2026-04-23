"""用户认证API."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models.user import User
from src.utils.auth import verify_password, get_password_hash, create_access_token
from src.api.auth_deps import get_current_user, get_current_user_id
from src.api.auth_schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserInfoResponse,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(
    request: UserRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """用户注册.

    Args:
        request: 注册信息
        db: 数据库会话

    Returns:
        Token和用户信息

    Raises:
        HTTPException: 手机号已存在
    """
    # 检查手机号是否已存在
    result = await db.execute(select(User).where(User.phone == request.phone))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="手机号已被注册",
        )

    # 检查邮箱是否已存在（如果提供）
    if request.email:
        result = await db.execute(select(User).where(User.email == request.email))
        existing_email = result.scalar_one_or_none()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用",
            )

    # 创建新用户
    user = User(
        phone=request.phone,
        name=request.name,
        email=request.email,
        password_hash=get_password_hash(request.password),
        role_level=1,  # 默认普通用户
        is_active=True,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    # 生成token
    access_token = create_access_token(user.id)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserInfoResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """用户登录.

    Args:
        request: 登录信息
        db: 数据库会话

    Returns:
        Token和用户信息

    Raises:
        HTTPException: 认证失败
    """
    # 查找用户
    result = await db.execute(select(User).where(User.phone == request.phone))
    user = result.scalar_one_or_none()

    # 验证用户和密码
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="手机号或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 检查用户是否被禁用
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用，请联系管理员",
        )

    # 生成token
    access_token = create_access_token(user.id)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserInfoResponse.model_validate(user),
    )


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """获取当前用户信息.

    Args:
        current_user: 当前登录用户

    Returns:
        用户信息
    """
    return UserInfoResponse.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """修改密码.

    Args:
        request: 修改密码请求
        current_user: 当前登录用户
        db: 数据库会话

    Returns:
        成功消息

    Raises:
        HTTPException: 旧密码错误
    """
    # 验证旧密码
    if not verify_password(request.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误",
        )

    # 更新密码
    current_user.password_hash = get_password_hash(request.new_password)
    await db.commit()

    return {"message": "密码修改成功"}


@router.post("/logout")
async def logout(
    user_id: int = Depends(get_current_user_id),
):
    """登出（客户端需要清除token）.

    Args:
        user_id: 当前用户ID

    Returns:
        成功消息
    """
    # JWT是无状态的，登出主要由客户端处理（删除token）
    # 服务端可以在这里记录登出日志或其他操作
    return {"message": "登出成功"}
