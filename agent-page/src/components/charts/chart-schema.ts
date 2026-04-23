/**
 * Zod schema for the render_chart spec.
 *
 * Matches the backend Pydantic model in src/tools/render_chart.py. The
 * frontend validates a second time so malformed specs from older chat
 * history (or a buggy LLM) don't crash the renderer.
 */
import { z } from 'zod';

export const CHART_TYPES = ['bar', 'line', 'scatter', 'pie', 'area'] as const;
export type ChartType = typeof CHART_TYPES[number];

export const ChartSeriesSchema = z.object({
  dataKey: z.string().min(1),
  name: z.string().optional(),
  color: z.string().optional(),
});

export const ChartSpecSchema = z.object({
  type: z.enum(CHART_TYPES),
  title: z.string().optional(),
  xKey: z.string().min(1),
  series: z.array(ChartSeriesSchema).min(1).max(8),
  data: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

export type ChartSeries = z.infer<typeof ChartSeriesSchema>;
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/**
 * Parse a ```chart``` code fence's JSON body into a validated spec.
 * Returns `{ ok: true, spec }` or `{ ok: false, error }`.
 */
export function parseChartSpec(raw: string):
  | { ok: true; spec: ChartSpec }
  | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e: any) {
    return { ok: false, error: `JSON 解析失败: ${e.message}` };
  }
  const result = ChartSpecSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')} · ${issue.message}` };
  }
  return { ok: true, spec: result.data };
}
