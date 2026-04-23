"""Admin API for skill management."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm.attributes import flag_modified
from src.db import get_db
from src.models import AdminSkill, UserSkill, User
from src.api.admin_schemas import (
    SkillCreateRequest,
    SkillUpdateRequest,
    SkillResponse,
    UserSkillResponse,
    AssignSkillRequest,
    AssignmentResponse,
    RevokeRequest,
)
from src.api.admin_users import require_super_admin
from src.utils.logger import api_logger
from typing import List
import uuid

router = APIRouter(prefix="/admin/skills", tags=["admin-skills"])


def generate_skill_id() -> str:
    """生成唯一的skill_id."""
    return f"skill_{uuid.uuid4().hex[:12]}"


@router.get("/", response_model=List[SkillResponse])
async def list_admin_skills(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取所有管理员Skill列表."""
    result = await db.execute(select(AdminSkill).order_by(AdminSkill.created_at.desc()))
    skills = result.scalars().all()
    return [
        SkillResponse(
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
            required_tools=list(skill.required_tools or []),
            quality_criteria=skill.quality_criteria,
            examples=skill.examples,
            requires_approval=bool(skill.requires_approval),
            required_role_level=skill.required_role_level,
            version=skill.version,
            enabled=skill.enabled,
            is_builtin=skill.is_builtin,
            created_at=skill.created_at,
            updated_at=skill.updated_at,
        )
        for skill in skills
    ]


@router.post("/", response_model=SkillResponse)
async def create_admin_skill(
    request: SkillCreateRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """创建新的管理员Skill."""
    skill_data = request.skill

    # 生成skill_id如果未提供
    if not skill_data.skill_id:
        skill_data.skill_id = generate_skill_id()

    # 检查skill_id是否已存在
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.skill_id == skill_data.skill_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Skill ID already exists")

    # 检查name是否已存在
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.name == skill_data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"技能名称 '{skill_data.name}' 已存在")

    # 创建新Skill
    new_skill = AdminSkill(
        skill_id=skill_data.skill_id,
        name=skill_data.name,
        display_name=skill_data.display_name,
        description=skill_data.description,
        category=skill_data.category,
        calling_guide=skill_data.calling_guide,
        input_schema=skill_data.input_schema,
        output_schema=skill_data.output_schema,
        prompt_template=skill_data.prompt_template,
        required_tools=skill_data.required_tools,
        quality_criteria=skill_data.quality_criteria,
        examples=skill_data.examples,
        requires_approval=skill_data.requires_approval,
        required_role_level=skill_data.required_role_level,
        version=skill_data.version,
        enabled=skill_data.enabled,
        is_builtin=skill_data.is_builtin,
    )

    db.add(new_skill)
    await db.commit()
    await db.refresh(new_skill)

    return SkillResponse(
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
        required_tools=list(new_skill.required_tools or []),
        quality_criteria=new_skill.quality_criteria,
        examples=new_skill.examples,
        requires_approval=bool(new_skill.requires_approval),
        required_role_level=new_skill.required_role_level,
        version=new_skill.version,
        enabled=new_skill.enabled,
        is_builtin=new_skill.is_builtin,
        created_at=new_skill.created_at,
        updated_at=new_skill.updated_at,
    )


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_admin_skill(
    skill_id: str,
    request: SkillUpdateRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新管理员Skill."""
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.skill_id == skill_id)
    )
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Partial update: only apply fields the caller actually sent.
    skill_data = request.skill
    patch = skill_data.model_dump(exclude_unset=True)

    json_fields = {"input_schema", "output_schema", "required_tools", "quality_criteria", "examples"}
    for key, value in patch.items():
        setattr(skill, key, value)
        if key in json_fields:
            flag_modified(skill, key)

    await db.commit()
    await db.refresh(skill)

    return SkillResponse(
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
        required_tools=list(skill.required_tools or []),
        quality_criteria=skill.quality_criteria,
        examples=skill.examples,
        requires_approval=bool(skill.requires_approval),
        required_role_level=skill.required_role_level,
        version=skill.version,
        enabled=skill.enabled,
        is_builtin=skill.is_builtin,
        created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


@router.delete("/{skill_id}")
async def delete_admin_skill(
    skill_id: str,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除管理员Skill."""
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.skill_id == skill_id)
    )
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 删除Skill
    await db.execute(delete(AdminSkill).where(AdminSkill.skill_id == skill_id))
    await db.commit()

    return {"message": "Skill deleted successfully"}


