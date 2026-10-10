import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { messages } from './messages.js';
import { conversations } from './conversations.js';

// ── Report reason enum ─────────────────────────────────────────────────
export const reportReasonEnum = pgEnum('report_reason', [
  'spam',
  'inappropriate_content',
  'harassment',
  'fake_profile',
  'underage',
  'hate_speech',
  'other',
]);

// ── Report status enum ─────────────────────────────────────────────────
export const reportStatusEnum = pgEnum('report_status', [
  'pending',
  'reviewed',
  'actioned',
  'dismissed',
]);

// ── Reports Table ──────────────────────────────────────────────────────
export const reports = pgTable(
  'reports',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    reportedId: uuid('reported_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    reason: reportReasonEnum('reason').notNull(),
    details: text('details'),

    // ── Moderation workflow ────────────────────────────────────────────
    status: reportStatusEnum('status').notNull().default('pending'),

    reviewedBy: uuid('reviewed_by')
      .references(() => users.id, { onDelete: 'set null' }),

    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

    adminNote: text('admin_note'),

    // ── Optional evidence links ────────────────────────────────────────
    // Either the specific reported message or the full conversation
    messageId: uuid('message_id')
      .references(() => messages.id, { onDelete: 'set null' }),

    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    uniqueReport: unique('unique_report').on(table.reporterId, table.reportedId),
    // Admin list queries filter by status and sort by date — cover both
    statusCreatedIdx: index('reports_status_created_idx').on(table.status, table.createdAt),
    reportedIdx: index('reports_reported_idx').on(table.reportedId),
  })
);
