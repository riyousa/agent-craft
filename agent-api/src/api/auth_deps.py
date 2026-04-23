"""认证依赖 - 获取当前用户."""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models.user import User
from src.utils.auth import decode_access_token_with_error

# HTTP Bearer token scheme (auto_error=False to handle missing tokens ourselves)
security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    """从JWT token中获取当前用户ID.

    Args:
        credentials: HTTP Bearer认证凭据

    Returns:
        用户ID

    Raises:
        HTTPException: 认证失败
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "TOKEN_MISSING",
                "message": "未提供认证令牌，请先登录"
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    user_id, error_code = decode_access_token_with_error(token)

    if error_code:
        error_messages = {
            "TOKEN_EXPIRED": "认证令牌已过期，请重新登录",
            "TOKEN_INVALID": "认证令牌无效，请重新登录",
        }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": error_code,
                "message": error_messages.get(error_code, "认证失败")
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id


async def get_current_user(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    """获取当前用户完整信息.

    Args:
        user_id: 用户ID（从token中提取）
        db: 数据库会话

    Returns:
        用户对象

    Raises:
        HTTPException: 用户不存在或已禁用
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """获取当前激活用户（别名，与get_current_user相同）."""
    return current_user


# 可选的认证依赖（用于不强制登录的接口）
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """获取当前用户（可选，不强制登录）.

    Args:
        credentials: HTTP Bearer认证凭据（可选）
        db: 数据库会话

    Returns:
        用户对象或None
    """
    if credentials is None:
        return None

    user_id, _ = decode_access_token_with_error(credentials.credentials)
    if user_id is None:
        return None

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    return result.scalar_one_or_none()
