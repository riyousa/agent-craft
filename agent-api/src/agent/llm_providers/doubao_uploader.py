"""Doubao (火山方舟) Files API upload bridge.

Doubao's vision / video / PDF understanding requires assets that live
inside Volcano's storage — local `/assets/<id>` URLs aren't reachable
from their cloud. This module mirrors `qwen_uploader.py`: it pushes
file bytes through the Files API (`POST /api/v3/files`) and returns a
`file-xxx` id that downstream code can hand to the chat request.

The Files API is documented here:
    https://www.volcengine.com/docs/82379

Defaults applied:
    purpose     = "user_data"   (mandatory for multimodal usage)
    expire_at   = now + 86400   (1 day — admin can extend up to 30 days)

The upload response contains `status: "processing" | "active"`. We
try to wait until `active` before returning, but with a short cap so
the chat handler never blocks for more than a few seconds. Most image
uploads flip to active in <1 s; large videos / PDFs may still be
processing when chat hits — caller can retry.
"""
from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Optional, Tuple

import httpx

from src.utils.logger import api_logger


_DEFAULT_FILES_PATH = "/files"
_DEFAULT_EXPIRE_SECONDS = 24 * 60 * 60  # 1 day
# Just under the 1-day expiry so we never hand back a soon-to-expire id.
_CACHE_TTL_SEC = 20 * 60 * 60  # 20 hours

# (model_name, file_id) -> (doubao_file_id, expires_at_epoch)
_file_cache: dict[Tuple[str, int], Tuple[str, float]] = {}
_cache_lock = asyncio.Lock()


def _cache_get(key: Tuple[str, int]) -> Optional[str]:
    entry = _file_cache.get(key)
    if not entry:
        return None
    fid, exp = entry
    if exp <= time.time():
        _file_cache.pop(key, None)
        return None
    return fid


def _cache_put(key: Tuple[str, int], file_id: str) -> None:
    _file_cache[key] = (file_id, time.time() + _CACHE_TTL_SEC)


def _resolve_files_url(base_url: str) -> str:
    """Strip trailing /chat/completions or similar and append /files."""
    base = (base_url or "").rstrip("/")
    if not base:
        # Sensible default for the Beijing region.
        return "https://ark.cn-beijing.volces.com/api/v3/files"
    # If the configured base_url already ends with `/v3` etc., just
    # append `/files`. Don't try to be clever about other suffixes.
    return f"{base}{_DEFAULT_FILES_PATH}"


async def _wait_until_active(
    client: httpx.AsyncClient,
    api_key: str,
    files_url: str,
    file_id: str,
    *,
    max_wait_seconds: float = 5.0,
    poll_interval: float = 0.5,
) -> bool:
    """Poll `GET /files/{id}` until status flips to `active` or we time out.

    Returns True if active, False if still processing after max_wait. We
    return the id either way — Doubao will surface a clearer error than
    we can if the model is queried before the file is ready.
    """
    deadline = time.monotonic() + max_wait_seconds
    while time.monotonic() < deadline:
        try:
            resp = await client.get(
                f"{files_url}/{file_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10.0,
            )
            if resp.status_code == 200:
                payload = resp.json() or {}
                status = (payload.get("status") or "").lower()
                if status == "active":
                    return True
                if status in ("failed", "error"):
                    api_logger.warning(
                        f"[doubao_uploader] file {file_id} reported status={status!r}; payload={payload!r}"
                    )
                    return False
        except Exception as e:
            api_logger.debug(f"[doubao_uploader] poll error for {file_id}: {e}")
        await asyncio.sleep(poll_interval)
    return False


async def upload_local_file(
    *,
    api_key: str,
    base_url: str,
    model_name: str,
    file_id: int,
    file_name: str,
    file_bytes: bytes,
    expire_seconds: int = _DEFAULT_EXPIRE_SECONDS,
) -> str:
    """Upload a local file to Doubao's Files API and return its `file-...` id.

    Cached per (model_name, file_id) for ~20h so repeating the same
    attachment within a turn doesn't re-upload.
    """
    cache_key = (model_name, file_id)
    async with _cache_lock:
        cached = _cache_get(cache_key)
        if cached:
            api_logger.debug(
                f"[doubao_uploader] cache hit for ({model_name}, {file_id}) → {cached}"
            )
            return cached

    safe_name = Path(file_name).name or f"file_{file_id}"
    files_url = _resolve_files_url(base_url)
    expire_at = int(time.time()) + max(60, int(expire_seconds))

    api_logger.info(
        f"[doubao_uploader] uploading {safe_name!r} (id={file_id}) "
        f"to {files_url} expire_at={expire_at}"
    )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            files_url,
            headers={"Authorization": f"Bearer {api_key}"},
            data={
                "purpose": "user_data",
                "expire_at": str(expire_at),
            },
            files={"file": (safe_name, file_bytes)},
            timeout=180.0,  # large videos / PDFs can take a while
        )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Doubao Files API rejected upload: HTTP {resp.status_code} {resp.text!r}"
            )
        payload = resp.json() or {}
        doubao_file_id = payload.get("id")
        if not doubao_file_id:
            raise RuntimeError(f"Doubao Files API returned no id: {payload!r}")

        # Wait briefly for `active` so the model can actually use the file
        # on the same turn. Best-effort — we don't fail if it's still
        # processing past the cap.
        await _wait_until_active(client, api_key, files_url, doubao_file_id)

    async with _cache_lock:
        _cache_put(cache_key, doubao_file_id)
    api_logger.info(f"[doubao_uploader] success → {doubao_file_id}")
    return doubao_file_id
