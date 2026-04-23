"""User tools dynamic loader."""
from typing import List, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model
from src.models.tool import UserTool
from src.tools.adapters import get_adapter


def build_pydantic_schema(input_schema: dict) -> type[BaseModel]:
    """Build Pydantic schema from input_schema configuration.

    Args:
        input_schema: Input schema from tool configuration

    Returns:
        Pydantic BaseModel class
    """
    if not input_schema or "parameters" not in input_schema:
        return BaseModel

    parameters = input_schema.get("parameters", [])

    # Build field definitions
    fields = {}
    for param in parameters:
        param_name = param.get("name")
        param_type = param.get("type", "string")
        param_required = param.get("required", False)
        param_description = param.get("description", "")
        param_default = param.get("default")

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
        # Note: we intentionally do NOT use Optional[python_type] for non-required
        # fields — it produces `anyOf: [{type: X}, {type: "null"}]` in the JSON
        # schema which weakens the "required" signal and encourages models to
        # omit the argument entirely. Instead use the bare type with a default.
        if param_required:
            fields[param_name] = (python_type, Field(..., description=param_description))
        else:
            default_value = param_default if param_default is not None else None
            fields[param_name] = (python_type, Field(default=default_value, description=param_description))

    # Create dynamic model
    if not fields:
        return BaseModel

    return create_model("DynamicToolInput", **fields)


