"""Provider-aware file URL bridge.

Local file URLs (`/assets/<id>?sig=...`) are produced by `user_files` for
the user's workspace. Most LLM providers can't reach those URLs from
their cloud — they need the bytes pushed somewhere they can read.

This module sits between the chat HTTP handler and the LangGraph graph:
given a list of attached file URLs and the active model id, it returns
provider-friendly URLs (e.g. `oss://...` for Qwen). On any failure we
log and fall back to the original URL so the request still goes out
even if the upload bridge is misconfigured.
"""
from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import UserFile
from src.services.llm_service import resolve_model
from src.services.workspace_service import workspace_service
from src.utils.logger import api_logger


# Path-only match — query string is whatever (signed). We only need the id.
_LOCAL_ASSET_RE = re.compile(r"/assets/(\d+)(?:/|\?|$)")


def _extract_local_file_id(url: str) -> Optional[int]:
    """Pull the numeric file id out of a `/assets/<id>...` URL.

    Returns None for anything that doesn't look like a local asset URL —
    those are passed through untouched (already remote, e.g. an oss://
    or https:// URL the user pasted by hand).
    """
    if not url:
        return None
    m = _LOCAL_ASSET_RE.search(url)
    if not m:
        return None
    try:
        return int(m.group(1))
    except (TypeError, ValueError):
        return None


async def _resolve_local_file(db: AsyncSession, file_id: int) -> Optional[UserFile]:
    result = await db.execute(select(UserFile).where(UserFile.id == file_id))
    return result.scalar_one_or_none()


async def rewrite_file_urls_for_model(
    file_urls: List[str],
    *,
    model_id: Optional[str],
    db: AsyncSession,
) -> List[str]:
    """Return file URLs in a form the active model can consume.

    For Qwen, that means uploading any local files to DashScope OSS and
    swapping in the resulting `oss://` URL. Other providers keep the
    original URL — adding new bridges is a matter of adding a branch
    keyed on `provider_key`.
    """
    if not file_urls:
        return []

    try:
        cfg = await resolve_model(db, model_name=model_id, for_user=True)
    except Exception as e:
        api_logger.warning(f"[file_bridge] model resolve failed ({e}); passing URLs through unchanged")
        return list(file_urls)

    provider_key = cfg.provider_key
    if provider_key != "qwen":
        # Other providers either accept the local signed URL via egress
        # (rare) or ignore non-image attachments. Either way we don't
        # have a bridge for them yet — pass through.
        return list(file_urls)

    from src.agent.llm_providers.qwen_uploader import upload_local_file

    out: List[str] = []
    for url in file_urls:
        # Already a remote-friendly URL — leave it alone.
        if url.startswith(("oss://", "https://", "http://")) and "/assets/" not in url:
            # `https://...?token=...` for the local /assets endpoint *would*
            # contain `/assets/`, so the second clause filters those out.
            out.append(url)
            continue

        file_id = _extract_local_file_id(url)
        if file_id is None:
            api_logger.info(f"[file_bridge] not a local asset URL, leaving alone: {url}")
            out.append(url)
            continue

        try:
            user_file = await _resolve_local_file(db, file_id)
            if user_file is None:
                api_logger.warning(f"[file_bridge] file id {file_id} not found in DB; passing through")
                out.append(url)
                continue
            file_bytes = await workspace_service.get_file_by_record(user_file)
            if not file_bytes:
                api_logger.warning(
                    f"[file_bridge] file id {file_id} ({user_file.filename}) has no bytes; passing through"
                )
                out.append(url)
                continue
            oss_url = await upload_local_file(
                api_key=cfg.api_key,
                model_name=cfg.model,
                file_id=user_file.id,
                file_name=user_file.filename,
                file_bytes=file_bytes,
            )
            out.append(oss_url)
        except Exception as e:
            api_logger.error(
                f"[file_bridge] qwen upload failed for file id {file_id}: {e}",
                exc_info=True,
            )
            # Fall back to the original URL — the request will still go out;
            # if the model can't reach it, the user sees a clearer error
            # than a silent header missing.
            out.append(url)

    return out
