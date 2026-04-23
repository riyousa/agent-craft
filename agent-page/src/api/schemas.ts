/**
 * Zod schemas for API response validation.
 *
 * Enforced at the API boundary so role_level and other security-sensitive
 * fields can't silently drift from their declared shape.
 */
import { z } from 'zod';

// Accept null or undefined from the server, but normalize to undefined so
// consumers (AuthContext etc.) don't have to handle null explicitly.
const optString = z.preprocess((v) => (v === null ? undefined : v), z.string().optional());

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  email: optString,
  role_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: optString,
});
export type User = z.infer<typeof UserSchema>;

export const TokenResponseSchema = z.object({
  access_token: z.string().min(10),
  token_type: z.string(),
  user: UserSchema,
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const ApiKeyInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  key_prefix: z.string(),
  is_active: z.boolean(),
  auto_approve: z.boolean().optional().default(false),
  last_used_at: optString,
  created_at: optString,
});
export type ApiKeyInfo = z.infer<typeof ApiKeyInfoSchema>;

export const ApiKeyCreatedSchema = ApiKeyInfoSchema.extend({
  full_key: z.string(),
});
export type ApiKeyCreated = z.infer<typeof ApiKeyCreatedSchema>;
