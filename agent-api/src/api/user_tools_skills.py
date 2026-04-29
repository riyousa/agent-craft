"""User tools and skills management API."""
import fastapi
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.db import get_db
from src.models import UserTool, UserSkill
from src.api.user_schemas import (
    UserToolCreateRequest,
    UserToolUpdateRequest,
    UserToolResponse,
    UserSkillCreateRequest,
    UserSkillUpdateRequest,
    UserSkillResponse,
)
from src.api.auth_deps import get_current_user_id
from typing import List, Optional
import uuid
from src.utils.logger import api_logger

router = APIRouter(prefix="/user", tags=["user-tools-skills"])


def generate_tool_id() -> str:
    """生成工具ID."""
    return f"tool_{uuid.uuid4().hex[:12]}"


def generate_skill_id() -> str:
    """生成技能ID."""
    return f"skill_{uuid.uuid4().hex[:12]}"


# ========== Tools API ==========


@router.get("/tools", response_model=List[UserToolResponse])
async def list_user_tools(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """列出用户的所有工具."""
    result = await db.execute(
        select(UserTool).where(UserTool.user_id == user_id).order_by(UserTool.created_at.desc())
    )
    tools = result.scalars().all()

    return [
        UserToolResponse(
            id=tool.id, tool_id=tool.tool_id, name=tool.name,
            display_name=tool.display_name, description=tool.description,
            calling_guide=tool.calling_guide, calling_examples=tool.calling_examples,
            input_schema=tool.input_schema, output_schema=tool.output_schema,
            execution=tool.execution, requires_approval=tool.requires_approval,
            enabled=tool.enabled, source=tool.source, created_at=tool.created_at,
        ) for tool in tools
    ]


@router.post("/tools", response_model=UserToolResponse)
async def create_user_tool(
    request: UserToolCreateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """创建用户工具."""

    # 校验同名工具
    existing = await db.execute(
        select(UserTool).where(UserTool.user_id == user_id, UserTool.name == request.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"工具名称 '{request.name}' 已存在")

    tool_id = generate_tool_id()

    new_tool = UserTool(
        user_id=user_id,
        tool_id=tool_id,
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        calling_guide=request.calling_guide,
        calling_examples=request.calling_examples,
        input_schema=request.input_schema,
        output_schema=request.output_schema,
        execution=request.execution,
        requires_approval=request.requires_approval,
        enabled=True,
        source="user_created",
    )

    db.add(new_tool)
    await db.commit()
    await db.refresh(new_tool)

    return UserToolResponse(
        id=new_tool.id,
        tool_id=new_tool.tool_id,
        name=new_tool.name,
        display_name=new_tool.display_name,
        description=new_tool.description,
        calling_guide=new_tool.calling_guide,
        calling_examples=new_tool.calling_examples,
        input_schema=new_tool.input_schema,
        output_schema=new_tool.output_schema,
        execution=new_tool.execution,
        requires_approval=new_tool.requires_approval,
        enabled=new_tool.enabled,
        source=new_tool.source,
        created_at=new_tool.created_at,
    )


@router.post("/tools/test-config")
async def test_tool_config(
    request: dict = fastapi.Body(...),
    user_id: int = Depends(get_current_user_id),
):
    """测试工具配置连通性（无需先保存），使用完整的执行流程."""
    import time as _time
    from src.tools.adapters import get_adapter
    from src.tools.adapters.rest_api import rest_api_adapter

    execution = request.get("execution", {})
    test_params = request.get("test_params", {})

    if not execution:
        return {"ok": False, "message": "缺少 execution 配置", "latency_ms": 0}

    execution_type = execution.get("type", "rest_api")

    if execution_type == "rest_api":
        config = execution.get("config", {})
        if not config.get("endpoint"):
            return {"ok": False, "message": "缺少 API 端点", "latency_ms": 0}

        # For testing, user provides the final resolved request body directly.
        # We bypass request_mapping and send test_params as-is.
        test_execution = {
            **execution,
            "request_mapping": test_params,  # Already the final body
        }

        start = _time.time()
        try:
            result = await rest_api_adapter.execute(test_execution, {})
            latency = int((_time.time() - start) * 1000)
            return {"ok": True, "message": f"请求成功 ({latency}ms)", "latency_ms": latency, "data": result}
        except Exception as e:
            latency = int((_time.time() - start) * 1000)
            return {"ok": False, "message": str(e), "latency_ms": latency}

    if execution_type == "mcp":
        mcp_cfg = execution.get("mcp") or {}
        if not (mcp_cfg.get("url") or mcp_cfg.get("command")):
            return {"ok": False, "message": "缺少 MCP server URL 或 command", "latency_ms": 0}

        adapter = get_adapter("mcp")
        # If a tool_name is set, do a real call with test_params; otherwise
        # fall back to test_connection which just lists tools.
        if mcp_cfg.get("tool_name"):
            start = _time.time()
            try:
                result = await adapter.execute(
                    tool_config=execution,
                    params=test_params or {},
                )
                latency = int((_time.time() - start) * 1000)
                return {"ok": True, "message": f"调用成功 ({latency}ms)", "latency_ms": latency, "data": result}
            except Exception as e:
                latency = int((_time.time() - start) * 1000)
                return {"ok": False, "message": str(e), "latency_ms": latency}
        else:
            return await adapter.test_connection(execution)

    return {"ok": False, "message": f"不支持的执行类型: {execution_type}", "latency_ms": 0}


@router.post("/tools/mcp/discover")
async def discover_mcp_tools(
    request: dict = fastapi.Body(...),
    user_id: int = Depends(get_current_user_id),
):
    """连接 MCP server 并列出其暴露的所有工具供前端勾选导入.

    request body: {"mcp": {transport, url|command, headers, auth, env, timeout}}
    """
    from src.tools.adapters.mcp import mcp_adapter

    mcp_cfg = request.get("mcp") or {}
    if not (mcp_cfg.get("url") or mcp_cfg.get("command")):
        raise HTTPException(status_code=400, detail="缺少 MCP server URL 或 command")

    try:
        tools = await mcp_adapter.list_remote_tools(mcp_cfg)
        return {"ok": True, "tools": tools}
    except Exception as e:
        api_logger.error(f"MCP discover failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"无法连接 MCP server: {e}")


@router.post("/tools/mcp/import")
async def import_mcp_tools(
    request: dict = fastapi.Body(...),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """将 MCP server 上选中的工具批量插入用户的 user_tools.

    request body::
        {
          "mcp": {transport, url|command, headers, auth, env, timeout},
          "tools": [{name, display_name?, description, input_schema, requires_approval?}]
        }
    """
    from src.tools.adapters.mcp import json_schema_to_parameters

    mcp_cfg = request.get("mcp") or {}
    selected = request.get("tools") or []
    if not (mcp_cfg.get("url") or mcp_cfg.get("command")):
        raise HTTPException(status_code=400, detail="缺少 MCP server URL 或 command")
    if not selected:
        raise HTTPException(status_code=400, detail="未选择任何工具")

    # Pre-fetch existing names for this user to avoid collisions
    existing_result = await db.execute(
        select(UserTool.name).where(UserTool.user_id == user_id)
    )
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

        new_tool = UserTool(
            user_id=user_id,
            tool_id=generate_tool_id(),
            name=name,
            display_name=item.get("display_name") or name,
            description=item.get("description") or "",
            calling_guide="",
            calling_examples=[],
            input_schema={"parameters": parameters},
            output_schema={"type": "object", "item_fields": []},
            execution=execution,
            requires_approval=bool(item.get("requires_approval", False)),
            enabled=True,
            source="user_created",
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


@router.put("/tools/{tool_id}", response_model=UserToolResponse)
async def update_user_tool(
    tool_id: str,
    request: UserToolUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新用户工具."""

    result = await db.execute(
        select(UserTool).where(
            UserTool.user_id == user_id, UserTool.tool_id == tool_id
        )
    )
    tool = result.scalar_one_or_none()

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    # 更新字段
    if request.display_name is not None:
        tool.display_name = request.display_name
    if request.description is not None:
        tool.description = request.description
    if request.calling_guide is not None:
        tool.calling_guide = request.calling_guide
    if request.calling_examples is not None:
        tool.calling_examples = request.calling_examples
    if request.input_schema is not None:
        tool.input_schema = request.input_schema
    if request.output_schema is not None:
        tool.output_schema = request.output_schema
    if request.execution is not None:
        tool.execution = request.execution
    if request.requires_approval is not None:
        tool.requires_approval = request.requires_approval
    if request.enabled is not None:
        tool.enabled = request.enabled

    await db.commit()
    await db.refresh(tool)

    return UserToolResponse(
        id=tool.id,
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
        enabled=tool.enabled,
        source=tool.source,
        created_at=tool.created_at,
    )


@router.delete("/tools/{tool_id}")
async def delete_user_tool(
    tool_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除用户工具."""

    result = await db.execute(
        select(UserTool).where(
            UserTool.user_id == user_id, UserTool.tool_id == tool_id
        )
    )
    tool = result.scalar_one_or_none()

    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    # 只允许删除用户自己创建的工具
    if tool.source != "user_created":
        raise HTTPException(
            status_code=403, detail="Cannot delete admin-assigned tool"
        )

    await db.delete(tool)
    await db.commit()

    return {"message": "Tool deleted successfully"}


@router.post("/tools/{tool_id}/test")
async def test_user_tool(
    tool_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    test_params: Optional[dict] = None,
):
    """测试工具连通性."""
    if test_params is None:
        test_params = {}

    api_logger.info("="*60)
    api_logger.info(f"Testing tool connectivity: tool_id={tool_id}")
    api_logger.debug(f"Test params: {test_params}")

    api_logger.info(f"User ID: {user_id}")

    result = await db.execute(
        select(UserTool).where(
            UserTool.user_id == user_id, UserTool.tool_id == tool_id
        )
    )
    tool = result.scalar_one_or_none()

    if not tool:
        api_logger.error(f"Tool not found: tool_id={tool_id}, user_id={user_id}")
        api_logger.info("="*60)
        raise HTTPException(status_code=404, detail="Tool not found")

    api_logger.info(f"Tool found: {tool.name} ({tool.display_name})")
    api_logger.debug(f"Tool execution config: {tool.execution}")

    from src.tools.adapters import get_adapter

    execution_type = (tool.execution or {}).get("type", "rest_api")
    api_logger.info(f"Execution type: {execution_type}")

    try:
        adapter = get_adapter(execution_type)
        test_result = await adapter.test_connection(tool.execution, test_params)
        api_logger.info(f"Test result: {test_result}")
        api_logger.info("="*60)
        return test_result
    except Exception as e:
        api_logger.error(f"Test failed with exception: {str(e)}", exc_info=True)
        api_logger.info("="*60)
        return {
            "ok": False,
            "message": f"Test failed: {str(e)}",
            "latency_ms": 0,
        }


# ========== Skills API ==========


@router.get("/skills", response_model=List[UserSkillResponse])
async def list_user_skills(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """列出用户的所有技能."""
    result = await db.execute(
        select(UserSkill).where(UserSkill.user_id == user_id).order_by(UserSkill.created_at.desc())
    )
    skills = result.scalars().all()

    return [
        UserSkillResponse(
            id=skill.id, skill_id=skill.skill_id, name=skill.name,
            display_name=skill.display_name, description=skill.description,
            category=skill.category, calling_guide=skill.calling_guide or "",
            input_schema=skill.input_schema, output_schema=skill.output_schema,
            prompt_template=skill.prompt_template, required_tools=skill.required_tools or [],
            quality_criteria=skill.quality_criteria, examples=skill.examples,
            requires_approval=skill.requires_approval or False,
            enabled=skill.enabled, source=skill.source, created_at=skill.created_at,
        ) for skill in skills
    ]


@router.post("/skills", response_model=UserSkillResponse)
async def create_user_skill(
    request: UserSkillCreateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """创建用户技能."""

    # 校验同名技能
    existing = await db.execute(
        select(UserSkill).where(UserSkill.user_id == user_id, UserSkill.name == request.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"技能名称 '{request.name}' 已存在")

    skill_id = generate_skill_id()

    new_skill = UserSkill(
        user_id=user_id,
        skill_id=skill_id,
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        category=request.category,
        calling_guide=request.calling_guide,
        input_schema=request.input_schema,
        output_schema=request.output_schema,
        prompt_template=request.prompt_template,
        required_tools=request.required_tools,
        quality_criteria=request.quality_criteria,
        examples=request.examples,
        requires_approval=request.requires_approval,
        enabled=True,
        source="user_created",
        required_role_level=1,
    )

    db.add(new_skill)
    await db.commit()
    await db.refresh(new_skill)

    return UserSkillResponse(
        id=new_skill.id,
        skill_id=new_skill.skill_id,
        name=new_skill.name,
        display_name=new_skill.display_name,
        description=new_skill.description,
        category=new_skill.category,
        calling_guide=new_skill.calling_guide or "",
        input_schema=new_skill.input_schema,
        output_schema=new_skill.output_schema,
        prompt_template=new_skill.prompt_template,
        required_tools=new_skill.required_tools or [],
        quality_criteria=new_skill.quality_criteria,
        examples=new_skill.examples,
        requires_approval=new_skill.requires_approval or False,
        enabled=new_skill.enabled,
        source=new_skill.source,
        created_at=new_skill.created_at,
    )


@router.put("/skills/{skill_id}", response_model=UserSkillResponse)
async def update_user_skill(
    skill_id: str,
    request: UserSkillUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新用户技能."""

    result = await db.execute(
        select(UserSkill).where(
            UserSkill.user_id == user_id, UserSkill.skill_id == skill_id
        )
    )
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 更新字段
    if request.display_name is not None:
        skill.display_name = request.display_name
    if request.description is not None:
        skill.description = request.description
    if request.category is not None:
        skill.category = request.category
    if request.calling_guide is not None:
        skill.calling_guide = request.calling_guide
    if request.input_schema is not None:
        skill.input_schema = request.input_schema
    if request.output_schema is not None:
        skill.output_schema = request.output_schema
    if request.prompt_template is not None:
        skill.prompt_template = request.prompt_template
    if request.required_tools is not None:
        skill.required_tools = request.required_tools
    if request.quality_criteria is not None:
        skill.quality_criteria = request.quality_criteria
    if request.examples is not None:
        skill.examples = request.examples
    if request.requires_approval is not None:
        skill.requires_approval = request.requires_approval
    if request.enabled is not None:
        skill.enabled = request.enabled

    await db.commit()
    await db.refresh(skill)

    return UserSkillResponse(
        id=skill.id,
        skill_id=skill.skill_id,
        name=skill.name,
        display_name=skill.display_name,
        description=skill.description,
        category=skill.category,
        calling_guide=skill.calling_guide or "",
        input_schema=skill.input_schema,
        output_schema=skill.output_schema,
        prompt_template=skill.prompt_template,
        required_tools=skill.required_tools or [],
        quality_criteria=skill.quality_criteria,
        examples=skill.examples,
        requires_approval=skill.requires_approval or False,
        enabled=skill.enabled,
        source=skill.source,
        created_at=skill.created_at,
    )


@router.delete("/skills/{skill_id}")
async def delete_user_skill(
    skill_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除用户技能."""

    result = await db.execute(
        select(UserSkill).where(
            UserSkill.user_id == user_id, UserSkill.skill_id == skill_id
        )
    )
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 只允许删除用户自己创建的技能
    if skill.source != "user_created":
        raise HTTPException(
            status_code=403, detail="Cannot delete admin-assigned skill"
        )

    await db.delete(skill)
    await db.commit()

    return {"message": "Skill deleted successfully"}


# ========== Metrics ==========
#
# `tool_invocations` and `skill_runs` are append-only logs written from
# `agent/nodes.py::execute_tools_with_audit`. The list pages aggregate
# them in 7-day windows; we return all rows up-front since the total
# names per response is bounded by the user's tool/skill library size.


@router.get("/tools/metrics")
async def list_tool_metrics(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate calls_7d / p95_ms per tool name for the current user.

    Backend_update.md § 2 — feeds `ToolsManager.tsx` 7天调用 + P95.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func
    from src.models import ToolInvocation

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    # PG: use percentile_disc; SQLite fallback below ignores p95.
    is_pg = db.bind and db.bind.dialect.name == "postgresql"

    if is_pg:
        p95_expr = func.percentile_disc(0.95).within_group(
            ToolInvocation.latency_ms.asc(),
        )
        rows = (await db.execute(
            select(
                ToolInvocation.tool_name,
                func.count().label("calls_7d"),
                p95_expr.label("p95_ms"),
            )
            .where(
                ToolInvocation.user_id == user_id,
                ToolInvocation.created_at >= cutoff,
            )
            .group_by(ToolInvocation.tool_name)
        )).all()
        return {
            r[0]: {"calls_7d": int(r[1] or 0), "p95_ms": int(r[2] or 0)}
            for r in rows
        }
    else:
        # SQLite: percentile fns not available; fall back to MAX as a
        # rough upper bound. Devs notice and don't read into the number.
        rows = (await db.execute(
            select(
                ToolInvocation.tool_name,
                func.count().label("calls_7d"),
                func.max(ToolInvocation.latency_ms).label("p95_ms"),
            )
            .where(
                ToolInvocation.user_id == user_id,
                ToolInvocation.created_at >= cutoff,
            )
            .group_by(ToolInvocation.tool_name)
        )).all()
        return {
            r[0]: {"calls_7d": int(r[1] or 0), "p95_ms": int(r[2] or 0)}
            for r in rows
        }


@router.get("/skills/metrics")
async def list_skill_metrics(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate runs_7d / users_using / p95_ms per skill name.

    `users_using` is global (across all users in the last 7d) — that's
    the design's "how many people are using this skill" metric. The
    auth check is per-user only because the rest of the response (your
    own runs / latency) needs to be scoped; users_using is the same
    number for everyone reading. Backend_update.md § 3.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func, distinct
    from src.models import SkillRun

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    is_pg = db.bind and db.bind.dialect.name == "postgresql"

    if is_pg:
        p95_expr = func.percentile_disc(0.95).within_group(
            SkillRun.total_latency_ms.asc(),
        )
    else:
        p95_expr = func.max(SkillRun.total_latency_ms)

    rows = (await db.execute(
        select(
            SkillRun.skill_name,
            func.count().label("runs_7d"),
            func.count(distinct(SkillRun.user_id)).label("users_using"),
            p95_expr.label("p95_ms"),
        )
        .where(SkillRun.created_at >= cutoff)
        .group_by(SkillRun.skill_name)
    )).all()
    return {
        r[0]: {
            "runs_7d": int(r[1] or 0),
            "users_using": int(r[2] or 0),
            "p95_ms": int(r[3] or 0),
        }
        for r in rows
    }
