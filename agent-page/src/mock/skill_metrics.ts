/**
 * Skill-level metrics that aren't tracked on the backend yet.
 * Backend gap tracked in design_update.md Phase 4.
 *
 * Deterministic per skill name — same skill, same numbers across reloads.
 */

export interface SkillMetrics {
  /** Runs in the last 7 days. */
  runs_7d: number;
  /** Distinct users who invoked the skill in the last 7 days. */
  users_using: number;
  /** P95 latency, formatted string. */
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

export function metricsFor(name: string, enabled: boolean = true): SkillMetrics {
  if (!enabled) {
    return { runs_7d: 0, users_using: 0, p95: '——' };
  }
  const seed = hash(name || '');
  // Skills run less frequently than tools — single-digit to low-thousand.
  const runs_7d = 5 + (seed % 1800);
  const users_using = 1 + (seed % 24);
  // Skills are slower (multi-tool workflows) — 800ms to 6s.
  const ms = 800 + (seed % 5200);
  const p95 = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  return { runs_7d, users_using, p95 };
}

export function formatRuns(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1000).toFixed(0)}k`;
}
