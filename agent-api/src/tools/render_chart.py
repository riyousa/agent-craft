"""Built-in `render_chart` tool.

Validates a chart specification with Pydantic, then returns a markdown
```chart ...``` code fence. The frontend's ReactMarkdown override picks
up that code fence and renders it as an interactive Recharts chart.

This tool has no side effects — it's a format/validate pass so the LLM
can't ship a malformed spec to the user.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, model_validator

from src.utils.logger import tools_logger


SUPPORTED_TYPES = ("bar", "line", "scatter", "pie", "area")
MAX_DATA_POINTS = 500
MAX_SERIES = 8


class ChartSeries(BaseModel):
    """One series/line on the chart."""
    dataKey: str = Field(..., description="必须与 data 中每行的字段名一致")
    name: Optional[str] = Field(None, description="图例显示名，默认与 dataKey 相同")
    color: Optional[str] = Field(None, description="颜色（hex 或 CSS var），默认使用设计系统配色")


class RenderChartInput(BaseModel):
    """Structured chart spec. All validation happens here."""

    type: Literal["bar", "line", "scatter", "pie", "area"] = Field(
        ..., description="图表类型"
    )
    title: Optional[str] = Field(None, description="图表标题")
    xKey: str = Field(..., description="X 轴字段名（饼图忽略）")
    series: List[ChartSeries] = Field(
        ..., min_length=1, max_length=MAX_SERIES,
        description="一个或多个数据系列",
    )
    data: List[Dict[str, Any]] = Field(
        ..., min_length=1, max_length=MAX_DATA_POINTS,
        description="数据行数组，每行字段必须包含 xKey 和所有 series.dataKey",
    )

    @model_validator(mode="after")
    def _check_keys_and_types(self):
        required = {self.xKey} | {s.dataKey for s in self.series}
        for i, row in enumerate(self.data):
            missing = required - set(row.keys())
            if missing:
                raise ValueError(
                    f"data[{i}] 缺少字段: {sorted(missing)}。所有行必须包含: {sorted(required)}"
                )

        # Pie ignores xKey for grouping; still requires series values numeric.
        for s in self.series:
            for i, row in enumerate(self.data):
                v = row[s.dataKey]
                if not isinstance(v, (int, float)) or isinstance(v, bool):
                    raise ValueError(
                        f"data[{i}].{s.dataKey!r} 必须是数字，当前类型: {type(v).__name__}, 值: {v!r}"
                    )
        return self


async def render_chart_fn(**kwargs: Any) -> str:
    """Validate the chart spec and wrap it in a markdown code fence."""
    try:
        spec = RenderChartInput(**kwargs)
    except Exception as e:
        tools_logger.warning(f"render_chart validation failed: {e}")
        # Return a readable error so the LLM can retry with a corrected spec.
        return f"⚠️ 图表参数错误：{e}"

    payload = spec.model_dump(exclude_none=True)
    fenced = "```chart\n" + json.dumps(payload, ensure_ascii=False) + "\n```"
    tools_logger.info(
        f"render_chart OK: type={spec.type} points={len(spec.data)} series={len(spec.series)}"
    )
    return fenced


RENDER_CHART_DESCRIPTION = """生成可视化图表（柱状/折线/散点/饼图/面积图）。

使用场景：当用户要求图表、可视化、趋势对比，或当数据适合图形展示时调用。

流程：
1. 先用其他工具拿到原始数据
2. 从结果中筛选出要画图的行，整理成 [{字段: 值}] 格式（字段名中英文都行）
3. 把整理好的 data 传进来

关键规则：
- data 里每一行都必须包含 xKey 和所有 series.dataKey 对应的字段
- 数值字段必须是 number 类型，不要带单位（单位写在 series.name 里）
- 图表会自动渲染成交互式图（支持缩放、导出 PNG、切换类型）
- 调用成功后在回复里简要说明图表含义即可，不要重复原始数据

示例：
  type='bar', title='各省配额', xKey='省份',
  series=[{'dataKey': 'quota', 'name': '剩余配额'}],
  data=[{'省份': '广西', 'quota': 350}, {'省份': '广东', 'quota': 200}]
"""


def build_render_chart_tool() -> StructuredTool:
    """Return the built-in render_chart tool for registry wiring."""
    return StructuredTool.from_function(
        coroutine=render_chart_fn,
        name="render_chart",
        description=RENDER_CHART_DESCRIPTION,
        args_schema=RenderChartInput,
    )
