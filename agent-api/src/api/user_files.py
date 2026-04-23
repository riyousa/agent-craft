"""User file management API."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from src.db import get_db
from src.models import UserFile
from src.services.workspace_service import workspace_service
from src.api.user_schemas import (
    FileUploadResponse,
    FileListResponse,
    WorkspaceInfoResponse,
)
from src.api.auth_deps import get_current_user_id
from typing import List, Optional
import io

router = APIRouter(prefix="/user/files", tags=["user-files"])


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form("files"),
    description: str = Form(""),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """上传文件."""

    # 🔒 Security: Validate file_type
    allowed_types = ["files", "generated", "sandbox", "assets"]
    if file_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file_type. Must be one of: {', '.join(allowed_types)}"
        )

    # 🔒 Security: Read file with size limit (100MB max)
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    content = bytearray()

    while chunk := await file.read(8192):  # Read in 8KB chunks
        content.extend(chunk)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
            )

    content = bytes(content)

    # 保存文件
    try:
        user_file = await workspace_service.save_file(
            user_id=user_id,
            filename=file.filename or "unnamed",
            content=content,
            file_type=file_type,
            db=db,
            description=description,
        )
    except ValueError as e:
        # Catch filename validation errors from workspace_service
        raise HTTPException(status_code=400, detail=str(e))

    from src.utils.asset_signing import sign_asset_url
    asset_url = (
        sign_asset_url(user_file.id, user_file.filename)
        if user_file.file_type in ("assets", "generated")
        else None
    )

    return FileUploadResponse(
        id=user_file.id,
        filename=user_file.filename,
        filepath=user_file.filepath,
        file_type=user_file.file_type,
        size_bytes=user_file.size_bytes,
        created_at=user_file.created_at,
        asset_url=asset_url,
    )


@router.get("/", response_model=List[FileListResponse])
async def list_files(
    file_type: Optional[str] = None,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """列出用户文件."""

    files = await workspace_service.list_files(user_id, file_type, db)

    from src.utils.asset_signing import sign_asset_url
    return [
        FileListResponse(
            id=f.id,
            filename=f.filename,
            filepath=f.filepath,
            file_type=f.file_type,
            size_bytes=f.size_bytes,
            description=f.description,
            created_at=f.created_at,
            updated_at=f.updated_at,
            asset_url=(
                sign_asset_url(f.id, f.filename)
                if f.file_type in ("assets", "generated")
                else None
            ),
        )
        for f in files
    ]


@router.get("/{file_id}/download")
async def download_file(
    file_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """下载文件."""

    result = await workspace_service.get_file(user_id, file_id, db)

    if not result:
        raise HTTPException(status_code=404, detail="File not found")

    user_file, content = result

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{user_file.filename}"'
        },
    )


@router.get("/{file_id}/view/{filename:path}")
@router.get("/{file_id}/view")
async def view_file(
    file_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    filename: str = "",
):
    """直接查看/播放文件（用于图片、视频等媒体文件）."""

    result = await workspace_service.get_file(user_id, file_id, db)

    if not result:
        raise HTTPException(status_code=404, detail="File not found")

    user_file, content = result

    # 根据文件类型设置正确的 MIME type
    mime_type = user_file.mime_type or "application/octet-stream"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{user_file.filename}"'
        },
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除文件."""

    success = await workspace_service.delete_file(user_id, file_id, db)

    if not success:
        raise HTTPException(status_code=404, detail="File not found")

    return {"message": "File deleted successfully"}


@router.get("/workspace/info", response_model=WorkspaceInfoResponse)
async def get_workspace_info(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取工作空间信息."""

    workspace = await workspace_service.get_or_create_workspace(user_id, db)

    # 统计文件数量
    result = await db.execute(
        select(func.count(UserFile.id)).where(
            UserFile.user_id == user_id, UserFile.is_deleted == False
        )
    )
    file_count = result.scalar() or 0

    return WorkspaceInfoResponse(
        id=workspace.id,
        user_id=workspace.user_id,
        workspace_path=workspace.workspace_path,
        max_storage_mb=workspace.max_storage_mb,
        used_storage_mb=int(workspace.used_storage_mb),
        file_count=file_count,
    )


# ========== Public asset access (no auth, 12h expiry) ==========

ASSET_EXPIRY_HOURS = 12

# Separate router without auth prefix
public_router = APIRouter(tags=["public-assets"])


@public_router.get("/assets/{file_id}/{filename:path}")
@public_router.get("/assets/{file_id}")
async def get_public_asset(
    file_id: int,
    exp: Optional[int] = Query(None),
    sig: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    filename: str = "",
):
    """HMAC-signed public asset access.

    Requires ?exp=<unix_ts>&sig=<hmac> query params generated by
    `utils.asset_signing.sign_asset_url`. Unsigned or expired URLs are rejected.
    """
    from src.utils.asset_signing import verify_asset_sig

    if not verify_asset_sig(file_id, exp, sig):
        raise HTTPException(status_code=403, detail="Invalid or expired asset signature")

    result = await db.execute(
        select(UserFile).where(
            UserFile.id == file_id,
            UserFile.file_type.in_(["assets", "generated"]),
            UserFile.is_deleted == False,
        )
    )
    user_file = result.scalar_one_or_none()

    if not user_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    # Read file content
    file_content = await workspace_service.get_file_by_record(user_file)
    if not file_content:
        raise HTTPException(status_code=404, detail="文件内容不存在")

    mime_type = getattr(user_file, 'mime_type', None) or "application/octet-stream"

    return StreamingResponse(
        io.BytesIO(file_content),
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{user_file.filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )
