/**
 * Admin users controller
 *
 * GET    /api/v1/admin/users           — search, filter, sort, page (limit ≤ 100)
 * GET    /api/v1/admin/users/:id       — profile, photos, report counts, ban history
 * POST   /api/v1/admin/users/:id/ban   — idempotent, body { reason }
 * POST   /api/v1/admin/users/:id/unban — idempotent
 * PATCH  /api/v1/admin/users/:id/verify— body { verified }
 * DELETE /api/v1/admin/users/:id       — soft delete (purge job handles hard delete)
 */
import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { eq } from 'drizzle-orm';
import { adminRepository } from '../../db/repositories/admin.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import { writeAuditLog } from '../../middleware/auditLog.middleware.js';
import { banUser, unbanUser, softDeleteUser } from '../../services/admin.action.service.js';
import * as R from '../../utils/response.js';

// ── GET /admin/users ───────────────────────────────────────────────────
export const listUsers = async (req, res, next) => {
  try {
    const { search, filter, page, limit, sort } = req.query;
    const { users: rows, total } = await adminRepository.listUsers({
      search,
      filter,
      page,
      limit,
      sort,
    });
    return R.success(res, { users: rows, total, page, limit }, 'Users fetched');
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/users/:id ───────────────────────────────────────────────
export const getUserDetail = async (req, res, next) => {
  try {
    const user = await adminRepository.getUserDetail(req.params.id);
    if (!user) return R.notFound(res, 'User not found');
    return R.success(res, { user }, 'User detail fetched');
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/users/:id/ban ──────────────────────────────────────────
export const banUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const target = await userRepository.findById(id);
    if (!target) return R.notFound(res, 'User not found');
    if (target.role === 'admin')
      return R.forbidden(res, 'Admin accounts cannot be banned from this endpoint');
    if (target.isDemo)
      return R.forbidden(res, 'The shared demo account cannot be banned');

    const { alreadyBanned } = await banUser({
      userId: id,
      reason,
      adminId: req.adminId,
      ip: req.ip,
    });

    return R.success(
      res,
      { user_id: id, banned: true, already_banned: alreadyBanned },
      alreadyBanned ? 'User was already banned' : 'User banned — sessions revoked'
    );
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/users/:id/unban ────────────────────────────────────────
export const unbanUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const target = await userRepository.findById(id);
    if (!target) return R.notFound(res, 'User not found');

    const { wasBanned } = await unbanUser({
      userId: id,
      adminId: req.adminId,
      ip: req.ip,
    });

    return R.success(
      res,
      { user_id: id, banned: false, was_banned: wasBanned },
      wasBanned ? 'User unbanned' : 'User was not banned'
    );
  } catch (err) {
    next(err);
  }
};

// ── PATCH /admin/users/:id/verify ──────────────────────────────────────
export const verifyUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    const target = await userRepository.findById(id);
    if (!target) return R.notFound(res, 'User not found');
    if (target.isDemo)
      return R.forbidden(res, 'The shared demo account cannot be modified');

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(users)
        .set({ isVerified: verified, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id, isVerified: users.isVerified });

      await writeAuditLog(tx, {
        adminId: req.adminId,
        action: verified ? 'verify_user' : 'unverify_user',
        targetType: 'user',
        targetId: id,
        metadata: { verified },
        ip: req.ip,
      });

      return updated;
    });

    return R.success(
      res,
      { user_id: id, is_verified: result.isVerified },
      verified ? 'User verified' : 'User verification removed'
    );
  } catch (err) {
    next(err);
  }
};

// ── DELETE /admin/users/:id — soft delete; purge job hard-deletes later ─
export const softDeleteUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason ?? null;

    const result = await softDeleteUser({
      userId: id,
      reason,
      adminId: req.adminId,
      ip: req.ip,
    });

    if (result.notFound) return R.notFound(res, 'User not found');
    if (result.forbidden)
      return R.forbidden(res, 'Admin and demo accounts cannot be deleted from this endpoint');

    return R.success(
      res,
      { user_id: id, deleted: true },
      'User soft-deleted — hard purge follows the retention window'
    );
  } catch (err) {
    next(err);
  }
};
