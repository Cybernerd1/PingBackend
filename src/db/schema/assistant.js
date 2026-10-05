import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// ── Ping Assistant chat history (one thread per user) ─────────────────
export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    role: varchar('role', { length: 16 }).notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index('assistant_messages_user_created_idx').on(table.userId, table.createdAt),
  })
);
