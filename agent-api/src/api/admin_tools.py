"""Admin API for tool management."""
import fastapi
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from src.db import get_db
from src.models import AdminTool, UserTool, User
from src.api.admin_schemas import (
    ToolCreateRequest,
    ToolUpdateRequest,
    ToolResponse,
    UserToolResponse,
    AssignToolRequest,
    AssignmentResponse,
    RevokeRequest,
)
from src.api.admin_users import require_super_admin
from typing import List
import uuid

router = APIRouter(prefix="/admin/tools", tags=["admin-tools"])


def generate_tool_id() -> str:
    """生成唯一的tool_id."""
    return f"tool_{uuid.uuid4().hex[:12]}"


@router.get("/", response_model=List[ToolResponse])
async def list_admin_tools(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取所有管理员工具列表."""
    result = await db.execute(select(AdminTool).order_by(AdminTool.created_at.desc()))
    tools = result.scalars().all()
    return [
        ToolResponse(
            id=tool.id,
            tool_id=tool.tool_id,
            name=tool.name,
            display_name=tool.display_name,
            description=tool.description,
            version=tool.version,
            calling_guide=tool.calling_guide,
            calling_examples=tool.calling_examples,
            input_schema=tool.input_schema,
            output_schema=tool.output_schema,
            execution=tool.execution,
            requires_approval=tool.requires_approval,
            required_role_level=tool.required_role_level,
            enabled=tool.enabled,
            is_builtin=tool.is_builtin,
            created_at=tool.created_at,
            updated_at=tool.updated_at,
        )
        for tool in tools
    ]


@router.post("/", response_model=ToolResponse)
async def create_admin_tool(
    request: ToolCreateRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """创建新的管理员工具."""
    tool_data = request.tool

    # 生成tool_id如果未提供
    if not tool_data.tool_id:
        tool_data.tool_id = generate_tool_id()

    # 检查tool_id是否已存在
    result = await db.execute(
        select(AdminTool).where(AdminTool.tool_id == tool_data.tool_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tool ID already exists")

    # 检查name是否已存在
    result = await db.execute(
        select(AdminTool).where(AdminTool.name == tool_data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"工具名称 '{tool_data.name}' 已存在")

    # 创建新工具
    new_tool = AdminTool(
        tool_id=tool_data.tool_id,
        name=tool_data.name,
        display_name=tool_data.display_name,
        description=tool_data.description,
        version=tool_data.version,
        calling_guide=tool_data.calling_guide,
        calling_examples=[ex.model_dump() for ex in tool_data.calling_examples],
        input_schema=tool_data.input_schema.model_dump(),
        output_schema=tool_data.output_schema.model_dump(),
        execution=tool_data.execution.model_dump(),
        requires_approval=tool_data.requires_approval,
        required_role_level=tool_data.required_role_level,
        enabled=tool_data.enabled,
        is_builtin=tool_data.is_builtin,
    )

    db.add(new_tool)
    await db.commit()
    await db.refresh(new_tool)

    return ToolResponse(
        id=new_tool.id,
        tool_id=new_tool.tool_id,
        name=new_tool.name,
        display_name=new_tool.display_name,
        description=new_tool.description,
        version=new_tool.version,
        calling_guide=new_tool.calling_guide,
        calling_examples=new_tool.calling_examples,
        input_schema=new_tool.input_schema,
        output_schema=new_tool.output_schema,
        execution=new_tool.execution,
        requires_approval=new_tool.requires_approval,
        required_role_level=new_tool.required_role_level,
        enabled=new_tool.enabled,
        is_builtin=new_tool.is_builtin,
        created_at=new_tool.created_at,
        updated_at=new_tool.updated_at,
    )


@router.put("/{tool_id}", response_model=ToolResponse)
async def update_admin_tool(
    tool_id: str,
    request: ToolUpdateRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新管理员工具."""
    result = await db.execute(select(AdminTool).where(AdminTool.tool_id == tool_id))
    tool = result.scalar_one_or_none()

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    # Partial update: only touch fields the caller actually sent.
    # Lets the admin UI toggle one attribute (e.g. `enabled`) without having
    # to round-trip the full tool definition.
    from sqlalchemy.orm.attributes import flag_modified as _flag_modified
    tool_data = request.tool
    patch = tool_data.model_dump(exclude_unset=True)

    json_fields = {"calling_examples", "input_schema", "output_schema", "execution"}
    for key, value in patch.items():
        # Pydantic sub-models already serialized to dicts/lists by model_dump.
        setattr(tool, key, value)
        if key in json_fields:
            _flag_modified(tool, key)

    await db.commit()
    await db.refresh(tool)

    return ToolResponse(
        id=tool.id,
        tool_id=tool.tool_id,
        name=tool.name,
        display_name=tool.display_name,
        description=tool.description,
        version=tool.version,
        calling_guide=tool.calling_guide,
        calling_examples=tool.calling_examples,
        input_schema=tool.input_schema,
        output_schema=tool.output_schema,
        execution=tool.execution,
        requires_approval=tool.requires_approval,
        required_role_level=tool.required_role_level,
        enabled=tool.enabled,
        is_builtin=tool.is_builtin,
        created_at=tool.created_at,
        updated_at=tool.updated_at,
    )


@router.post("/mcp/discover")
async def admin_discover_mcp_tools(
    request: dict = fastapi.Body(...),
    admin: User = Depends(require_super_admin),
):
    """连接 MCP server 列出工具（管理员侧）."""
    from src.tools.adapters.mcp import mcp_adapter

    mcp_cfg = request.get("mcp") or {}
    if not (mcp_cfg.get("url") or mcp_cfg.get("command")):
        raise HTTPException(status_code=400, detail="缺少 MCP server URL 或 command")

    try:
        tools = await mcp_adapter.list_remote_tools(mcp_cfg)
        return {"ok": True, "tools": tools}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"无法连接 MCP server: {e}")


