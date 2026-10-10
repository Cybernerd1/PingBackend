/**
 * Admin reports controller
 *
 * GET   /api/v1/admin/reports                    — filter by status/reason, page
 * GET   /api/v1/admin/reports/:id                — reporter, reported, prior reports
 * PATCH /api/v1/admin/reports/:id                — { status?, admin_note? }
 * POST  /api/v1/admin/reports/:id/action         — ban reported user + close report
 *                                                 in ONE transaction
 * GET   /api/v1/admin/reports/:id/conversation   — only the reported conversation,
 *                                                 cursor-paginated, audit-logged
 */
import { db } from '../../config/database.js';
import { reports } from '../../db/schema/reports.js';
import { users } from '../../db/schema/users.js';
import { conversations } from '../../db/schema/conversations.js';
import { eq, and } from 'drizzle-orm';
import { adminRepository } from '../../db/repositories/admin.repository.js';
import { writeAuditLog } from '../../middleware/auditLog.middleware.js';
import { disconnectUser } from '../../socket/index.js';
import * as R from '../../utils/response.js';

// ── GET /admin/reports ─────────────────────────────────────────────────
export const listReports = async (req, res, next) => {
  try {
    const { status, reason, page, limit } = req.query;
    const { reports: rows, total } = await adminRepository.listReports({
      status,
      reason,
      page,
      limit,
    });
    return R.success(res, { reports: rows, total, page, limit }, 'Reports fetched');
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/reports/:id ─────────────────────────────────────────────
export const getReportDetail = async (req, res, next) => {
  try {
    const report = await adminRepository.getReportDetail(req.params.id);
    if (!report) return R.notFound(res, 'Report not found');
    return R.success(res, { report }, 'Report fetched');
  } catch (err) {
    next(err);
  }
};

// ── PATCH /admin/reports/:id — review / dismiss without banning ────────
export const patchReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_note: adminNote } = req.body;

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: reports.id })
        .from(reports)
        .where(eq(reports.id, id))
        .limit(1);
      if (!existing) return { notFound: true };

      const [updated] = await tx.update(reports)
        .set({
          ...(status ? { status } : {}),
          ...(adminNote !== undefined ? { adminNote } : {}),
          reviewedBy: req.adminId,
          reviewedAt: new Date(),
        })
        .where(eq(reports.id, id))
        .returning();

      await writeAuditLog(tx, {
        adminId: req.adminId,
        action: 'update_report_status',
        targetType: 'report',
        targetId: id,
        metadata: {
          ...(status ? { status } : {}),
          ...(adminNote !== undefined ? { admin_note: adminNote } : {}),
        },
        ip: req.ip,
      });

      return { report: updated };
    });

    if (result.notFound) return R.notFound(res, 'Report not found');
    return R.success(res, { report: result.report }, 'Report updated');
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/reports/:id/action — ban reported user + close report ──
// Single transaction: ban state change, session revocation, report close,
// and the audit row. Idempotent on an already-actioned report.
export const actionReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminNote = req.body?.admin_note ?? null;

    const result = await db.transaction(async (tx) => {
      const [report] = await tx.select()
        .from(reports)
        .where(eq(reports.id, id))
        .limit(1);
      if (!report) return { notFound: true };

      // Never ban an admin or demo account via report action
      const [reportedUser] = await tx.select({ role: users.role, isDemo: users.isDemo })
        .from(users)
        .where(eq(users.id, report.reportedId))
        .limit(1);

      let bannedNow = false;
      let forbidden = false;

      if (!reportedUser || reportedUser.role === 'admin' || reportedUser.isDemo) {
        forbidden = true;
      } else {
        // Conditional update → idempotent when the user is already banned
        const banRes = await tx.update(users)
          .set({
            isBanned: true,
            bannedAt: new Date(),
            bannedReason: `Report ${report.id} (${report.reason})`,
          })
          .where(and(eq(users.id, report.reportedId), eq(users.isBanned, false)))
          .returning({ id: users.id });

        bannedNow = banRes.length > 0;
        if (bannedNow) {
          await adminRepository.revokeAllRefreshTokens(tx, report.reportedId);
          await adminRepository.clearLegacyRefreshToken(tx, report.reportedId);
        }
      }

      const [updated] = await tx.update(reports)
        .set({
          status: 'actioned',
          reviewedBy: req.adminId,
          reviewedAt: new Date(),
          ...(adminNote !== null ? { adminNote } : {}),
        })
        .where(eq(reports.id, id))
        .returning();

      await writeAuditLog(tx, {
        adminId: req.adminId,
        action: 'action_report',
        targetType: 'report',
        targetId: id,
        metadata: {
          reported_user_id: report.reportedId,
          banned: bannedNow,
          reason: report.reason,
          ...(forbidden ? { note: 'target protected — report closed without ban' } : {}),
        },
        ip: req.ip,
      });

      return { report: updated, banned: bannedNow, forbidden, reportedId: report.reportedId };
    });

    if (result.notFound) return R.notFound(res, 'Report not found');

    // Post-commit side effects (best-effort, outside the transaction)
    if (result.banned) {
      await adminRepository.deleteDeviceTokens(result.reportedId).catch(() => {});
      disconnectUser(result.reportedId);
    }

    return R.success(
      res,
      {
        report: result.report,
        reported_user_id: result.reportedId,
        banned: result.banned,
      },
      result.forbidden
        ? 'Report actioned — target is protected and was not banned'
        : 'Report actioned — reported user banned and sessions revoked'
    );
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/reports/:id/conversation — audit-logged read ────────────
// Every read of a conversation is itself written to the audit log.
export const getReportConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { cursor, limit } = req.query;

    const [report] = await db.select({
      id: reports.id,
      reportedId: reports.reportedId,
      reporterId: reports.reporterId,
      conversationId: reports.conversationId,
    })
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);

    if (!report) return R.notFound(res, 'Report not found');
    if (!report.conversationId)
      return R.error(res, 404, 'NO_CONVERSATION', 'This report has no linked conversation');

    // Guard: the conversation must belong to the reported (or reporter) —
    // an admin can only open the conversation this report is about.
    const [conversation] = await db.select({
      id: conversations.id,
      user1Id: conversations.user1Id,
      user2Id: conversations.user2Id,
    })
      .from(conversations)
      .where(eq(conversations.id, report.conversationId))
      .limit(1);

    if (!conversation)
      return R.error(res, 404, 'NO_CONVERSATION', 'Linked conversation no longer exists');

    const participant =
      conversation.user1Id === report.reportedId ||
      conversation.user2Id === report.reportedId ||
      conversation.user1Id === report.reporterId ||
      conversation.user2Id === report.reporterId;

    if (!participant)
      return R.forbidden(res, 'Linked conversation does not belong to this report');

    // Audit the read BEFORE returning content
    await writeAuditLog(db, {
      adminId: req.adminId,
      action: 'view_conversation',
      targetType: 'report',
      targetId: id,
      metadata: { conversation_id: report.conversationId },
      ip: req.ip,
    });

    const data = await adminRepository.getConversationMessages(report.conversationId, {
      cursor,
      limit: limit ? Number(limit) : 50,
    });

    return R.success(
      res,
      {
        report_id: id,
        conversation_id: report.conversationId,
        participants: {
          reporter_id: report.reporterId,
          reported_id: report.reportedId,
        },
        ...data,
      },
      'Conversation fetched (read recorded in audit log)'
    );
  } catch (err) {
    next(err);
  }
};
