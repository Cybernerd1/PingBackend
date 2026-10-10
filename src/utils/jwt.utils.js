import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'fallback_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
// Admin tokens use a completely separate signing secret so a regular app token
// can never be accepted on an admin route even if the payload is crafted.
const ADMIN_ACCESS_SECRET  = process.env.JWT_ADMIN_ACCESS_SECRET  || 'fallback_admin_access_secret';
const ADMIN_REFRESH_SECRET = process.env.JWT_ADMIN_REFRESH_SECRET || 'fallback_admin_refresh_secret';

const ACCESS_EXPIRES_IN         = process.env.JWT_ACCESS_EXPIRES_IN         || '15m';
const REFRESH_EXPIRES_IN        = process.env.JWT_REFRESH_EXPIRES_IN        || '7d';
// Shorter admin session: 30-min access token, 8-hour refresh
const ADMIN_ACCESS_EXPIRES_IN   = process.env.JWT_ADMIN_ACCESS_EXPIRES_IN   || '30m';
const ADMIN_REFRESH_EXPIRES_IN  = process.env.JWT_ADMIN_REFRESH_EXPIRES_IN  || '8h';

// ── Regular app tokens ──────────────────────────────────────────────────

export const generateAccessToken = (userId) =>
  jwt.sign({ userId, aud: 'app' }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

export const generateRefreshToken = (userId) =>
  jwt.sign({ userId, aud: 'app' }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

export const verifyAccessToken = (token) =>
  jwt.verify(token, ACCESS_SECRET, { audience: 'app' });

export const verifyRefreshToken = (token) =>
  jwt.verify(token, REFRESH_SECRET, { audience: 'app' });

// ── Admin tokens (separate secret + audience) ───────────────────────────

export const generateAdminAccessToken = (userId) =>
  jwt.sign({ userId, aud: 'admin', role: 'admin' }, ADMIN_ACCESS_SECRET, {
    expiresIn: ADMIN_ACCESS_EXPIRES_IN,
  });

export const generateAdminRefreshToken = (userId) =>
  jwt.sign({ userId, aud: 'admin' }, ADMIN_REFRESH_SECRET, {
    expiresIn: ADMIN_REFRESH_EXPIRES_IN,
  });

export const verifyAdminAccessToken = (token) =>
  jwt.verify(token, ADMIN_ACCESS_SECRET, { audience: 'admin' });

// Pending-MFA token: issued after the password step, valid 5 minutes, only
// accepted by POST /admin/auth/mfa/verify — carries no session by itself.
const ADMIN_MFA_PENDING_EXPIRES_IN = process.env.JWT_ADMIN_MFA_PENDING_EXPIRES_IN || '5m';

export const generateAdminMfaPendingToken = (userId) =>
  jwt.sign({ userId, aud: 'admin-mfa' }, ADMIN_ACCESS_SECRET, {
    expiresIn: ADMIN_MFA_PENDING_EXPIRES_IN,
  });

export const verifyAdminMfaPendingToken = (token) =>
  jwt.verify(token, ADMIN_ACCESS_SECRET, { audience: 'admin-mfa' });

export const verifyAdminRefreshToken = (token) =>
  jwt.verify(token, ADMIN_REFRESH_SECRET, { audience: 'admin' });

// ── Refresh token hashing ───────────────────────────────────────────────

/** SHA-256 hash of the raw token — what we store in refresh_tokens table. */
export const hashToken = (raw) =>
  crypto.createHash('sha256').update(raw).digest('hex');
