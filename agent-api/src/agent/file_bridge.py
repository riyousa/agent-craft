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

import base64
import mimetypes
import re
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import UserFile
from src.services.llm_service import resolve_model
from src.services.workspace_service import workspace_service
from src.utils.logger import api_logger


def _guess_image_mime(filename: str, declared: Optional[str]) -> Optional[str]:
    """Best-effort image mime resolver. Returns None if not an image."""
    mt = (declared or "").lower()
    if mt.startswith("image/"):
        return mt
    guess, _ = mimetypes.guess_type(filename or "")
    if guess and guess.startswith("image/"):
        return guess
    return None


def _to_data_url(file_bytes: bytes, mime: str) -> str:
    """Encode bytes as a `data:<mime>;base64,...` URL (RFC 2397)."""
    payload = base64.b64encode(file_bytes).decode("ascii")
    return f"data:{mime};base64,{payload}"


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
    if provider_key not in ("qwen", "doubao"):
        # Other providers either accept the local signed URL via egress
        # (rare) or ignore non-image attachments. Either way we don't
        # have a bridge for them yet — pass through.
        return list(file_urls)

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

            if provider_key == "qwen":
                from src.agent.llm_providers.qwen_uploader import upload_local_file as qwen_upload
                bridged = await qwen_upload(
                    api_key=cfg.api_key,
                    model_name=cfg.model,
                    file_id=user_file.id,
                    file_name=user_file.filename,
                    file_bytes=file_bytes,
                )
            else:  # doubao
                # Doubao chat API rejects Files API ids in image_url:
                #   "Only base64, http or https URLs are supported"
                # So for images we inline as a base64 data URL — works
                # universally for OpenAI-compatible image_url blocks. For
                # non-images (PDF / video / docs) fall back to the Files
                # API; downstream `_build_human_message` will emit those
                # as text references rather than image_url blocks.
                image_mime = _guess_image_mime(user_file.filename, user_file.mime_type)
                if image_mime:
                    bridged = _to_data_url(file_bytes, image_mime)
                else:
                    from src.agent.llm_providers.doubao_uploader import upload_local_file as doubao_upload
                    bridged = await doubao_upload(
                        api_key=cfg.api_key,
                        base_url=cfg.base_url,
                        model_name=cfg.model,
                        file_id=user_file.id,
                        file_name=user_file.filename,
                        file_bytes=file_bytes,
                    )
            out.append(bridged)
        except Exception as e:
            api_logger.error(
                f"[file_bridge] {provider_key} upload failed for file id {file_id}: {e}",
                exc_info=True,
            )
            # Fall back to the original URL — the request will still go out;
            # if the model can't reach it, the user sees a clearer error
            # than a silent header missing.
            out.append(url)

    return out
