import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Matches Table ──────────────────────────────────────────────────────
// Created automatically when two users mutually like each other.
// userAId < userBId ordering is enforced at application level to avoid
// duplicate pairs (i.e., (A,B) and (B,A) are the same match).
export const matches = pgTable(
  'matches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Canonical ordering: userAId < userBId (UUIDs compared lexicographically)
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Soft-delete for unmatch — preserves chat history reference
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    // A pair can only match once
    uniqueMatch: unique('unique_match').on(table.userAId, table.userBId),
  })
);
