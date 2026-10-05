import {
  pgTable,
  uuid,
  pgEnum,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Swipe direction enum ───────────────────────────────────────────────
export const swipeDirectionEnum = pgEnum('swipe_direction', ['like', 'dislike']);

// ── Swipes Table ───────────────────────────────────────────────────────
// Each row records a single swipe by swiperId on swipedId.
// The unique constraint prevents duplicate swipes and makes undo safe.
export const swipes = pgTable(
  'swipes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    swiperId: uuid('swiper_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    swipedId: uuid('swiped_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    direction: swipeDirectionEnum('direction').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    // Prevents duplicate swipes — idempotent on retry
    uniqueSwipe: unique('unique_swipe').on(table.swiperId, table.swipedId),
  })
);
