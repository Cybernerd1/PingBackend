/**
 * auditLog helper
 *
 * Wraps a controller function so every successful mutating admin action
 * automatically writes a row to admin_audit_log.
 *
 * Usage:
 *   router.post('/users/:id/ban', auditLog('ban_user', 'user', (req) => req.params.id), banUser);
 *
 * Or inline inside a controller (for transactional audit writes):
 *   await writeAuditLog(tx, { adminId, action, targetType, targetId, metadata, ip });
 */
import { db } from '../config/database.js';
import { adminAuditLog } from '../db/schema/admin_audit_log.js';

/**
 * Write a single audit row. Pass `tx` (a Drizzle transaction) to write
 * atomically with the action, or `db` for a standalone write.
 */
export const writeAuditLog = async (
  dbOrTx,
  { adminId, action, targetType, targetId, metadata = {}, ip = null }
) => {
  await dbOrTx.insert(adminAuditLog).values({
    adminId,
    action,
    targetType,
    targetId,
    metadata,
    ip,
  });
};

/**
 * Express middleware factory.
 * Call this BEFORE the real controller in the route chain.
 * It sets req._audit so the controller can call writeAuditLog(db, req._audit).
 *
 * @param {string} action      - e.g. 'ban_user'
 * @param {string} targetType  - e.g. 'user'
 * @param {Function} getTargetId - receives (req) and returns the target UUID
 */
export const auditLog = (action, targetType, getTargetId) =>
  (req, _res, next) => {
    req._audit = {
      adminId: req.adminId,
      action,
      targetType,
      targetId: getTargetId(req),
      ip: req.ip,
    };
    next();
  };
