import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Global interests catalogue (seeded, not user-created) ──────────────
export const interests = pgTable('interests', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  name: varchar('name', { length: 100 }).notNull().unique(),
  category: varchar('category', { length: 100 }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

// ── User ↔ Interest join table ─────────────────────────────────────────
export const userInterests = pgTable(
  'user_interests',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    interestId: uuid('interest_id')
      .notNull()
      .references(() => interests.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.interestId] }),
  })
);
