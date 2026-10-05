import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  text,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Dating preferences (one per user) ─────────────────────────────────
// Controls who appears in the discover swipe deck.
export const preferences = pgTable('preferences', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Array stored as text (comma-separated genders) — Drizzle array type
  // e.g. ["male","female"] or ["male"] or ["everyone"]
  interestedIn: text('interested_in').array().notNull().default(sql`'{}'`),

  minAge: integer('min_age').notNull().default(18),
  maxAge: integer('max_age').notNull().default(45),
  maxDistanceKm: integer('max_distance_km').notNull().default(50),

  // Soft toggle — user can pause discovery without deleting prefs
  discoveryEnabled: boolean('discovery_enabled').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