async def create_user_tool(tool_config: UserTool, user_info: dict) -> StructuredTool:
    """Create a LangChain StructuredTool from user tool configuration.

    Args:
        tool_config: UserTool model instance
        user_info: User information for context

    Returns:
        StructuredTool instance
    """
    # Build Pydantic schema from input_schema
    try:
        args_schema = build_pydantic_schema(tool_config.input_schema)
    except Exception as e:
        print(f"Warning: Failed to build schema for tool {tool_config.name}: {e}")
        args_schema = BaseModel

    # Create tool function that captures user_info
    async def tool_function(**kwargs) -> Any:
        """Dynamic tool function."""
        from src.utils.logger import tools_logger
        import re
        import base64
        from datetime import datetime
        from src.services.workspace_service import workspace_service
        from src.db import AsyncSessionLocal

        # Add debug logging
        tools_logger.debug(f"Tool '{tool_config.name}' called with kwargs: {kwargs}")
        tools_logger.debug(f"Tool input_schema: {tool_config.input_schema}")

        # Validate required parameters before execution.
        # If the model omits a required param (very common symptom: args={}),
        # reject the call and give the model a clear error so it retries WITH
        # the missing values instead of looping with empty args.
        schema_params = (tool_config.input_schema or {}).get("parameters", []) if tool_config.input_schema else []
        missing_required = [
            p.get("name") for p in schema_params
            if p.get("required") and (
                p.get("name") not in kwargs
                or kwargs.get(p.get("name")) is None
                or (isinstance(kwargs.get(p.get("name")), str) and kwargs.get(p.get("name")).strip() == "")
            )
        ]
        if missing_required:
            tools_logger.warning(
                f"Tool '{tool_config.name}' called with missing required params: {missing_required}. "
                f"kwargs={kwargs}"
            )
            return {
                "error": True,
                "error_type": "missing_required_parameters",
                "missing": missing_required,
                "message": (
                    f"调用工具 '{tool_config.name}' 时缺少必填参数: {missing_required}。"
                    "请从用户消息中提取这些参数的具体值，或向用户澄清后再调用。"
                    "禁止不带参数直接调用。"
                ),
            }

        # Dispatch to the adapter matching execution.type (defaults to rest_api)
        execution_config = tool_config.execution
        execution_type = (execution_config or {}).get("type", "rest_api")
        adapter = get_adapter(execution_type)

        try:
            result = await adapter.execute(
                tool_config=execution_config,
                params=kwargs,
                user_info=user_info
            )

            # 处理媒体文件保存（支持dict和list）
            if isinstance(result, (dict, list)):
                media_urls = []
                user_id = user_info.get('user_id') or user_info.get('id')

                tools_logger.debug(f"Processing media from result, user_id: {user_id}, result type: {type(result)}")

                # 检测结果中的图片或视频URL/base64
                async def save_media_from_result(data: Any, path: str = "") -> Any:
                    """递归检测并保存结果中的媒体文件."""
                    # 先处理复合类型（dict和list）
                    if isinstance(data, dict):
                        result_dict = {}
                        for k, v in data.items():
                            result_dict[k] = await save_media_from_result(v, f"{path}.{k}")
                        return result_dict

                    elif isinstance(data, list):
                        result_list = []
                        for i, item in enumerate(data):
                            result_list.append(await save_media_from_result(item, f"{path}[{i}]"))
                        return result_list

                    elif isinstance(data, str):
                        # 检测媒体文件URL（图片、视频、音频等）
                        media_extensions = {
                            # 图片
                            '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.gif': 'gif',
                            '.webp': 'webp', '.bmp': 'bmp', '.svg': 'svg',
                            # 视频
                            '.mp4': 'mp4', '.avi': 'avi', '.mov': 'mov', '.webm': 'webm', '.mkv': 'mkv',
                            # 音频
                            '.mp3': 'mp3', '.wav': 'wav', '.ogg': 'ogg', '.flac': 'flac',
                        }

                        detected_ext = None
                        if re.match(r'https?://', data):
                            # 从URL路径检测扩展名（忽略查询参数）
                            url_path = data.split('?')[0].lower()
                            for ext_key, ext_val in media_extensions.items():
                                if ext_key in url_path:
                                    detected_ext = ext_val
                                    break

                        # 也检测无扩展名但在媒体相关字段中的URL
                        is_media_field = any(kw in path.lower() for kw in ['url', 'image', 'video', 'audio', 'media', 'file', 'output', 'result'])
                        is_url = bool(re.match(r'https?://', data))
                        if (detected_ext or is_media_field) and is_url:
                            try:
                                async with AsyncSessionLocal() as session:
                                    import httpx
                                    async with httpx.AsyncClient() as client:
                                        tools_logger.info(f"Downloading media from URL: {data[:100]}...")
                                        response = await client.get(data, timeout=60, follow_redirects=True)
                                        if response.status_code == 200:
                                            # 从Content-Type推断/修正扩展名
                                            content_type = response.headers.get('content-type', '')
                                            ct_map = {
                                                'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif',
                                                'image/webp': 'webp', 'image/svg': 'svg', 'image/bmp': 'bmp',
                                                'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
                                                'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
                                            }
                                            for ct_key, ct_ext in ct_map.items():
                                                if ct_key in content_type:
                                                    detected_ext = ct_ext
                                                    break
                                            # 非媒体Content-Type则跳过保存
                                            if not detected_ext:
                                                tools_logger.debug(f"Skipping non-media URL (content-type: {content_type}): {data[:80]}")
                                                return data

                                            filename = f"{tool_config.name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{detected_ext}"
                                            saved_file = await workspace_service.save_file(
                                                user_id=user_id,
                                                filename=filename,
                                                content=response.content,
                                                file_type="generated",
                                                db=session,
                                                description=f"Generated by tool: {tool_config.name}",
                                            )

                                            from src.utils.asset_signing import sign_asset_url
                                            view_url = sign_asset_url(saved_file.id, filename)
                                            media_urls.append(view_url)
                                            tools_logger.info(f"✅ Saved media file: {filename} -> {view_url}")
                                            return view_url
                                        else:
                                            tools_logger.warning(f"Failed to download media: HTTP {response.status_code}")
                            except Exception as e:
                                tools_logger.error(f"Failed to save media from URL: {e}", exc_info=True)

                        # 检测base64图片
                        elif re.match(r'^data:image/(png|jpg|jpeg|gif|webp|bmp|svg\+xml);base64,', data):
                            try:
                                async with AsyncSessionLocal() as session:
                                    # 解析base64
                                    match = re.match(r'^data:image/([^;]+);base64,(.*)$', data)
                                    if match:
                                        ext = match.group(1).replace('svg+xml', 'svg')
                                        base64_data = match.group(2)
                                        content = base64.b64decode(base64_data)

                                        # 生成文件名
                                        filename = f"{tool_config.name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"

                                        # 保存文件
                                        saved_file = await workspace_service.save_file(
                                            user_id=user_id,
                                            filename=filename,
                                            content=content,
                                            file_type="generated",
                                            db=session,
                                            description=f"Generated by tool: {tool_config.name}",
                                        )

                                        # 返回可访问的URL（保持原格式）
                                        view_url = f"/assets/{saved_file.id}/{filename}"
                                        media_urls.append(view_url)
                                        tools_logger.info(f"✅ Saved base64 image: {filename} -> {view_url}")
                                        return view_url
                            except Exception as e:
                                tools_logger.error(f"Failed to save base64 image: {e}", exc_info=True)

                    return data

                # 处理结果中的媒体文件
                if user_id:
                    result = await save_media_from_result(result)

            # 空结果处理：查询成功但无数据时，返回明确的"未查询到数据"信号，
            # 避免模型误判为失败并循环重试。
            if result is None or (
                isinstance(result, (list, dict, str, tuple)) and len(result) == 0
            ):
                tools_logger.info(
                    f"Tool '{tool_config.name}' returned empty result — returning no_data signal"
                )
                return {
                    "status": "no_data",
                    "message": "未查询到符合条件的数据（调用成功，结果为空，请勿重试，直接告知用户无数据）",
                }

            return result
        except Exception as e:
            tools_logger.error(f"Tool '{tool_config.name}' execution error: {str(e)}", exc_info=True)
            return {
                "error": True,
                "message": str(e),
                "tool_name": tool_config.name
            }

    # Create description with calling guide if available
    description = tool_config.description
    if tool_config.calling_guide:
        description = f"{description}\n\nCalling Guide: {tool_config.calling_guide}"

    # Custom validation-error handler: converts pydantic's raw "Field required"
    # message into a clear instruction so the model retries with the missing
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
                f"调用工具 '{tool_config.name}' 缺少必填参数: {missing}。"
                "请从用户消息中提取这些参数的具体值后再次调用。"
                "禁止不带参数直接调用。若无法从对话中确定，请先向用户澄清。"
            )
        return f"参数校验失败: {exc}"

    return StructuredTool.from_function(
        coroutine=tool_function,
        name=tool_config.name,
        description=description,
        args_schema=args_schema,
        handle_validation_error=_validation_error_handler,
    )


