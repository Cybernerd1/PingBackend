import {
  pgTable,
  uuid,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const conversations = pgTable('conversations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  user1Id: uuid('user1_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  user2Id: uuid('user2_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
