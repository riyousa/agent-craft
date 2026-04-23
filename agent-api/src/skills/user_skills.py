"""User skills dynamic loader."""
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model
from src.models.skill import UserSkill


def build_pydantic_schema_from_skill(input_schema: dict) -> type[BaseModel]:
    """Build Pydantic schema from skill's input_schema.

    Args:
        input_schema: Input schema from skill configuration

    Returns:
        Pydantic BaseModel class
    """
    if not input_schema:
        return BaseModel

    # If input_schema has parameters field (like tools)
    if "parameters" in input_schema:
        parameters = input_schema["parameters"]
    # If input_schema is already a dict of parameter definitions
    else:
        # Convert to parameters list format
        parameters = []
        for param_name, param_def in input_schema.items():
            if isinstance(param_def, dict):
                param = {"name": param_name, **param_def}
                parameters.append(param)

    if not parameters:
        return BaseModel

    # Build field definitions
    fields = {}
    for param in parameters:
        if isinstance(param, dict):
            param_name = param.get("name")
            param_type = param.get("type", "string")
            param_required = param.get("required", False)
            param_description = param.get("description", "")
            param_default = param.get("default")
        else:
            continue

        # Map type to Python type
        type_mapping = {
            "string": str,
            "integer": int,
            "number": float,
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        python_type = type_mapping.get(param_type, str)

        # Create field with description.
        # Bare python_type (not Optional[T]) for non-required fields keeps the
        # JSON schema clean — Optional[T] produces `anyOf: [T, null]` which
        # weakens the required signal to the LLM.
        if param_required:
            fields[param_name] = (python_type, Field(..., description=param_description))
        else:
            default_value = param_default if param_default is not None else None
            fields[param_name] = (python_type, Field(default=default_value, description=param_description))

    # Create dynamic model
    if not fields:
        return BaseModel

    return create_model("DynamicSkillInput", **fields)


async def create_user_skill_tool(skill_config: UserSkill, user_info: dict, available_tools: List[StructuredTool]) -> StructuredTool:
    """Create a LangChain StructuredTool from user skill configuration.

    Skills are wrapped as tools that the LLM can invoke. When invoked, the skill
    guides the LLM through a multi-step workflow using its prompt_template.

    Args:
        skill_config: UserSkill model instance
        user_info: User information for context
        available_tools: List of available tools that the skill can use

    Returns:
        StructuredTool instance
    """
    # Build Pydantic schema from input_schema
    try:
        args_schema = build_pydantic_schema_from_skill(skill_config.input_schema or {})
    except Exception as e:
        print(f"Warning: Failed to build schema for skill {skill_config.name}: {e}")
        args_schema = BaseModel

    # Create tool function
    async def skill_function(**kwargs) -> str:
        """Dynamic skill function that guides LLM through workflow."""
        from src.utils.logger import agent_logger

        agent_logger.info(f"📋 Skill '{skill_config.name}' invoked with params: {kwargs}")

        # For now, we return the prompt template with input placeholders replaced
        # The LLM will see this as guidance for what to do next
        prompt = skill_config.prompt_template or ""

        # Replace {{input.xxx}} placeholders with actual values
        for key, value in kwargs.items():
            placeholder = f"{{{{input.{key}}}}}"
            prompt = prompt.replace(placeholder, str(value))

        agent_logger.info(f"📋 Skill '{skill_config.name}' workflow:\n{prompt}")

        # Return the workflow guide to the LLM
        return f"""Skill Workflow for '{skill_config.display_name}':

{prompt}

Please follow the steps above and execute the necessary tool calls.
After completing all steps, provide a final summary of the results."""

    # Create comprehensive description
    description_parts = [skill_config.description]

    if skill_config.calling_guide:
        description_parts.append(f"\n\nWhen to use: {skill_config.calling_guide}")

    if skill_config.required_tools:
        description_parts.append(f"\n\nRequired tools: {', '.join(skill_config.required_tools)}")

    description_parts.append(f"\n\nWorkflow preview:\n{skill_config.prompt_template[:200]}...")

    description = "".join(description_parts)

    # Custom validation-error handler: converts pydantic's raw "Field required"
    # error into a clear instruction for the LLM so it retries WITH the missing
    # args instead of looping with empty kwargs.
    def _validation_error_handler(exc: Exception) -> str:
        missing: List[str] = []
        try:
            errors = exc.errors() if hasattr(exc, "errors") else []  # type: ignore[attr-defined]
            for err in errors:
                if err.get("type") == "missing":
                    loc = err.get("loc") or []
                    if loc:
                        missing.append(str(loc[-1]))
        except Exception:
            pass
        if missing:
            return (
                f"调用 skill 'skill_{skill_config.name}' 缺少必填参数: {missing}。"
                "请从用户消息中提取这些参数的具体值（例如用户问题、手机号、ID 等）后再次调用。"
                "禁止不带参数直接调用。若无法从对话中确定，请先向用户澄清。"
            )
        return f"参数校验失败: {exc}"

    return StructuredTool.from_function(
        coroutine=skill_function,
        name=f"skill_{skill_config.name}",  # Prefix with "skill_" to distinguish from tools
        description=description,
        args_schema=args_schema,
        handle_validation_error=_validation_error_handler,
    )


async def get_user_skills(user_id: int, db: AsyncSession, user_info: dict, available_tools: List[StructuredTool]) -> List[StructuredTool]:
    """Load all enabled user skills for a specific user.

    Args:
        user_id: User ID
        db: Database session
        user_info: User information for skill execution context
        available_tools: List of available tools that skills can use

    Returns:
        List of StructuredTool instances (skills wrapped as tools)
    """
    from src.utils.logger import agent_logger

    # Query enabled user skills
    result = await db.execute(
        select(UserSkill).where(
            UserSkill.user_id == user_id,
            UserSkill.enabled == True
        )
    )

    skills = result.scalars().all()
    agent_logger.info(f"Found {len(skills)} enabled skills in database for user {user_id}")

    # Convert to LangChain tools
    langchain_skill_tools = []
    for skill in skills:
        try:
            agent_logger.debug(f"Creating skill: {skill.name}")
            skill_tool = await create_user_skill_tool(skill, user_info, available_tools)
            langchain_skill_tools.append(skill_tool)
            agent_logger.debug(f"Successfully created skill: {skill.name}")
        except Exception as e:
            agent_logger.error(f"Failed to create skill {skill.name}: {e}", exc_info=True)
            continue

    return langchain_skill_tools


async def get_skills_requiring_approval(user_id: int, db: AsyncSession) -> List[str]:
    """Get names of user skills that require approval.

    Args:
        user_id: User ID
        db: Database session

    Returns:
        List of skill names requiring approval
    """
    result = await db.execute(
        select(UserSkill.name).where(
            UserSkill.user_id == user_id,
            UserSkill.enabled == True,
            UserSkill.requires_approval == True
        )
    )

    return [name for name in result.scalars().all()]
