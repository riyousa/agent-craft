"""DashScope (千问) temporary-URL upload bridge.

Qwen's OpenAI-compatible chat endpoint accepts file attachments only as
`oss://...` URLs that point at DashScope's temporary OSS storage. The
local `/assets/<id>` URLs the rest of the app produces are unreachable
from Aliyun's side, so when the active model is a Qwen variant we have
to push file bytes through the upload API and swap the URLs before the
chat request is built.

The flow (per the official docs):

    1. GET  /api/v1/uploads?action=getPolicy&model=<model>
        → { upload_host, upload_dir, oss_access_key_id, signature,
            policy, x_oss_object_acl, x_oss_forbid_overwrite, ... }
    2. POST {upload_host}  (multipart form with the policy fields + file)
        → 200 OK, no useful body
    3. The chat endpoint receives `oss://<key>` and the request must
       carry `X-DashScope-OssResourceResolve: enable` (handled by
       `base.py:_qwen_extra_headers`, not here).

Caching: results are cached in-process for ~30 min keyed by the local
file id + model name. DashScope says the URL is valid for 48 h, but we
cache shorter to avoid risk of stale entries on the rare admin-side
file replacement. Cache misses re-upload — cheap.
"""
from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Optional, Tuple

import httpx

from src.utils.logger import api_logger


_GET_POLICY_URL = "https://dashscope.aliyuncs.com/api/v1/uploads"
_CACHE_TTL_SEC = 30 * 60  # 30 minutes — short enough to avoid stale, long enough to amortize.

# (model_name, file_id) -> (oss_url, expires_at_epoch)
_oss_cache: dict[Tuple[str, int], Tuple[str, float]] = {}
_cache_lock = asyncio.Lock()


def _cache_get(key: Tuple[str, int]) -> Optional[str]:
    entry = _oss_cache.get(key)
    if not entry:
        return None
    url, exp = entry
    if exp <= time.time():
        _oss_cache.pop(key, None)
        return None
    return url


def _cache_put(key: Tuple[str, int], url: str) -> None:
    _oss_cache[key] = (url, time.time() + _CACHE_TTL_SEC)


async def _get_upload_policy(client: httpx.AsyncClient, api_key: str, model_name: str) -> dict:
    resp = await client.get(
        _GET_POLICY_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        params={"action": "getPolicy", "model": model_name},
        timeout=20.0,
    )
    resp.raise_for_status()
    payload = resp.json() or {}
    data = payload.get("data") or {}
    required = (
        "upload_host",
        "upload_dir",
        "oss_access_key_id",
        "signature",
        "policy",
        "x_oss_object_acl",
        "x_oss_forbid_overwrite",
    )
    missing = [k for k in required if k not in data]
    if missing:
        raise RuntimeError(f"DashScope getPolicy missing fields: {missing}; payload={payload!r}")
    return data


async def _upload_file_to_oss(
    client: httpx.AsyncClient,
    policy: dict,
    file_name: str,
    file_bytes: bytes,
) -> str:
    """Push the bytes to DashScope's temp OSS bucket and return the oss:// URL."""
    key = f"{policy['upload_dir']}/{file_name}"
    files = {
        "OSSAccessKeyId": (None, policy["oss_access_key_id"]),
        "Signature": (None, policy["signature"]),
        "policy": (None, policy["policy"]),
        "x-oss-object-acl": (None, policy["x_oss_object_acl"]),
        "x-oss-forbid-overwrite": (None, policy["x_oss_forbid_overwrite"]),
        "key": (None, key),
        "success_action_status": (None, "200"),
        "file": (file_name, file_bytes),
    }
    resp = await client.post(policy["upload_host"], files=files, timeout=60.0)
    resp.raise_for_status()
    return f"oss://{key}"


async def upload_local_file(
    *,
    api_key: str,
    model_name: str,
    file_id: int,
    file_name: str,
    file_bytes: bytes,
) -> str:
    """Upload a local file to DashScope OSS and return the `oss://...` URL.

    Cached per (model, file_id). Caller is responsible for sourcing
    `file_bytes` from the workspace.
    """
    cache_key = (model_name, file_id)
    async with _cache_lock:
        cached = _cache_get(cache_key)
        if cached:
            api_logger.debug(
                f"[qwen_uploader] cache hit for ({model_name}, {file_id}) → {cached}"
            )
            return cached

    safe_name = Path(file_name).name or f"file_{file_id}"
    api_logger.info(
        f"[qwen_uploader] uploading {safe_name!r} (id={file_id}) for model={model_name!r}"
    )

    async with httpx.AsyncClient() as client:
        policy = await _get_upload_policy(client, api_key, model_name)
        oss_url = await _upload_file_to_oss(client, policy, safe_name, file_bytes)

    async with _cache_lock:
        _cache_put(cache_key, oss_url)
    api_logger.info(f"[qwen_uploader] success → {oss_url}")
    return oss_url
