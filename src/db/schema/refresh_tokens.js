import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Audience enum separates app tokens from admin tokens.
 * A regular user's refresh token can never be used to refresh an admin session.
 */
export const tokenAudienceEnum = pgEnum('token_audience', ['app', 'admin']);

/**
 * Proper server-side refresh token store.
 *
 * Replaces the single `refresh_token` column on `users`, which:
 *   - stores the plain token (not a hash)
 *   - only allows one session per user
 *   - doesn't support audience separation
 *
 * Migration path: keep the users.refreshToken column for the existing app flow
 * for now (non-breaking); new admin tokens go here exclusively. The app flow
 * should be migrated to this table in a follow-up.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // SHA-256 hash of the raw token — never store plain tokens
    tokenHash: text('token_hash').notNull().unique(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Separates admin sessions from regular app sessions
    audience: tokenAudienceEnum('audience').notNull(),

    // Device / browser hint for "active sessions" UI
    userAgent: varchar('user_agent', { length: 500 }),
    ip: varchar('ip', { length: 45 }),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Null until the token is revoked (logout / ban / rotation)
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    // "All live sessions for user X" — used on ban to revoke all
    userAudienceIdx: index('rt_user_audience_idx').on(table.userId, table.audience),
    // Clean-up job: find expired tokens
    expiresAtIdx: index('rt_expires_at_idx').on(table.expiresAt),
  })
);
