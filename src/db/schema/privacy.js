import {
  pgTable,
  uuid,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Privacy settings (one per user) ───────────────────────────────────
export const privacySettings = pgTable('privacy_settings', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  showDistance: boolean('show_distance').notNull().default(true),
  showAge: boolean('show_age').notNull().default(true),
  showOnlineStatus: boolean('show_online_status').notNull().default(false),
  profileVisibleInDiscover: boolean('profile_visible_in_discover').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
