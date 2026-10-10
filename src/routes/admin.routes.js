/**
 * Admin routes — mounted at /api/v1/admin.
 *
 * Auth routes (login / mfa / refresh / logout) are public but rate-limited
 * at the app.js level. Everything else sits behind requireAdmin, which
 * validates the admin-audience JWT and re-checks role/ban status in the DB.
 *
 * Every mutating route writes an admin_audit_log row (via its controller's
 * transaction). There are deliberately NO update/delete routes for the
 * audit log itself — it is append-only.
 */
import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  adminReadRateLimiter,
  adminMutationRateLimiter,
} from '../middleware/rateLimiter.middleware.js';

import * as auth from '../controllers/admin/admin.auth.controller.js';
import * as usersCtl from '../controllers/admin/admin.users.controller.js';
import * as reportsCtl from '../controllers/admin/admin.reports.controller.js';
import * as auditCtl from '../controllers/admin/admin.audit.controller.js';
import * as statsCtl from '../controllers/admin/admin.stats.controller.js';

import * as S from '../utils/validators/admin.schemas.js';

const router = Router();

// ── Auth (public; per-IP+account throttling applied in app.js) ─────────
router.post('/auth/login', validate(S.adminLoginSchema), auth.adminLogin);
router.post('/auth/mfa/verify', validate(S.adminMfaVerifySchema), auth.adminMfaVerify);
router.post('/auth/refresh', validate(S.adminRefreshSchema), auth.adminRefresh);
router.post('/auth/logout', validate(S.adminRefreshSchema), auth.adminLogout);

// ── Everything below requires a valid admin session ────────────────────
router.use(requireAdmin);

// Users
router.get('/users', adminReadRateLimiter, validate(S.adminUserListQuery, 'query'), usersCtl.listUsers);
router.get('/users/:id', adminReadRateLimiter, validate(S.adminUserIdParam, 'params'), usersCtl.getUserDetail);
router.post('/users/:id/ban', adminMutationRateLimiter, validate(S.adminUserIdParam, 'params'), validate(S.adminBanBody), usersCtl.banUserById);
router.post('/users/:id/unban', adminMutationRateLimiter, validate(S.adminUserIdParam, 'params'), usersCtl.unbanUserById);
router.patch('/users/:id/verify', adminMutationRateLimiter, validate(S.adminUserIdParam, 'params'), validate(S.adminVerifyBody), usersCtl.verifyUser);
router.delete('/users/:id', adminMutationRateLimiter, validate(S.adminUserIdParam, 'params'), usersCtl.softDeleteUserById);

// Reports
router.get('/reports', adminReadRateLimiter, validate(S.adminReportListQuery, 'query'), reportsCtl.listReports);
router.get('/reports/:id', adminReadRateLimiter, validate(S.adminReportIdParam, 'params'), reportsCtl.getReportDetail);
router.patch('/reports/:id', adminMutationRateLimiter, validate(S.adminReportIdParam, 'params'), validate(S.adminReportPatchBody), reportsCtl.patchReport);
router.post('/reports/:id/action', adminMutationRateLimiter, validate(S.adminReportIdParam, 'params'), validate(S.adminReportActionBody), reportsCtl.actionReport);
// Conversation reads are audit-logged inside the controller
router.get('/reports/:id/conversation', adminReadRateLimiter, validate(S.adminReportIdParam, 'params'), validate(S.adminConversationQuery, 'query'), reportsCtl.getReportConversation);

// Audit log (read-only, append-only at the API level)
router.get('/audit-log', adminReadRateLimiter, validate(S.adminAuditListQuery, 'query'), auditCtl.listAuditLog);

// Stats
router.get('/stats/overview', adminReadRateLimiter, statsCtl.getOverview);
router.get('/stats/signups', adminReadRateLimiter, validate(S.adminStatsQuery, 'query'), statsCtl.getSignupTimeSeries);
router.get('/stats/matches', adminReadRateLimiter, validate(S.adminStatsQuery, 'query'), statsCtl.getMatchTimeSeries);

export default router;
