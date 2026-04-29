"""Workspace management service."""
import os
from pathlib import Path
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.models import UserWorkspace, UserFile


class WorkspaceService:
    """用户工作空间管理服务."""

    _default_path = str(Path(__file__).parent.parent.parent / "data" / "workspaces")

    def __init__(self, base_path: str = _default_path):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def get_or_create_workspace(
        self, user_id: int, db: AsyncSession
    ) -> UserWorkspace:
        """获取或创建用户工作空间."""
        # 查找现有工作空间
        result = await db.execute(
            select(UserWorkspace).where(UserWorkspace.user_id == user_id)
        )
        workspace = result.scalar_one_or_none()

        if workspace:
            return workspace

        # 创建新工作空间
        workspace_path = self.base_path / f"user_{user_id}"
        workspace_path.mkdir(parents=True, exist_ok=True)

        # 创建子目录
        (workspace_path / "files").mkdir(exist_ok=True)
        (workspace_path / "generated").mkdir(exist_ok=True)
        (workspace_path / "sandbox").mkdir(exist_ok=True)

        # 创建元数据文件
        metadata = {
            "user_id": user_id,
            "created_at": str(Path(workspace_path).stat().st_ctime),
        }
        import json

        with open(workspace_path / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        # 保存到数据库
        workspace = UserWorkspace(
            user_id=user_id,
            workspace_path=str(workspace_path),
            max_storage_mb=1000,
            used_storage_mb=0,
        )
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)

        return workspace

    async def get_workspace_path(self, user_id: int, db: AsyncSession) -> Path:
        """获取用户工作空间路径."""
        workspace = await self.get_or_create_workspace(user_id, db)
        return Path(workspace.workspace_path)

    async def save_file(
        self,
        user_id: int,
        filename: str,
        content: bytes,
        file_type: str,
        db: AsyncSession,
        description: str = "",
    ) -> UserFile:
        """保存文件到用户工作空间."""
        import mimetypes

        # 🔒 Security: Sanitize filename to prevent path traversal
        # Remove any directory components and validate
        filename = os.path.basename(filename)
        if not filename or filename in ('.', '..'):
            raise ValueError("Invalid filename")

        # Additional validation: reject path traversal attempts
        if '..' in filename or '/' in filename or '\\' in filename:
            raise ValueError("Invalid filename: contains path traversal characters")

        workspace = await self.get_or_create_workspace(user_id, db)
        workspace_path = Path(workspace.workspace_path)

        # 确定文件类型目录
        type_dir = file_type if file_type in ["files", "generated", "sandbox"] else "files"
        target_dir = workspace_path / type_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        # 保存文件
        file_path = target_dir / filename

        # 🔒 Security: Verify the resolved path is within workspace (defense-in-depth)
        try:
            resolved_path = file_path.resolve()
            workspace_path_resolved = workspace_path.resolve()
            if not str(resolved_path).startswith(str(workspace_path_resolved)):
                raise ValueError("Security violation: file path outside workspace")
        except Exception as e:
            raise ValueError(f"Invalid file path: {e}")

        with open(file_path, "wb") as f:
            f.write(content)

        # 计算文件大小
        size_bytes = len(content)

        # 自动检测 MIME type
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "application/octet-stream"

        # 创建文件记录
        user_file = UserFile(
            user_id=user_id,
            workspace_id=workspace.id,
            filename=filename,
            filepath=f"{type_dir}/{filename}",
            file_type=file_type,
            mime_type=mime_type,
            size_bytes=size_bytes,
            description=description,
        )
        db.add(user_file)

        # `used_storage_mb` was a cached counter that quietly truncated
        # every sub-MB write because the column is INTEGER. It's now
        # recomputed live from `user_files.size_bytes` in the workspace
        # info endpoint, so we don't maintain it here anymore.
        await db.commit()
        await db.refresh(user_file)

        return user_file

    async def get_file(
        self, user_id: int, file_id: int, db: AsyncSession
    ) -> Optional[tuple[UserFile, bytes]]:
        """获取文件内容."""
        # 查找文件记录
        result = await db.execute(
            select(UserFile).where(
                UserFile.id == file_id,
                UserFile.user_id == user_id,
                UserFile.is_deleted == False,
            )
        )
        user_file = result.scalar_one_or_none()

        if not user_file:
            return None

        # 读取文件内容
        workspace = await self.get_or_create_workspace(user_id, db)
        workspace_path = Path(workspace.workspace_path)
        file_path = workspace_path / user_file.filepath

        # 🔒 Security: Verify the resolved path is within workspace (defense-in-depth)
        try:
            resolved_path = file_path.resolve()
            workspace_path_resolved = workspace_path.resolve()
            if not str(resolved_path).startswith(str(workspace_path_resolved)):
                # Log potential security violation
                from src.utils.logger import api_logger
                api_logger.warning(
                    f"Security violation attempt: file path outside workspace. "
                    f"User: {user_id}, File: {file_id}, Path: {user_file.filepath}"
                )
                return None
        except Exception:
            return None

        if not file_path.exists():
            return None

        with open(file_path, "rb") as f:
            content = f.read()

        return user_file, content

    async def get_file_by_record(self, user_file: UserFile) -> Optional[bytes]:
        """通过文件记录直接读取内容（无用户归属校验，用于公开素材访问）."""
        user_id = user_file.user_id
        workspace_dir = self.base_path / f"user_{user_id}"
        file_path = workspace_dir / user_file.filepath

        try:
            resolved = file_path.resolve()
            if not str(resolved).startswith(str(workspace_dir.resolve())):
                return None
        except Exception:
            return None

        if not file_path.exists():
            return None

        with open(file_path, "rb") as f:
            return f.read()

    async def delete_file(
        self, user_id: int, file_id: int, db: AsyncSession
    ) -> bool:
        """删除文件."""
        result = await db.execute(
            select(UserFile).where(
                UserFile.id == file_id,
                UserFile.user_id == user_id,
                UserFile.is_deleted == False,
            )
        )
        user_file = result.scalar_one_or_none()

        if not user_file:
            return False

        # 标记为已删除
        user_file.is_deleted = True

        # 尝试删除磁盘上的实际文件。任何文件系统错误（权限不足、磁盘
        # 锁定、路径已经被外部清理等）都不应阻断逻辑删除——DB 行已
        # 经标了 is_deleted，用户视图里就不会再看到该文件。
        try:
            workspace = await self.get_or_create_workspace(user_id, db)
            file_path = Path(workspace.workspace_path) / user_file.filepath
            if file_path.exists():
                file_path.unlink()
        except Exception as fs_err:  # pragma: no cover - non-fatal
            from src.utils.logger import api_logger
            api_logger.warning(
                f"[delete_file] disk unlink failed for file_id={file_id}: {fs_err!r}"
            )

        # No `used_storage_mb` decrement — workspace info now aggregates
        # live from `user_files.size_bytes WHERE is_deleted = false`,
        # so flipping the soft-delete flag above is enough to reflect
        # the freed quota on the next read.
        await db.commit()
        return True

    async def list_files(
        self, user_id: int, file_type: Optional[str], db: AsyncSession
    ) -> list[UserFile]:
        """列出用户文件."""
        query = select(UserFile).where(
            UserFile.user_id == user_id, UserFile.is_deleted == False
        )

        if file_type:
            query = query.where(UserFile.file_type == file_type)

        query = query.order_by(UserFile.created_at.desc())

        result = await db.execute(query)
        return list(result.scalars().all())


# 全局实例
workspace_service = WorkspaceService()
