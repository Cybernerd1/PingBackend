import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Per-admin security credentials.
 *
 * Password hash stays on users.password (single source of truth — the admin
 * login compares against it). This table holds everything else the admin
 * auth flow needs:
 *   - TOTP secret, encrypted at rest with AES-256-GCM (MFA_ENCRYPTION_KEY)
 *   - MFA enabled flag — when true, login returns a pending mfa_token and
 *     the session is only issued after POST /admin/auth/mfa/verify
 *   - recovery codes — bcrypt hashes of 10 single-use codes (jsonb array)
 *   - failed-attempt counter + lockout timestamp (5 failures → 15 min lock)
 */
export const adminCredentials = pgTable('admin_credentials', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // AES-256-GCM envelope: "v1.<iv b64>.<tag b64>.<ciphertext b64>"
  mfaSecretEncrypted: text('mfa_secret_encrypted'),

  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),

  // Array of bcrypt hashes — plain codes are shown exactly once at creation
  recoveryCodes: jsonb('recovery_codes').default(sql`'[]'::jsonb`).notNull(),

  failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),

  // While set (future), login is rejected regardless of password correctness
  lockedUntil: timestamp('locked_until', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