@router.post("/mcp/import")
async def admin_import_mcp_tools(
    request: dict = fastapi.Body(...),
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """将 MCP server 上选中的工具批量插入 admin_tools（全局工具模板）."""
    from src.tools.adapters.mcp import json_schema_to_parameters

    mcp_cfg = request.get("mcp") or {}
    selected = request.get("tools") or []
    if not (mcp_cfg.get("url") or mcp_cfg.get("command")):
        raise HTTPException(status_code=400, detail="缺少 MCP server URL 或 command")
    if not selected:
        raise HTTPException(status_code=400, detail="未选择任何工具")

    existing_result = await db.execute(select(AdminTool.name))
    existing_names = {row for row in existing_result.scalars().all()}

    inserted: list[str] = []
    skipped: list[str] = []
    for item in selected:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        if name in existing_names:
            skipped.append(name)
            continue

        parameters = json_schema_to_parameters(item.get("input_schema") or {})
        execution = {
            "type": "mcp",
            "mcp": {
                **mcp_cfg,
                "tool_name": name,
            },
        }

        new_tool = AdminTool(
            tool_id=generate_tool_id(),
            name=name,
            display_name=item.get("display_name") or name,
            description=item.get("description") or "",
            version="1.0",
            calling_guide="",
            calling_examples=[],
            input_schema={"parameters": parameters},
            output_schema={"type": "object", "item_fields": []},
            execution=execution,
            requires_approval=bool(item.get("requires_approval", False)),
            required_role_level=1,
            enabled=True,
            is_builtin=False,
        )
        db.add(new_tool)
        inserted.append(name)
        existing_names.add(name)

    await db.commit()
    return {
        "ok": True,
        "inserted": inserted,
        "skipped": skipped,
        "message": f"已导入 {len(inserted)} 个工具，跳过 {len(skipped)} 个同名工具",
    }


@router.delete("/{tool_id}")
async def delete_admin_tool(
    tool_id: str,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除管理员工具."""
    result = await db.execute(select(AdminTool).where(AdminTool.tool_id == tool_id))
    tool = result.scalar_one_or_none()

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    # 删除工具
    await db.execute(delete(AdminTool).where(AdminTool.tool_id == tool_id))
    await db.commit()

    return {"message": "Tool deleted successfully"}


@router.get("/{tool_id}/assigned-users")
async def get_tool_assigned_users(
    tool_id: str,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取已拥有该工具的用户 ID 列表."""
    result = await db.execute(
        select(UserTool.user_id).where(
            (UserTool.tool_id == tool_id) | (UserTool.admin_tool_id == tool_id)
        )
    )
    return {"user_ids": [row[0] for row in result.fetchall()]}


@router.post("/assign", response_model=AssignmentResponse)
async def assign_tool_to_users(
    request: AssignToolRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """分配或更新工具给指定用户.

    mode="assign": 新下发，跳过已有的用户
    mode="update": 更新下发，只更新已有的用户
    """
    result = await db.execute(select(AdminTool).where(AdminTool.tool_id == request.tool_id))
    admin_tool = result.scalar_one_or_none()
    if not admin_tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    count = 0
    for user_id in request.user_ids:
        user_result = await db.execute(select(User).where(User.id == user_id))
        if not user_result.scalar_one_or_none():
            continue

        existing_result = await db.execute(
            select(UserTool).where(
                UserTool.user_id == user_id,
                (UserTool.tool_id == request.tool_id) | (UserTool.name == admin_tool.name),
            )
        )
        existing = existing_result.scalar_one_or_none()

        # Respect the caller's mode semantics: update-only skips missing,
        # insert-only skips existing. The shared upsert handles both paths.
        if request.mode == "update" and not existing:
            continue
        if request.mode != "update" and existing:
            continue

        from src.services.tool_assignment import upsert_user_tool_from_admin
        await upsert_user_tool_from_admin(db, user_id, admin_tool)
        count += 1

    await db.commit()
    action = "更新" if request.mode == "update" else "下发"
    return AssignmentResponse(success=True, message=f"已{action} {count} 个用户", assigned_count=count)


@router.post("/{tool_id}/revoke", response_model=AssignmentResponse)
async def revoke_tool_from_users(
    tool_id: str,
    request: RevokeRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """从指定用户撤回管理员下发的工具."""
    count = 0
    for user_id in request.user_ids:
        result = await db.execute(
            select(UserTool).where(
                UserTool.user_id == user_id,
                (UserTool.tool_id == tool_id) | (UserTool.admin_tool_id == tool_id),
                UserTool.source == "admin_assigned",
            )
        )
        tool = result.scalar_one_or_none()
        if tool:
            await db.delete(tool)
            count += 1
    await db.commit()
    return AssignmentResponse(success=True, message=f"已从 {count} 个用户撤回", assigned_count=count)


@router.get("/users/{user_id}", response_model=List[UserToolResponse])
async def get_user_tools(
    user_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取指定用户的所有工具."""
    result = await db.execute(select(UserTool).where(UserTool.user_id == user_id))
    tools = result.scalars().all()

    return [
        UserToolResponse(
            id=tool.id,
            user_id=tool.user_id,
            tool_id=tool.tool_id,
            name=tool.name,
            display_name=tool.display_name,
            description=tool.description,
            calling_guide=tool.calling_guide,
            calling_examples=tool.calling_examples,
            input_schema=tool.input_schema,
            output_schema=tool.output_schema,
            execution=tool.execution,
            requires_approval=tool.requires_approval,
            required_role_level=tool.required_role_level,
            enabled=tool.enabled,
            source=tool.source,
            admin_tool_id=tool.admin_tool_id,
            created_at=tool.created_at,
            updated_at=tool.updated_at,
        )
        for tool in tools
    ]
