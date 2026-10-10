/**
 * requireAdmin middleware
 *
 * Validates the admin-audience JWT (separate signing secret),
 * then re-checks role === 'admin' AND not banned/deleted from the DB.
 * Never trusts JWT claims alone for role — always hits the DB.
 */
import { verifyAdminAccessToken } from '../utils/jwt.utils.js';
import { userRepository } from '../db/repositories/user.repository.js';
import * as R from '../utils/response.js';

export const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return R.unauthorized(res, 'Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyAdminAccessToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Admin session expired — please log in again'
          : 'Invalid admin token';
      return R.unauthorized(res, message);
    }

    // Re-verify from DB — catches demotions, bans, deletions that happened
    // after the token was issued (the token cannot be relied on for this).
    const user = await userRepository.findById(decoded.userId);

    if (!user)                return R.unauthorized(res, 'Admin account not found');
    if (user.isBanned)        return R.forbidden(res, 'Admin account is suspended');
    if (user.isAccountDeleted || user.isDeleted)
                              return R.unauthorized(res, 'Admin account has been deleted');
    if (user.role !== 'admin')
                              return R.forbidden(res, 'Admin access only');

    req.user = user;
    req.adminId = user.id;   // convenience alias used by auditLog helper
    next();
  } catch (err) {
    next(err);
  }
};
