import {
  pgTable,
  uuid,
  text,
  boolean,
  varchar,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { conversations } from './conversations.js';

// ── Message type enum ──────────────────────────────────────────────────
export const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'voice']);

// ── Message status enum ────────────────────────────────────────────────
export const messageStatusEnum = pgEnum('message_status', [
  'sent',       // saved to DB (single grey tick)
  'delivered',  // recipient socket online (double grey tick)
  'read',       // recipient viewed it (double blue tick)
]);

// ── Messages Table ─────────────────────────────────────────────────────
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

  // Message body — can be empty if it's a media-only message
  content: text('content').notNull().default(''),

  messageType: messageTypeEnum('message_type').notNull().default('text'),

  // URL returned by POST /chats/{chatId}/media — set for image/voice messages
  mediaUrl: varchar('media_url', { length: 2048 }),

  // Read receipt flag (simpler than full status enum for REST queries)
  isRead: boolean('is_read').notNull().default(false),

  // Full status for Socket.io tick tracking
  status: messageStatusEnum('status').default('sent').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