@router.get("/{skill_id}/assigned-users")
async def get_skill_assigned_users(
    skill_id: str,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取已拥有该技能的用户 ID 列表."""
    result = await db.execute(
        select(UserSkill.user_id).where(
            (UserSkill.skill_id == skill_id) | (UserSkill.admin_skill_id == skill_id)
        )
    )
    return {"user_ids": [row[0] for row in result.fetchall()]}


@router.post("/assign", response_model=AssignmentResponse)
async def assign_skill_to_users(
    request: AssignSkillRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """分配或更新技能给指定用户."""
    result = await db.execute(select(AdminSkill).where(AdminSkill.skill_id == request.skill_id))
    admin_skill = result.scalar_one_or_none()
    if not admin_skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    count = 0
    for user_id in request.user_ids:
        user_result = await db.execute(select(User).where(User.id == user_id))
        if not user_result.scalar_one_or_none():
            continue

        existing_result = await db.execute(
            select(UserSkill).where(
                UserSkill.user_id == user_id,
                (UserSkill.skill_id == request.skill_id) | (UserSkill.name == admin_skill.name)
            )
        )
        existing = existing_result.scalar_one_or_none()

        if request.mode == "update":
            if not existing:
                continue
            import copy
            existing.name = admin_skill.name
            existing.display_name = admin_skill.display_name
            existing.description = admin_skill.description
            existing.category = admin_skill.category
            existing.calling_guide = getattr(admin_skill, 'calling_guide', '') or ''
            existing.input_schema = copy.deepcopy(admin_skill.input_schema)
            existing.output_schema = copy.deepcopy(admin_skill.output_schema)
            existing.prompt_template = admin_skill.prompt_template
            existing.required_tools = copy.deepcopy(getattr(admin_skill, 'required_tools', []) or [])
            existing.quality_criteria = copy.deepcopy(admin_skill.quality_criteria)
            existing.examples = copy.deepcopy(admin_skill.examples)
            existing.requires_approval = admin_skill.requires_approval
            existing.required_role_level = admin_skill.required_role_level
            for col in ('input_schema', 'output_schema', 'quality_criteria', 'examples', 'required_tools'):
                flag_modified(existing, col)
            count += 1
        else:
            if existing:
                continue
            import copy as _copy
            db.add(UserSkill(
                user_id=user_id, skill_id=admin_skill.skill_id,
                admin_skill_id=admin_skill.skill_id, name=admin_skill.name,
                display_name=admin_skill.display_name, description=admin_skill.description,
                category=admin_skill.category,
                calling_guide=getattr(admin_skill, 'calling_guide', '') or '',
                input_schema=_copy.deepcopy(admin_skill.input_schema),
                output_schema=_copy.deepcopy(admin_skill.output_schema),
                prompt_template=admin_skill.prompt_template,
                required_tools=list(getattr(admin_skill, 'required_tools', []) or []),
                quality_criteria=_copy.deepcopy(admin_skill.quality_criteria),
                examples=_copy.deepcopy(admin_skill.examples),
                requires_approval=bool(admin_skill.requires_approval),
                required_role_level=admin_skill.required_role_level,
                enabled=True, source="admin_assigned",
            ))
            count += 1

    # Cascade: sync any required tools named on the admin skill onto the
    # same users. Skills commonly depend on tools, and without this step
    # the user gets a skill that can't actually run. `resolve_required_tools`
    # falls back to parsing `{{tool:xxx}}` placeholders from the prompt
    # template when the `required_tools` column wasn't populated.
    from src.services.tool_assignment import (
        sync_required_tools_for_users,
        resolve_required_tools,
    )
    required_tools = resolve_required_tools(admin_skill)
    api_logger.info(
        f"[skill-assign] skill={admin_skill.name!r} "
        f"explicit_required_tools={admin_skill.required_tools!r} "
        f"resolved_required_tools={required_tools!r} "
        f"user_ids={list(request.user_ids)!r} mode={request.mode!r}"
    )
    tool_sync = await sync_required_tools_for_users(
        db=db,
        user_ids=request.user_ids,
        required_tool_names=required_tools,
    )
    api_logger.info(
        f"[skill-assign] tool_sync result: inserted={tool_sync.inserted} "
        f"updated={tool_sync.updated} missing={tool_sync.missing_tool_names!r}"
    )

    await db.commit()
    action = "更新" if request.mode == "update" else "下发"
    msg = f"已{action} {count} 个用户"
    if tool_sync.touched:
        msg += f"；同时同步了 {tool_sync.inserted} 个新工具、更新 {tool_sync.updated} 个已有工具"
    if tool_sync.missing_tool_names:
        msg += f"；以下依赖工具未在管理员工具库中找到: {', '.join(tool_sync.missing_tool_names)}"
    return AssignmentResponse(
        success=True,
        message=msg,
        assigned_count=count,
        tools_inserted=tool_sync.inserted,
        tools_updated=tool_sync.updated,
        missing_tool_names=tool_sync.missing_tool_names,
    )


@router.post("/{skill_id}/revoke", response_model=AssignmentResponse)
async def revoke_skill_from_users(
    skill_id: str,
    request: RevokeRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """从指定用户撤回管理员下发的技能."""
    count = 0
    for user_id in request.user_ids:
        result = await db.execute(
            select(UserSkill).where(
                UserSkill.user_id == user_id,
                (UserSkill.skill_id == skill_id) | (UserSkill.admin_skill_id == skill_id),
                UserSkill.source == "admin_assigned",
            )
        )
        skill = result.scalar_one_or_none()
        if skill:
            await db.delete(skill)
            count += 1
    await db.commit()
    return AssignmentResponse(success=True, message=f"已从 {count} 个用户撤回", assigned_count=count)


@router.get("/users/{user_id}", response_model=List[UserSkillResponse])
async def get_user_skills(
    user_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取指定用户的所有Skills."""
    result = await db.execute(select(UserSkill).where(UserSkill.user_id == user_id))
    skills = result.scalars().all()

    return [
        UserSkillResponse(
            id=skill.id,
            user_id=skill.user_id,
            skill_id=skill.skill_id,
            name=skill.name,
            display_name=skill.display_name,
            description=skill.description,
            category=skill.category,
            calling_guide=skill.calling_guide or "",
            input_schema=skill.input_schema,
            output_schema=skill.output_schema,
            prompt_template=skill.prompt_template,
            required_tools=list(skill.required_tools or []),
            quality_criteria=skill.quality_criteria,
            examples=skill.examples,
            requires_approval=bool(skill.requires_approval),
            required_role_level=skill.required_role_level,
            enabled=skill.enabled,
            source=skill.source,
            admin_skill_id=skill.admin_skill_id,
            created_at=skill.created_at,
            updated_at=skill.updated_at,
        )
        for skill in skills
    ]
