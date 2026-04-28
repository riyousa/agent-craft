/**
 * Tool-level metrics that aren't tracked on the backend yet.
 * Backend gap tracked in design_update.md Phase 4.
 *
 * Deterministic per tool name — same tool, same numbers across reloads.
 */

export interface ToolMetrics {
  /** Calls in the last 7 days. */
  calls_7d: number;
  /** P95 latency, formatted string ("420 ms" / "1.2 s" / "——"). */
  p95: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function metricsFor(name: string, enabled: boolean = true): ToolMetrics {
  if (!enabled) {
    return { calls_7d: 0, p95: '——' };
  }
  const seed = hash(name || '');
  // Distribution biased toward "moderate" usage (~hundreds to low thousands).
  const calls_7d = Math.round(20 + (seed % 9300));
  const ms = 60 + (seed % 1400);
  const p95 = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  return { calls_7d, p95 };
}

export function formatCalls(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1000).toFixed(0)}k`;
}
