"""认证工具模块 - JWT和密码处理."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from jose import JWTError, jwt, ExpiredSignatureError
import bcrypt
from src.config import settings

# JWT配置
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24h (was 7d — reduce session theft window)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def get_password_hash(password: str) -> str:
    """生成密码哈希."""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """创建JWT访问令牌.

    Args:
        user_id: 用户ID
        expires_delta: 过期时间增量

    Returns:
        JWT token
    """
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(user_id),
        "user_id": user_id,
        "iat": now,
        "exp": expire,
        "jti": secrets.token_urlsafe(16),
        "type": "access",
    }

    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[int]:
    """解码JWT令牌获取用户ID.

    Args:
        token: JWT token

    Returns:
        用户ID，如果无效则返回None
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("type") not in (None, "access"):
            return None
        user_id: int = payload.get("user_id")
        if user_id is None:
            return None
        return user_id
    except JWTError:
        return None


def decode_access_token_with_error(token: str) -> Tuple[Optional[int], Optional[str]]:
    """解码JWT令牌获取用户ID，并返回详细错误类型.

    Args:
        token: JWT token

    Returns:
        (用户ID, 错误代码) - 成功时错误代码为None
        错误代码: TOKEN_EXPIRED | TOKEN_INVALID | None
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("type") not in (None, "access"):
            return None, "TOKEN_INVALID"
        user_id: int = payload.get("user_id")
        if user_id is None:
            return None, "TOKEN_INVALID"
        return user_id, None
    except ExpiredSignatureError:
        return None, "TOKEN_EXPIRED"
    except JWTError:
        return None, "TOKEN_INVALID"
