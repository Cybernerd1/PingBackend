/**
 * Admin repository
 * All DB queries used exclusively by admin controllers.
 * Stats exclude isDemo and isDummy on every query.
 */
import { db } from '../../config/database.js';
import { sql, eq, and, or, ilike, count, desc, asc, lt, gte, inArray } from 'drizzle-orm';
import { users } from '../schema/users.js';
import { matches } from '../schema/matches.js';
import { reports } from '../schema/reports.js';
import { messages } from '../schema/messages.js';
import { conversations } from '../schema/conversations.js';
import { photos } from '../schema/photos.js';
import { adminAuditLog } from '../schema/admin_audit_log.js';
import { refreshTokens } from '../schema/refresh_tokens.js';
import { adminCredentials } from '../schema/admin_credentials.js';

// IST offset for day bucketing: UTC+5:30
const IST_OFFSET = "'+05:30'";

// Every stats query excludes demo logins + seeded dummy profiles.
const realUser = and(eq(users.isDemo, false), eq(users.isDummy, false));

// ── Stats ───────────────────────────────────────────────────────────────

export const adminRepository = {

  async getOverviewStats() {
    const [totalRes, activeRes, matchRes, msgRes, reportRows] = await Promise.all([
      // Total real users (not demo, not dummy, not hard-deleted)
      db.select({ n: count() }).from(users)
        .where(and(
          realUser,
          eq(users.isAccountDeleted, false),
        )),

      // Active in last 7 days (using lastActiveAt)
      db.select({ n: count() }).from(users)
        .where(and(
          realUser,
          eq(users.isAccountDeleted, false),
          gte(users.lastActiveAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        )),

      // Total matches between two real users (both sides filtered)
      db.execute(sql`
        SELECT count(*)::int AS n
        FROM matches m
        JOIN users a ON a.id = m.user_a_id AND a.is_demo = false AND a.is_dummy = false
        JOIN users b ON b.id = m.user_b_id AND b.is_demo = false AND b.is_dummy = false
      `),

      // Total messages sent by real users
      db.execute(sql`
        SELECT count(*)::int AS n
        FROM messages msg
        JOIN users s ON s.id = msg.sender_id AND s.is_demo = false AND s.is_dummy = false
      `),

      // Reports grouped by status
      db.select({
        status: reports.status,
        n: count(),
      }).from(reports).groupBy(reports.status),
    ]);

    const reportsByStatus = Object.fromEntries(reportRows.map(r => [r.status, Number(r.n)]));

    return {
      total_users:    Number(totalRes[0].n),
      active_7d:      Number(activeRes[0].n),
      total_matches:  Number(matchRes.rows[0].n),
      total_messages: Number(msgRes.rows[0].n),
      reports:        reportsByStatus,
    };
  },

  /** Daily signup counts for the last `days` days, bucketed in IST. */
  async getSignupTimeSeries(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT
        date_trunc('day', created_at AT TIME ZONE ${sql.raw(IST_OFFSET)}) AS day,
        count(*)::int AS n
      FROM users
      WHERE is_demo = false
        AND is_dummy = false
        AND created_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `);
    return rows.rows.map(r => ({ day: r.day, count: r.n }));
  },

  /** Daily match counts for the last `days` days, bucketed in IST (both sides real). */
  async getMatchTimeSeries(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT
        date_trunc('day', m.created_at AT TIME ZONE ${sql.raw(IST_OFFSET)}) AS day,
        count(*)::int AS n
      FROM matches m
      JOIN users ua ON ua.id = m.user_a_id AND ua.is_dummy = false AND ua.is_demo = false
      JOIN users ub ON ub.id = m.user_b_id AND ub.is_dummy = false AND ub.is_demo = false
      WHERE m.created_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `);
    return rows.rows.map(r => ({ day: r.day, count: r.n }));
  },

  // ── Users ─────────────────────────────────────────────────────────────

  /**
   * Paginated user list with optional search and filter.
   * Returns { users, total }.
   */
  async listUsers({ search, filter, page = 1, limit = 20, sort = 'created_at' }) {
    limit = Math.min(limit, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(users.isDummy, false),
    ];

    if (search) {
      conditions.push(
        or(
          ilike(users.fullName, `%${search}%`),
          ilike(users.email, `%${search}%`),
          ilike(users.username, `%${search}%`),
        )
      );
    }

    switch (filter) {
      case 'banned':      conditions.push(eq(users.isBanned, true)); break;
      case 'verified':    conditions.push(eq(users.isVerified, true)); break;
      case 'deleted':     conditions.push(eq(users.isAccountDeleted, true)); break;
      case 'demo':        conditions.push(eq(users.isDemo, true)); break;
      case 'admin':       conditions.push(eq(users.role, 'admin')); break;
      case 'incomplete':  conditions.push(eq(users.onboardingCompleted, false)); break;
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const orderBy = sort === 'last_active'
      ? desc(users.lastActiveAt)
      : desc(users.createdAt);

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        username: users.username,
        gender: users.gender,
        role: users.role,
        isVerified: users.isVerified,
        isBanned: users.isBanned,
        isDeleted: users.isDeleted,
        isAccountDeleted: users.isAccountDeleted,
        isDemo: users.isDemo,
        onboardingCompleted: users.onboardingCompleted,
        onboardingStep: users.onboardingStep,
        lastActiveAt: users.lastActiveAt,
        bannedAt: users.bannedAt,
        bannedReason: users.bannedReason,
        createdAt: users.createdAt,
      })
        .from(users)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),

      db.select({ total: count() }).from(users).where(where),
    ]);

    return { users: rows, total: Number(total) };
  },

  /** Full admin view of a single user — includes photos + report counts. */
  async getUserDetail(userId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return null;

    const [userPhotos, [{ reportCount }], [{ reportedCount }], banHistory] = await Promise.all([
      db.select({ id: photos.id, url: photos.url, order: photos.order })
        .from(photos)
        .where(eq(photos.userId, userId))
        .orderBy(photos.order),

      db.select({ reportCount: count() }).from(reports)
        .where(eq(reports.reporterId, userId)),

      db.select({ reportedCount: count() }).from(reports)
        .where(eq(reports.reportedId, userId)),

      // Ban lifecycle for this user, straight from the append-only audit log
      db.select({
        action: adminAuditLog.action,
        metadata: adminAuditLog.metadata,
        adminId: adminAuditLog.adminId,
        createdAt: adminAuditLog.createdAt,
      })
        .from(adminAuditLog)
        .where(and(
          eq(adminAuditLog.targetType, 'user'),
          eq(adminAuditLog.targetId, userId),
          inArray(adminAuditLog.action, ['ban_user', 'unban_user', 'soft_delete_user']),
        ))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(20),
    ]);

    const { password, refreshToken, ...safe } = user;
    return {
      ...safe,
      photos: userPhotos,
      reports_filed: Number(reportCount),
      times_reported: Number(reportedCount),
      ban_history: banHistory,
    };
  },

  // ── Reports ───────────────────────────────────────────────────────────

  async listReports({ status, reason, page = 1, limit = 20 }) {
    limit = Math.min(limit, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(eq(reports.status, status));
    if (reason) conditions.push(eq(reports.reason, reason));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id: reports.id,
        reason: reports.reason,
        details: reports.details,
        status: reports.status,
        adminNote: reports.adminNote,
        messageId: reports.messageId,
        conversationId: reports.conversationId,
        createdAt: reports.createdAt,
        reviewedAt: reports.reviewedAt,
        reporter: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
        .from(reports)
        .leftJoin(users, eq(reports.reporterId, users.id))
        .where(where)
        .orderBy(desc(reports.createdAt))
        .limit(limit)
        .offset(offset),

      db.select({ total: count() }).from(reports).where(where),
    ]);

    return { reports: rows, total: Number(total) };
  },

  async getReportDetail(reportId) {
    // Use raw SQL to join reporter + reported profiles in one go
    const rows = await db.execute(sql`
      SELECT
        r.*,
        reporter.id          AS reporter_id,
        reporter.full_name   AS reporter_name,
        reporter.email       AS reporter_email,
        reported.id          AS reported_id,
        reported.full_name   AS reported_name,
        reported.email       AS reported_email,
        reported.is_banned   AS reported_is_banned,
        (SELECT count(*) FROM reports x WHERE x.reported_id = r.reported_id)::int AS prior_reports
      FROM reports r
      JOIN users reporter ON reporter.id = r.reporter_id
      JOIN users reported ON reported.id = r.reported_id
      WHERE r.id = ${reportId}
      LIMIT 1
    `);
    return rows.rows[0] ?? null;
  },

  async updateReport(reportId, { status, adminNote, reviewedBy }) {
    const [updated] = await db
      .update(reports)
      .set({
        status,
        adminNote: adminNote ?? null,
        reviewedBy,
        reviewedAt: new Date(),
      })
      .where(eq(reports.id, reportId))
      .returning();
    return updated;
  },

  // ── Conversations (admin read-only) ───────────────────────────────────

  async listConversations({ userId, status, page = 1, limit = 20 }) {
    limit = Math.min(limit, 50);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status)  conditions.push(eq(conversations.statusCode, status));
    if (userId)  conditions.push(or(
      eq(conversations.user1Id, userId),
      eq(conversations.user2Id, userId),
    ));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select()
        .from(conversations)
        .where(where)
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(conversations).where(where),
    ]);

    return { conversations: rows, total: Number(total) };
  },

  async getConversationMessages(conversationId, { cursor, limit = 50 }) {
    limit = Math.min(limit, 100);
    const conditions = [eq(messages.conversationId, conversationId)];
    if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1); // +1 to detect hasMore

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      messages: items.reverse(), // chronological for display
      hasMore,
      nextCursor: hasMore ? items[0].createdAt.toISOString() : null,
    };
  },

  // ── Matches ───────────────────────────────────────────────────────────

  async listMatches({ page = 1, limit = 20 }) {
    limit = Math.min(limit, 100);
    const offset = (page - 1) * limit;

    const [rows, [{ total }]] = await Promise.all([
      db.select()
        .from(matches)
        .orderBy(desc(matches.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(matches),
    ]);

    return { matches: rows, total: Number(total) };
  },

  async getSwipeStats() {
    const rows = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE direction = 'like')    ::int AS total_likes,
        count(*) FILTER (WHERE direction = 'dislike') ::int AS total_dislikes,
        count(*) ::int                                       AS total_swipes
      FROM swipes
    `);
    const { total_likes, total_dislikes, total_swipes } = rows.rows[0];
    const totalMatches = await db.select({ n: count() }).from(matches);
    return {
      total_swipes,
      total_likes,
      total_dislikes,
      total_matches: Number(totalMatches[0].n),
      match_rate: total_likes > 0
        ? ((Number(totalMatches[0].n) * 2) / total_likes * 100).toFixed(1) + '%'
        : '0%',
    };
  },

  // ── Audit log ─────────────────────────────────────────────────────────

  async listAuditLog({ adminId, targetType, targetId, action, from, to, page = 1, limit = 50 }) {
    limit = Math.min(limit, 200);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (adminId)    conditions.push(eq(adminAuditLog.adminId, adminId));
    if (targetType) conditions.push(eq(adminAuditLog.targetType, targetType));
    if (targetId)   conditions.push(eq(adminAuditLog.targetId, targetId));
    if (action)     conditions.push(eq(adminAuditLog.action, action));
    if (from)       conditions.push(gte(adminAuditLog.createdAt, new Date(from)));
    if (to)         conditions.push(lt(adminAuditLog.createdAt, new Date(to)));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select()
        .from(adminAuditLog)
        .where(where)
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(adminAuditLog).where(where),
    ]);

    return { entries: rows, total: Number(total) };
  },

  // ── Refresh tokens ────────────────────────────────────────────────────

  async createRefreshToken({ tokenHash, userId, audience, userAgent, ip, expiresAt }) {
    const [row] = await db.insert(refreshTokens)
      .values({ tokenHash, userId, audience, userAgent, ip, expiresAt })
      .returning();
    return row;
  },

  async findRefreshToken(tokenHash) {
    const [row] = await db.select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },

  async revokeRefreshToken(tokenHash) {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  },

  /** Revoke all admin refresh tokens for a user (used on ban). */
  async revokeAllAdminTokens(userId) {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.audience, 'admin'),
        )
      );
  },

  /** Revoke every live refresh token for a user — both audiences (used on ban). */
  async revokeAllRefreshTokens(dbOrTx, userId) {
    await (dbOrTx ?? db).update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(refreshTokens.userId, userId),
        sql`${refreshTokens.revokedAt} IS NULL`,
      ));
  },

  /** Clear the legacy single-session refresh_token column (pre-refresh_tokens flow). */
  async clearLegacyRefreshToken(dbOrTx, userId) {
    await (dbOrTx ?? db).update(users)
      .set({ refreshToken: null })
      .where(eq(users.id, userId));
  },

  /**
   * Deregister all FCM device tokens of a user.
   * The device_tokens table is created ad-hoc by push.service (raw SQL),
   * so this is raw too — and must tolerate the table not existing yet.
   */
  async deleteDeviceTokens(userId) {
    try {
      await db.execute(sql`DELETE FROM device_tokens WHERE user_id = ${userId}`);
    } catch (err) {
      if (!/relation "device_tokens" does not exist/i.test(err.message)) throw err;
    }
  },

  // ── Admin credentials (MFA + lockout) ─────────────────────────────────

  async findCredentials(userId) {
    const [row] = await db.select()
      .from(adminCredentials)
      .where(eq(adminCredentials.userId, userId))
      .limit(1);
    return row ?? null;
  },

  /** Insert-or-update credentials row for an admin. */
  async upsertCredentials(userId, fields) {
    const [row] = await db.insert(adminCredentials)
      .values({ userId, ...fields })
      .onConflictDoUpdate({
        target: adminCredentials.userId,
        set: { ...fields, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  /**
   * Atomically count a failed login. Reaches the lockout threshold → sets
   * locked_until = now() + lockMinutes. Returns the post-update row.
   */
  async registerLoginFailure(userId, { maxAttempts = 5, lockMinutes = 15 } = {}) {
    const res = await db.execute(sql`
      UPDATE admin_credentials
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= ${maxAttempts}
            THEN now() + (${lockMinutes} * interval '1 minute')
            ELSE locked_until
          END,
          updated_at = now()
      WHERE user_id = ${userId}
      RETURNING failed_login_attempts, locked_until
    `);
    return res.rows[0] ?? null;
  },

  async resetLoginFailures(userId) {
    await db.update(adminCredentials)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(adminCredentials.userId, userId));
  },

  // ── Purge (scheduled hard-delete of soft-deleted accounts) ────────────

  /**
   * Hard-deletes accounts soft-deleted more than `retentionDays` ago.
   * Admins are never purged (audit log references them ON DELETE RESTRICT —
   * and admin audit history must survive anyway).
   * Returns the ids removed.
   */
  async purgeDeletedUsers(retentionDays = 30) {
    const res = await db.execute(sql`
      DELETE FROM users
      WHERE is_account_deleted = true
        AND role = 'user'
        AND COALESCE(deleted_at, updated_at) < now() - (${retentionDays} * interval '1 day')
      RETURNING id
    `);
    return res.rows.map(r => r.id);
  },

  /** Delete refresh tokens that expired more than `graceDays` ago. */
  async purgeExpiredRefreshTokens(graceDays = 7) {
    const res = await db.execute(sql`
      DELETE FROM refresh_tokens
      WHERE expires_at < now() - (${graceDays} * interval '1 day')
      RETURNING id
    `);
    return res.rows.length;
  },
};
