/**
 * Admin auth controller
 *
 * POST /api/v1/admin/auth/login       — email + password
 * POST /api/v1/admin/auth/mfa/verify  — TOTP or recovery code (when MFA enabled)
 * POST /api/v1/admin/auth/refresh     — rotate admin refresh token
 * POST /api/v1/admin/auth/logout      — revoke admin refresh token
 *
 * Security model:
 *  - Access tokens: separate signing secret (JWT_ADMIN_ACCESS_SECRET) +
 *    aud: "admin". A regular app token can never pass requireAdmin.
 *  - Refresh tokens: SHA-256 hashed in refresh_tokens (audience 'admin'),
 *    rotated on every refresh, revoked on logout / ban.
 *  - MFA: when admin_credentials.mfa_enabled, the password step returns a
 *    5-minute aud:"admin-mfa" pending token and NO session. The session is
 *    only issued after the TOTP (or a single-use recovery code) verifies.
 *  - Lockout: 5 failed attempts (password OR mfa step) → 15 min lock.
 *  - Login rate limit: 5/min per IP AND per account (see rateLimiter + app.js).
 */
import bcrypt from 'bcryptjs';
import { userRepository } from '../../db/repositories/user.repository.js';
import { adminRepository } from '../../db/repositories/admin.repository.js';
import { writeAuditLog } from '../../middleware/auditLog.middleware.js';
import {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  generateAdminMfaPendingToken,
  verifyAdminMfaPendingToken,
  verifyAdminRefreshToken,
  hashToken,
} from '../../utils/jwt.utils.js';
import { decryptSecret, verifyTotp } from '../../utils/totp.utils.js';
import * as R from '../../utils/response.js';
import { db } from '../../config/database.js';

const ADMIN_REFRESH_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MFA_PENDING_TTL_S = 5 * 60;                // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Valid-format bcrypt hash computed once per process — used when the email
// doesn't exist so the timing of a failed login never reveals that.
const TIMING_PAD_HASH = bcrypt.hashSync('timing-pad-constant', 12);

const issueAdminSession = async (user, req) => {
  const accessToken = generateAdminAccessToken(user.id);
  const rawRefresh = generateAdminRefreshToken(user.id);

  await adminRepository.createRefreshToken({
    tokenHash: hashToken(rawRefresh),
    userId: user.id,
    audience: 'admin',
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip,
    expiresAt: new Date(Date.now() + ADMIN_REFRESH_TTL_MS),
  });

  return {
    access_token: accessToken,
    refresh_token: rawRefresh,
    expires_in: 1800, // 30 min access token
  };
};

const lockedResponse = (res, lockedUntil) => {
  const retryAt = new Date(lockedUntil).toISOString();
  return R.error(
    res,
    429,
    'ACCOUNT_LOCKED',
    `Account locked after too many failed attempts — retry after ${retryAt}`
  );
};

// ── POST /api/v1/admin/auth/login — step 1: email + password ───────────
export const adminLogin = async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password)
      return R.validationError(res, 'email and password are required');

    const user = await userRepository.findByEmail(email, { withSensitive: true });
    const credentials = user ? await adminRepository.findCredentials(user.id) : null;

    // Lockout check BEFORE the expensive bcrypt compare
    if (credentials?.lockedUntil && new Date(credentials.lockedUntil) > new Date()) {
      return lockedResponse(res, credentials.lockedUntil);
    }

    // Timing-safe: always run bcrypt even if the user doesn't exist
    const ok = await bcrypt.compare(password, user?.password ?? TIMING_PAD_HASH);

    if (!user || !ok || user.role !== 'admin') {
      // Only lock real admin accounts. Ensure a credentials row exists so
      // the failure counter works even for bootstrap admins created
      // before MFA setup.
      if (user && user.role === 'admin') {
        // Ensure a credentials row exists so the failure counter works
        // even for bootstrap admins created before MFA setup
        if (!credentials) await adminRepository.upsertCredentials(user.id, {});
        const failure = await adminRepository.registerLoginFailure(user.id, {
          maxAttempts: MAX_FAILED_ATTEMPTS,
          lockMinutes: LOCKOUT_MINUTES,
        });
        if (failure?.locked_until && new Date(failure.locked_until) > new Date()) {
          return lockedResponse(res, failure.locked_until);
        }
      }
      return R.unauthorized(res, 'Invalid credentials');
    }

    if (user.isBanned || user.isAccountDeleted || user.isDeleted)
      return R.forbidden(res, 'This admin account is not available');

    // MFA enabled → password step only. Session comes after /mfa/verify.
    if (credentials?.mfaEnabled) {
      return R.success(
        res,
        {
          mfa_required: true,
          mfa_token: generateAdminMfaPendingToken(user.id),
          expires_in: MFA_PENDING_TTL_S,
        },
        'Password accepted — provide the 6-digit code from your authenticator'
      );
    }

    // No MFA (bootstrap / disabled) → issue session directly
    if (credentials) await adminRepository.resetLoginFailures(user.id);
    const session = await issueAdminSession(user, req);
    return R.success(res, session, 'Admin login successful');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/admin/auth/mfa/verify — step 2: TOTP / recovery code ──
