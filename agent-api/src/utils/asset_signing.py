"""HMAC-signed URLs for public asset access.

Replaces the prior unauthenticated /assets/{id} endpoint, which was vulnerable
to sequential-ID enumeration. All public asset URLs now include exp + sig query
params; the server verifies the signature before serving content.
"""
import hmac
import hashlib
import time
from typing import Optional
from src.config import settings


DEFAULT_EXPIRY_SECONDS = 12 * 3600  # 12h, matches prior lifetime


def _sig(file_id: int, exp: int) -> str:
    msg = f"{file_id}:{exp}".encode("utf-8")
    key = settings.secret_key.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def sign_asset_url(file_id: int, filename: str = "", expiry_seconds: int = DEFAULT_EXPIRY_SECONDS) -> str:
    """Return a signed relative URL like /assets/{id}/{name}?exp=...&sig=...."""
    exp = int(time.time()) + expiry_seconds
    sig = _sig(file_id, exp)
    path = f"/assets/{file_id}"
    if filename:
        path = f"{path}/{filename}"
    return f"{path}?exp={exp}&sig={sig}"


def verify_asset_sig(file_id: int, exp: Optional[int], sig: Optional[str]) -> bool:
    if exp is None or sig is None:
        return False
    if exp < int(time.time()):
        return False
    expected = _sig(file_id, exp)
    return hmac.compare_digest(expected, sig)
