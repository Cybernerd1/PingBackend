import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Append-only admin audit log.
 * Every mutating admin action writes a row here — no UPDATE or DELETE ever.
 * The composite index on (admin_id, created_at) covers "what did admin X do?"
 * and (target_type, target_id, created_at) covers "what happened to user Y?"
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // The admin who performed the action
    adminId: uuid('admin_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Human-readable action name, e.g. 'ban_user', 'update_report_status'
    action: varchar('action', { length: 100 }).notNull(),

    // What kind of entity was targeted ('user' | 'report' | 'conversation')
    targetType: varchar('target_type', { length: 50 }).notNull(),

    // UUID of the target entity
    targetId: uuid('target_id').notNull(),

    // Arbitrary context: reason, old/new values, etc.
    metadata: jsonb('metadata').default({}),

    // Client IP for security review
    ip: varchar('ip', { length: 45 }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    // "What did admin X do, sorted by time?"
    adminCreatedIdx: index('audit_admin_created_idx').on(table.adminId, table.createdAt),
    // "What happened to target Y?"
    targetIdx: index('audit_target_idx').on(table.targetType, table.targetId, table.createdAt),
  })
);
