import { userRepository } from '../db/repositories/user.repository.js';
import { verifyAccessToken } from '../utils/jwt.utils.js';
import * as R from '../utils/response.js';

// ── Throttled last_active_at update ────────────────────────────────────
// Write at most once every 5 minutes per user to avoid hammering the DB.
// The in-process cache is sufficient for a single-instance server.
// For multi-instance setups, replace with Redis.
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000; // 5 min
const lastActiveSeen = new Map(); // userId → Date.now()

function shouldUpdateLastActive(userId) {
  const last = lastActiveSeen.get(userId);
  if (!last || Date.now() - last > LAST_ACTIVE_THROTTLE_MS) {
    lastActiveSeen.set(userId, Date.now());
    return true;
  }
  return false;
}

// ── Main protect middleware ─────────────────────────────────────────────
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return R.unauthorized(res, 'Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Access token has expired — use /auth/refresh-token'
          : 'Invalid access token';
      return R.unauthorized(res, message);
    }

    const user = await userRepository.findById(decoded.userId);

    if (!user) return R.unauthorized(res, 'User no longer exists');
    if (user.isAccountDeleted)
      return R.unauthorized(res, 'This account has been deleted');
    if (user.isDeleted)
      return R.unauthorized(res, 'This account has been deleted');
    // Ban check: reject banned users immediately (DB-driven, not JWT-claim-driven)
    if (user.isBanned)
      return R.forbidden(res, 'Your account has been suspended');

    req.user = user;

    // Fire-and-forget lastActiveAt update — never blocks the request
    if (shouldUpdateLastActive(user.id)) {
      userRepository.update(user.id, { lastActiveAt: new Date() }).catch(() => {});
    }

    next();
  } catch (error) {
    next(error);
  }
};

// ── Role-based guard (for use after protect) ────────────────────────────
export const authorize = (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return R.forbidden(res, 'You do not have permission to perform this action');
    }
    next();
  };