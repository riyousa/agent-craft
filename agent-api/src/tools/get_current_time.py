"""Built-in `get_current_time` tool.

Some chat models hallucinate "今天是几号" / "现在几点了" because their
training cutoff sits well in the past. Exposing a side-effect-free clock
tool lets the LLM look up real wall-clock time instead of guessing.

The tool defaults to the server's local timezone (China deployments run
in Asia/Shanghai) but accepts any IANA zone name on demand.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from src.utils.logger import tools_logger


_DEFAULT_TZ_NAME = "Asia/Shanghai"
_WEEKDAY_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


class GetCurrentTimeInput(BaseModel):
    """Empty-by-default; pass an IANA zone only when the user asks for one."""

    timezone: Optional[str] = Field(
        None,
        description=(
            "可选 IANA 时区名（如 'Asia/Shanghai'、'UTC'、'America/New_York'）。"
            "留空时使用服务端默认时区（Asia/Shanghai）。"
        ),
    )


def _resolve_zone(name: Optional[str]) -> tuple[ZoneInfo, str]:
    target = (name or _DEFAULT_TZ_NAME).strip()
    try:
        return ZoneInfo(target), target
    except ZoneInfoNotFoundError:
        # Fall back to default rather than failing — the model can retry with
        # a corrected name if it cares.
        tools_logger.warning(f"get_current_time: unknown timezone {target!r}, falling back to {_DEFAULT_TZ_NAME}")
        return ZoneInfo(_DEFAULT_TZ_NAME), _DEFAULT_TZ_NAME


async def get_current_time_fn(**kwargs: Any) -> str:
    tz, tz_name = _resolve_zone(kwargs.get("timezone"))
    now_local = datetime.now(tz)
    now_utc = now_local.astimezone(timezone.utc)
    weekday_zh = _WEEKDAY_ZH[now_local.weekday()]
    offset = now_local.strftime("%z")
    offset_pretty = f"{offset[:3]}:{offset[3:]}" if offset else ""

    lines = [
        f"当前时间（{tz_name}）：{now_local.strftime('%Y-%m-%d %H:%M:%S')} {weekday_zh}",
        f"ISO 8601: {now_local.isoformat(timespec='seconds')}",
        f"UTC:      {now_utc.strftime('%Y-%m-%d %H:%M:%S')}Z",
        f"时区偏移: UTC{offset_pretty}",
    ]
    out = "\n".join(lines)
    tools_logger.info(f"get_current_time -> tz={tz_name} iso={now_local.isoformat(timespec='seconds')}")
    return out


GET_CURRENT_TIME_DESCRIPTION = """获取当前真实时间。

⏰ **何时调用**：
- 用户问"今天是几号"、"现在几点"、"星期几"、"明天/昨天是哪天"、"距离 X 还有几天"等。
- 任何需要"当下"时间作为基准的计算（生成日期范围、判断是否过期、写邮件抬头等）。
- 不要凭训练记忆回答日期/时间，先调这个工具。

参数：
- timezone（可选）：IANA 时区名。留空使用服务端默认时区。
"""


def build_get_current_time_tool() -> StructuredTool:
    return StructuredTool.from_function(
        coroutine=get_current_time_fn,
        name="get_current_time",
        description=GET_CURRENT_TIME_DESCRIPTION,
        args_schema=GetCurrentTimeInput,
    )
