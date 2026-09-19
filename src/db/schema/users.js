import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ──────────────────────────────────────────────────────────────
export const genderEnum = pgEnum('gender', [
  'man',
  'woman',
  'non-binary',
  'other',
  'prefer_not_to_say',
]);

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const onboardingStepEnum = pgEnum('onboarding_step', [
  'profile',
  'photos',
  'completed',
]);

export const interestedInEnum = pgEnum('interested_in', [
  'men',
  'women',
  'non-binary',
  'everyone',
]);

// ── Users Table ────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Auth
  googleId: varchar('google_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }),
  refreshToken: text('refresh_token'),
  isEmailVerified: boolean('is_email_verified').default(false).notNull(),

  // Profile
  name: varchar('name', { length: 50 }),
  username: varchar('username', { length: 20 }).unique(),
  dateOfBirth: date('date_of_birth'),
  gender: genderEnum('gender'),
  about: varchar('about', { length: 500 }),

  // Preferences stored as array
  interestedIn: text('interested_in').array(),

  // Google avatar (fallback)
  googleAvatar: text('google_avatar'),

  // Onboarding state
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  onboardingStep: onboardingStepEnum('onboarding_step').default('profile').notNull(),

  role: roleEnum('role').default('user').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});