async def get_user_tools(user_id: int, db: AsyncSession, user_info: dict) -> List[StructuredTool]:
    """Load all enabled user tools for a specific user.

    Args:
        user_id: User ID
        db: Database session
        user_info: User information for tool execution context

    Returns:
        List of StructuredTool instances
    """
    from src.utils.logger import tools_logger

    # Query enabled user tools
    result = await db.execute(
        select(UserTool).where(
            UserTool.user_id == user_id,
            UserTool.enabled == True
        )
    )

    tools = result.scalars().all()
    tools_logger.info(f"Found {len(tools)} enabled tools in database for user {user_id}")

    # Convert to LangChain tools
    langchain_tools = []
    for tool in tools:
        try:
            tools_logger.debug(f"Creating tool: {tool.name}")
            langchain_tool = await create_user_tool(tool, user_info)
            langchain_tools.append(langchain_tool)
            tools_logger.debug(f"Successfully created tool: {tool.name}")
        except Exception as e:
            tools_logger.error(f"Failed to create tool {tool.name}: {e}", exc_info=True)
            continue

    return langchain_tools


async def get_tools_requiring_approval(user_id: int, db: AsyncSession) -> List[str]:
    """Get names of user tools that require approval.

    Args:
        user_id: User ID
        db: Database session

    Returns:
        List of tool names requiring approval
    """
    result = await db.execute(
        select(UserTool.name).where(
            UserTool.user_id == user_id,
            UserTool.enabled == True,
            UserTool.requires_approval == True
        )
    )

    return [name for name in result.scalars().all()]
