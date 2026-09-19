import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { conversations } from './conversations.js';

export const messageStatusEnum = pgEnum('message_status', [
  'sent',       // saved to DB (single grey tick)
  'delivered',  // recipient socket online (double grey tick)
  'read',       // recipient read it (double blue tick)
]);

export const messages = pgTable('messages', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),

  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  content: text('content').notNull(),

  status: messageStatusEnum('status').default('sent').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
