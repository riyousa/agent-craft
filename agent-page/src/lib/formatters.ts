/**
 * Number formatters used across list views.
 *
 * - formatCalls / formatRuns: tool/skill 7-day call counts → "12 / 1.2k / 12k".
 * - formatTokens: conversation token totals → "999 / 1.2k / 1.5M".
 */

export function formatCalls(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1000).toFixed(0)}k`;
}

// Same shape as formatCalls — kept as a separate export so call sites
// read the right intent ("runs" vs "calls").
export const formatRuns = formatCalls;

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * Format milliseconds as "420 ms" / "1.2 s" / "——" (when n <= 0).
 */
export function formatLatencyMs(n: number): string {
  if (!n || n <= 0) return '——';
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(1)} s`;
}
