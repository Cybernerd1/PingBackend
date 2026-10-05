import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { matches } from './matches.js';

// ── Chat status enum ───────────────────────────────────────────────────
export const chatStatusEnum = pgEnum('chat_status', [
  'active',    // normal active chat
  'archived',  // after unmatch — hidden from users but retained for moderation
]);

// ── Conversations / Chats Table ────────────────────────────────────────
// "conversations" in code maps to "chats" in the API spec.
// Renamed for spec consistency; legacy column names preserved in DB.
export const conversations = pgTable('conversations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Participants (ordered lo < hi to prevent duplicate pairs)
  user1Id: uuid('user1_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  user2Id: uuid('user2_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // FK to the match that created this chat
  matchId: uuid('match_id')
    .references(() => matches.id, { onDelete: 'set null' }),

  // Status — 'active' normally; 'archived' after unmatch/block
  statusCode: chatStatusEnum('status_code').notNull().default('active'),

  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