export const adminMfaVerify = async (req, res, next) => {
  try {
    const { mfa_token: mfaToken, code } = req.body ?? {};
    if (!mfaToken || typeof code !== 'string')
      return R.validationError(res, 'mfa_token and code are required');

    let userId;
    try {
      userId = verifyAdminMfaPendingToken(mfaToken).userId;
    } catch {
      return R.unauthorized(res, 'MFA request expired — log in again');
    }

    const user = await userRepository.findById(userId, { withSensitive: true });
    const credentials = await adminRepository.findCredentials(userId);

    if (!user || user.role !== 'admin')
      return R.unauthorized(res, 'Invalid MFA request');

    if (user.isBanned || user.isAccountDeleted || user.isDeleted)
      return R.forbidden(res, 'This admin account is not available');

    if (credentials?.lockedUntil && new Date(credentials.lockedUntil) > new Date()) {
      return lockedResponse(res, credentials.lockedUntil);
    }

    if (!credentials?.mfaEnabled || !credentials.mfaSecretEncrypted)
      return R.error(res, 400, 'MFA_NOT_ENABLED', 'MFA is not enabled for this account');

    // ── TOTP first ─────────────────────────────────────────────────────
    const secret = decryptSecret(credentials.mfaSecretEncrypted);
    const verified = secret ? verifyTotp(secret, code) : false;

    if (verified) {
      await adminRepository.resetLoginFailures(userId);
      const session = await issueAdminSession(user, req);
      await writeAuditLog(db, {
        adminId: user.id,
        action: 'admin_login',
        targetType: 'user',
        targetId: user.id,
        metadata: { method: 'totp' },
        ip: req.ip,
      });
      return R.success(res, session, 'Admin login successful');
    }

    // ── Then single-use recovery codes (bcrypt over stored hashes) ─────
    const hashes = Array.isArray(credentials.recoveryCodes) ? credentials.recoveryCodes : [];
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(code.trim().toUpperCase(), hashes[i])) {
        const remaining = hashes.filter((_, j) => j !== i);
        await adminRepository.upsertCredentials(userId, { recoveryCodes: remaining });
        await adminRepository.resetLoginFailures(userId);
        const session = await issueAdminSession(user, req);
        await writeAuditLog(db, {
          adminId: user.id,
          action: 'admin_login',
          targetType: 'user',
          targetId: user.id,
          metadata: { method: 'recovery_code', recovery_codes_remaining: remaining.length },
          ip: req.ip,
        });
        return R.success(
          res,
          { ...session, recovery_codes_remaining: remaining.length },
          'Admin login successful (recovery code used — it is now invalid)'
        );
      }
    }

    // ── Failed verification — counts toward lockout ────────────────────
    const failure = await adminRepository.registerLoginFailure(userId, {
      maxAttempts: MAX_FAILED_ATTEMPTS,
      lockMinutes: LOCKOUT_MINUTES,
    });
    if (failure?.locked_until && new Date(failure.locked_until) > new Date()) {
      return lockedResponse(res, failure.locked_until);
    }
    return R.unauthorized(res, 'Invalid verification code');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/admin/auth/refresh ───────────────────────────────────
export const adminRefresh = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return R.unauthorized(res, 'refresh_token is required');

    let decoded;
    try {
      decoded = verifyAdminRefreshToken(refresh_token);
    } catch {
      return R.unauthorized(res, 'Invalid or expired admin refresh token');
    }

    const tokenHash = hashToken(refresh_token);
    const stored = await adminRepository.findRefreshToken(tokenHash);

    if (!stored || stored.revokedAt || new Date(stored.expiresAt) < new Date())
      return R.unauthorized(res, 'Refresh token is invalid, expired, or revoked');

    // Re-verify the user is still an active admin (DB, not claims)
    const user = await userRepository.findById(decoded.userId);
    if (!user || user.role !== 'admin' || user.isBanned || user.isAccountDeleted || user.isDeleted)
      return R.forbidden(res, 'Admin account is not available');

    // Rotate: revoke old, issue new
    await adminRepository.revokeRefreshToken(tokenHash);
    const session = await issueAdminSession(user, req);

    return R.success(res, session, 'Admin token refreshed');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/admin/auth/logout ────────────────────────────────────
export const adminLogout = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      await adminRepository.revokeRefreshToken(hashToken(refresh_token));
    }
    return R.success(res, {}, 'Admin logged out successfully');
  } catch (err) {
    next(err);
  }
};
