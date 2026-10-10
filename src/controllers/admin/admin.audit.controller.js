/**
 * Admin audit-log controller
 *
 * GET /api/v1/admin/audit-log — filter by admin / target / action / date range.
 * The log itself is append-only: there are intentionally no POST/PATCH/DELETE
 * routes for it anywhere in the API.
 */
import { adminRepository } from '../../db/repositories/admin.repository.js';
import * as R from '../../utils/response.js';

export const listAuditLog = async (req, res, next) => {
  try {
    const {
      admin_id: adminId,
      target_type: targetType,
      target_id: targetId,
      action,
      from,
      to,
      page,
      limit,
    } = req.query;

    const { entries, total } = await adminRepository.listAuditLog({
      adminId,
      targetType,
      targetId,
      action,
      from,
      to,
      page,
      limit,
    });

    return R.success(res, { entries, total, page, limit }, 'Audit log fetched');
  } catch (err) {
    next(err);
  }
};
