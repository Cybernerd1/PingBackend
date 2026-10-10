import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  doublePrecision,
  timestamp,
  pgEnum,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ──────────────────────────────────────────────────────────────
export const genderEnum = pgEnum('gender', [
  'male',
  'female',
  'non-binary',
  'other',
  'prefer_not_to_say',
]);

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const onboardingStepEnum = pgEnum('onboarding_step', [
  'profile',
  'interests',
  'photos',
  'preferences',
  'completed',
]);

// ── Users Table ────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // ── Auth identifiers ───────────────────────────────────────────────
    googleId: varchar('google_id', { length: 255 }).unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    phone: varchar('phone', { length: 30 }),
    password: varchar('password', { length: 255 }),
    refreshToken: text('refresh_token'),
    isEmailVerified: boolean('is_email_verified').default(false).notNull(),

    // ── Profile ────────────────────────────────────────────────────────
    fullName: varchar('full_name', { length: 100 }),
    username: varchar('username', { length: 30 }).unique(),
    birthdate: date('birthdate'),           // ISO date string "YYYY-MM-DD"
    gender: genderEnum('gender'),
    bio: varchar('bio', { length: 300 }),

    // Google avatar (fallback when no uploaded photo)
    googleAvatar: text('google_avatar'),

    // ── Location ───────────────────────────────────────────────────────
    locationLat: doublePrecision('location_lat'),
    locationLng: doublePrecision('location_lng'),
    locationSharing: boolean('location_sharing').default(false).notNull(),

    // ── Status flags ───────────────────────────────────────────────────
    isVerified: boolean('is_verified').default(false).notNull(),
    isBanned: boolean('is_banned').default(false).notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),  // soft-deleted profile
    isAccountDeleted: boolean('is_account_deleted').default(false).notNull(), // hard delete flag

    // ── Ban & delete audit trail ────────────────────────────────────────
    // Populated by admin actions — never by the user themselves
    bannedAt: timestamp('banned_at', { withTimezone: true }),
    bannedReason: varchar('banned_reason', { length: 500 }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    // ── Activity tracking ──────────────────────────────────────────────
    // Written at most once per 5 min by auth middleware (throttled)
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),

    // ── Onboarding ─────────────────────────────────────────────────────
    onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
    onboardingStep: onboardingStepEnum('onboarding_step').default('profile').notNull(),

    role: roleEnum('role').default('user').notNull(),

    // ── Demo / seed accounts ───────────────────────────────────────────
    // is_demo  → shared test login (email + password). Sees real + dummy users.
    // is_dummy → seeded sample profiles. Only visible to demo accounts; can't sign in.
    isDemo: boolean('is_demo').default(false).notNull(),
    isDummy: boolean('is_dummy').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    // Admin stats: sign-up time series
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
    // "Active in last N days" queries
    lastActiveIdx: index('users_last_active_idx').on(table.lastActiveAt),
    // Email search (admin user lookup)
    emailIdx: index('users_email_idx').on(table.email),
    // ILIKE '%term%' admin search — requires the pg_trgm extension
    nameTrgmIdx: index('users_name_trgm_idx').using(
      'gin',
      sql`${table.fullName} gin_trgm_ops`
    ),
    emailTrgmIdx: index('users_email_trgm_idx').using(
      'gin',
      sql`${table.email} gin_trgm_ops`
    ),
  })
);