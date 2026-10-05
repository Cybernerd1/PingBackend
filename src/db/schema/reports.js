import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

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

// ── Reports Table ──────────────────────────────────────────────────────
// One report per user-pair (reporter → reported). Unique constraint
// prevents the same user reporting the same person twice.
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

    // Optional free-text elaboration
    details: text('details'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    uniqueReport: unique('unique_report').on(table.reporterId, table.reportedId),
  })
);
