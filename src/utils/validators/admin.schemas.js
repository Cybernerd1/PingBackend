/**
 * Zod schemas for every admin endpoint input (params, query, body).
 * Mounted via validate(schema, target) — see validate.middleware.js.
 */
import { z } from 'zod';

const uuid = z.string().uuid('must be a UUID');

// ── Shared pagination ──────────────────────────────────────────────────
export const adminPageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Hard ceiling of 100 rows per page everywhere
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

// ── Auth ───────────────────────────────────────────────────────────────
export const adminLoginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
}).strict();

export const adminMfaVerifySchema = z.object({
  mfa_token: z.string().min(20).max(2000),
  // 6-digit TOTP or an XXXX-XXXX recovery code (accept lower/spacing)
  code: z.string().min(6).max(10),
}).strict();

export const adminRefreshSchema = z.object({
  refresh_token: z.string().min(20).max(2000),
}).strict();

// ── Users ──────────────────────────────────────────────────────────────
export const adminUserIdParam = z.object({
  id: uuid,
}).strict();

export const adminUserListQuery = adminPageQuery.extend({
  search: z.string().trim().max(100).optional(),
  filter: z.enum([
    'banned', 'verified', 'deleted', 'demo', 'admin', 'incomplete',
  ]).optional(),
  sort: z.enum(['created_at', 'last_active']).default('created_at'),
}).strict();

export const adminBanBody = z.object({
  reason: z.string().trim().min(3, 'reason is required').max(500),
}).strict();

export const adminVerifyBody = z.object({
  verified: z.boolean(),
}).strict();

// ── Reports ────────────────────────────────────────────────────────────
export const adminReportIdParam = z.object({
  id: uuid,
}).strict();

export const adminReportListQuery = adminPageQuery.extend({
  status: z.enum(['pending', 'reviewed', 'actioned', 'dismissed']).optional(),
  reason: z.enum([
    'spam', 'inappropriate_content', 'harassment', 'fake_profile',
    'underage', 'hate_speech', 'other',
  ]).optional(),
}).strict();

export const adminReportPatchBody = z.object({
  status: z.enum(['pending', 'reviewed', 'actioned', 'dismissed']).optional(),
  admin_note: z.string().trim().max(2000).optional(),
})
  .strict()
  .refine((v) => v.status !== undefined || v.admin_note !== undefined, {
    message: 'provide status and/or admin_note',
  });

export const adminReportActionBody = z.object({
  admin_note: z.string().trim().max(2000).optional(),
}).strict();

export const adminConversationQuery = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

// ── Audit log ──────────────────────────────────────────────────────────
export const adminAuditListQuery = adminPageQuery.extend({
  admin_id: uuid.optional(),
  target_type: z.enum(['user', 'report', 'conversation']).optional(),
  target_id: uuid.optional(),
  action: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict();

// ── Stats ──────────────────────────────────────────────────────────────
export const adminStatsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
}).strict();
