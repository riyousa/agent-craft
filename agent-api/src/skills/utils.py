"""Utility functions for skill management."""
import re
from typing import List, Set


def extract_required_tools(prompt_template: str) -> List[str]:
    """从模板中提取工具名称.

    支持的占位符格式:
    - {{tool:tool_name(...)}} - Tool调用

    Args:
        prompt_template: 包含占位符的提示模板

    Returns:
        去重后的Tool名称列表
    """
    if not prompt_template:
        return []

    # 匹配 {{tool:tool_name(...)} 格式
    pattern = r'\{\{tool:([\w_]+)\('
    matches = re.findall(pattern, prompt_template)

    # 去重并保持顺序
    seen: Set[str] = set()
    result = []
    for tool_name in matches:
        if tool_name not in seen:
            seen.add(tool_name)
            result.append(tool_name)

    return result


def validate_tool_references(
    prompt_template: str,
    available_tools: List[str]
) -> tuple[bool, List[str]]:
    """验证模板中的Tool引用是否都存在.

    Args:
        prompt_template: 包含占位符的提示模板
        available_tools: 可用的Tool名称列表

    Returns:
        (是否有效, 不存在的Tool列表)
    """
    required_tools = extract_required_tools(prompt_template)
    available_set = set(available_tools)

    invalid_tools = [tool for tool in required_tools if tool not in available_set]

    return len(invalid_tools) == 0, invalid_tools


def check_requires_approval(
    required_tool_names: List[str],
    tool_approval_map: dict[str, bool]
) -> bool:
    """根据依赖的Tools判断Skill是否需要审批.

    Args:
        required_tool_names: 依赖的Tool名称列表
        tool_approval_map: Tool名称到是否需要审批的映射

    Returns:
        如果任一依赖的Tool需要审批，则返回True
    """
    for tool_name in required_tool_names:
        if tool_approval_map.get(tool_name, False):
            return True
    return False


def extract_input_parameters(prompt_template: str) -> Set[str]:
    """从模板中提取所有{{input.xxx}}引用的参数.

    Args:
        prompt_template: 包含占位符的提示模板

    Returns:
        参数名称集合
    """
    if not prompt_template:
        return set()

    # 匹配 {{input.param_name}} 格式
    pattern = r'\{\{input\.([\w_]+)\}\}'
    matches = re.findall(pattern, prompt_template)

    return set(matches)


def validate_placeholder_syntax(prompt_template: str) -> tuple[bool, List[str]]:
    """验证占位符语法是否正确.

    检查:
    1. 占位符括号是否匹配
    2. 占位符格式是否正确

    Args:
        prompt_template: 包含占位符的提示模板

    Returns:
        (是否有效, 错误消息列表)
    """
    if not prompt_template:
        return True, []

    errors = []

    # 检查Jinja2控制流标签
    jinja_tags = re.findall(r'\{%\s*(\w+)', prompt_template)
    if jinja_tags:
        errors.append(f"不支持Jinja2控制流语法: '{{% {jinja_tags[0]} %}}', 列表数据请直接引用 {{{{result.tool_name}}}}, 由AI代理在运行时处理展示")

    # 检查占位符括号匹配
    open_count = prompt_template.count('{{')
    close_count = prompt_template.count('}}')
    if open_count != close_count:
        errors.append(f"占位符括号不匹配: 有{open_count}个'{{{{', 但有{close_count}个'}}}}'")

    # 检查占位符格式
    # 查找所有{{...}}
    placeholder_pattern = r'\{\{([^}]+)\}\}'
    placeholders = re.findall(placeholder_pattern, prompt_template)

    for placeholder in placeholders:
        placeholder = placeholder.strip()

        # 验证占位符类型
        if placeholder.startswith('tool:'):
            # Tool调用格式: tool:tool_name(...)
            if '(' not in placeholder:
                errors.append(f"Tool占位符格式错误: '{{{{{placeholder}}}}}' 缺少参数括号")
        elif placeholder.startswith('input.'):
            # 输入参数格式: input.param_name
            param_name = placeholder[6:]  # 去掉 "input."
            if not re.match(r'^[\w_]+$', param_name):
                errors.append(f"输入参数名称格式错误: '{{{{{placeholder}}}}}', 参数名只能包含字母、数字和下划线")
        elif placeholder.startswith('result.'):
            # 结果引用格式: result.tool_name 或 result.tool_name.field_name
            parts = placeholder.split('.')
            if len(parts) < 2 or not parts[1]:
                errors.append(f"结果引用格式错误: '{{{{{placeholder}}}}}', 应为 result.tool_name 或 result.tool_name.field_name")
        else:
            # 检测Jinja2语法误用
            jinja_keywords = ['loop.index', 'loop.index0', 'loop.length', 'item.', 'forloop.']
            is_jinja = any(kw in placeholder for kw in jinja_keywords)
            if is_jinja:
                errors.append(f"不支持Jinja2语法: '{{{{{placeholder}}}}}', 列表数据请直接引用 {{{{result.tool_name}}}}, 由AI代理在运行时处理展示")
            else:
                errors.append(f"未知的占位符类型: '{{{{{placeholder}}}}}', 支持的类型: tool:, input., result.")

    return len(errors) == 0, errors
