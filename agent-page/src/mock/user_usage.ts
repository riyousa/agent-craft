/**
 * Per-user usage stats that aren't on the backend yet.
 * Backend gap tracked in design_update.md Phase 4.
 *
 * Deterministic per user id — same user, same numbers across reloads.
 */

export interface UserUsage {
  /** Tokens used this calendar month. */
  monthly_tokens: number;
  /** ¥ cost this month, mirrors monthly_tokens via a fixed rate. */
  monthly_spend_cny: number;
  /** Roughly how long since the user last interacted, in seconds. */
  last_active_seconds: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function usageFor(
  userId: number | string,
  isActive: boolean = true,
): UserUsage {
  const seed = hash(String(userId));
  if (!isActive) {
    return { monthly_tokens: 0, monthly_spend_cny: 0, last_active_seconds: 60 * 60 * 24 * 30 };
  }
  // Distribution biased to mid-range (10k–500k).
  const monthly_tokens = 8000 + (seed % 920_000);
  // Mock blended rate: ¥0.30 / 1k tokens.
  const monthly_spend_cny = +(monthly_tokens * 0.0003).toFixed(2);
  // Recent activity buckets.
  const last_active_seconds =
    seed % 5 === 0
      ? Math.floor(seed % 600) // 0–10 min
      : seed % 5 === 1
        ? 600 + (seed % 7200) // 10 min – 2 h
        : seed % 5 === 2
          ? 7200 + (seed % 50000) // 2 h – ~14 h
          : seed % 5 === 3
            ? 86400 + (seed % 86400) // 1–2 days
            : 86400 * 3 + (seed % (86400 * 14)); // 3–17 days
  return { monthly_tokens, monthly_spend_cny, last_active_seconds };
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatRelativeFromSeconds(s: number): string {
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 2) return '昨天';
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return '——';
}
