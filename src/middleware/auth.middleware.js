import { userRepository } from '../db/repositories/user.repository.js';
import { verifyAccessToken } from '../utils/jwt.utils.js';
import * as R from '../utils/response.js';

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
    if (user.isDeleted || user.isAccountDeleted)
      return R.unauthorized(res, 'This account has been deleted');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return R.forbidden(res, 'You do not have permission to perform this action');
    }
    next();
  };