/**
 * Conversation-level metrics that aren't on the backend yet.
 * Backend gap tracked in design_update.md Phase 4.
 *
 * Deterministic per thread_id — same thread, same numbers across reloads.
 */
import type { Conversation } from '../api/user';

export interface ConversationStats {
  thread_id: string;
  is_starred: boolean;
  is_archived: boolean;
  tokens_total: number;
  tools_called: number;
  /** Mock model attribution — design wants a model column per row but
   *  the backend doesn't track which model handled each conversation.
   *  Picked deterministically from a small allowlist so the same
   *  thread always shows the same model. */
  model_label: string;
}

// Tiny deterministic hash so two reloads see the same value.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MODEL_POOL = [
  'Claude Sonnet 4.5',
  'Claude Haiku 4.5',
  'GPT-4o',
  'Doubao 1.5 Pro',
  'Qwen-Max',
];

export function statsFor(c: Pick<Conversation, 'thread_id' | 'message_count'>): ConversationStats {
  const seed = hash(c.thread_id || '');
  const msgs = c.message_count || 0;
  // Average ~600 tokens per assistant turn; +variance from the seed.
  const tokens_total = Math.round(msgs * (450 + (seed % 320)));
  return {
    thread_id: c.thread_id,
    is_starred: seed % 11 === 0,
    is_archived: seed % 17 === 0,
    tokens_total,
    // Roughly ~1 tool call per 3 messages, capped.
    tools_called: Math.min(Math.floor(msgs / 3) + (seed % 4), 12),
    model_label: MODEL_POOL[seed % MODEL_POOL.length],
  };
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export const MOCK_MODEL_OPTIONS = ['全部模型', ...MODEL_POOL];
