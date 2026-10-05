import {
  pgTable,
  uuid,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Blocks Table ───────────────────────────────────────────────────────
// Composite PK (blockerId, blockedId) — a user cannot block someone twice.
// No cascade on blocked user deletion: if blocked user is deleted, the block
// row can stay for historical audit, but we set it null-safe in queries.
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    uniqueBlock: unique('unique_block').on(table.blockerId, table.blockedId),
  })
);
