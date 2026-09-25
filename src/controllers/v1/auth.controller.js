/**
 * Auth controller — v1
 *
 * Implements the spec's OTP-based passwordless auth (EMAIL_OTP | SMS_OTP)
 * plus Google/Apple OAuth token exchange.
 *
 * OTP flow (signup & login) is backed by Firebase Auth:
 *  - signup  → createUserWithEmailAndPassword OR custom token → sendSignInLinkToEmail
 *  - verify  → verifyIdToken (Firebase Admin)
 *
 * For the MVP the OTP session/challenge is managed on the client side via
 * Firebase client SDK; the server only mints its own JWT pair after
 * verifying the Firebase ID token the client returns post-OTP.
 */

import { userRepository } from '../../db/repositories/user.repository.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.utils.js';
import { verifyFirebaseIdToken } from '../../utils/firebase.utils.js';
import { verifyGoogleIdToken } from '../../utils/google.utils.js';
import * as R from '../../utils/response.js';

// ── Helper: issue tokens & send response ──────────────────────────────
const sendTokens = async (res, user, statusCode = 200, extra = {}) => {
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  await userRepository.updateRefreshToken(user.id, refreshToken);

  return R.success(
    res,
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      ...extra,
    },
    'Authentication successful',
    statusCode
  );
};

// ── Signup: POST /api/v1/auth/signup ─────────────────────────────────
export const signup = async (req, res, next) => {
  try {
    const { username, preferred_challenge } = req.body;

    if (!username) return R.validationError(res, 'username is required');
    if (!['EMAIL_OTP', 'SMS_OTP'].includes(preferred_challenge))
      return R.validationError(res, 'preferred_challenge must be EMAIL_OTP or SMS_OTP');

    const existing = await userRepository.findByEmail(username.toLowerCase());
    if (existing) return R.conflict(res, `An account with ${username} already exists`);

    return R.success(res, {}, `OTP sent to ${username}`);
  } catch (err) {
    next(err);
  }
};

// ── Verify signup OTP: POST /api/v1/auth/verify-otp ──────────────────
export const verifySignupOtp = async (req, res, next) => {
  try {
    const { username, session } = req.body;

    if (!session) return R.validationError(res, 'session (Firebase ID token) is required');

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(session);
    } catch {
      return R.unauthorized(res, 'Invalid or expired OTP session');
    }

    const { uid: googleId, email, name, picture: googleAvatar, email_verified } = decoded;

    let user = await userRepository.findByEmail((email || username).toLowerCase());
    let profileExists = false;

    if (!user) {
      user = await userRepository.create({
        googleId,
        email: email || username,
        fullName: name || null,
        googleAvatar: googleAvatar || null,
        isEmailVerified: email_verified || false,
      });
    } else {
      profileExists = !!user.fullName;
      if (googleId && !user.googleId) {
        user = await userRepository.update(user.id, { googleId, isEmailVerified: true });
      }
    }

    return sendTokens(res, user, 200, { profile_exists: profileExists });
  } catch (err) {
    next(err);
  }
};

// ── Resend signup OTP: POST /api/v1/auth/resend-otp ──────────────────
export const resendSignupOtp = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) return R.validationError(res, 'username is required');
    return R.success(res, {}, 'OTP resent');
  } catch (err) {
    next(err);
  }
};

// ── Login: POST /api/v1/auth/login ────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { username, preferred_challenge } = req.body;

    if (!username) return R.validationError(res, 'username is required');
    if (!['EMAIL_OTP', 'SMS_OTP'].includes(preferred_challenge))
      return R.validationError(res, 'preferred_challenge must be EMAIL_OTP or SMS_OTP');

    const user = await userRepository.findByEmail(username.toLowerCase());
    if (!user) return R.notFound(res, 'No account found with that email/phone');

    return R.success(res, {}, `OTP sent to ${username}`);
  } catch (err) {
    next(err);
  }
};

// ── Verify login OTP: POST /api/v1/auth/login/verify-otp ─────────────
export const verifyLoginOtp = async (req, res, next) => {
  try {
    const { username, session } = req.body;

    if (!session) return R.validationError(res, 'session (Firebase ID token) is required');

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(session);
    } catch {
      return R.unauthorized(res, 'Invalid or expired OTP');
    }

    const { email } = decoded;

    const user = await userRepository.findByEmail((email || username).toLowerCase());
    if (!user) return R.notFound(res, 'No account found');

    return sendTokens(res, user, 200);
  } catch (err) {
    next(err);
  }
};

// ── Resend login OTP: POST /api/v1/auth/login/resend-otp ─────────────
export const resendLoginOtp = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) return R.validationError(res, 'username is required');
    return R.success(res, {}, 'OTP resent');
  } catch (err) {
    next(err);
  }
};

// ── Google OAuth: POST /api/v1/auth/google/callback ──────────────────
export const googleCallback = async (req, res, next) => {
  try {
    const { id_token } = req.body;

    if (!id_token) return R.validationError(res, 'id_token is required');

    let payload;
    try {
      payload = await verifyGoogleIdToken(id_token);
    } catch {
      return R.unauthorized(res, 'Invalid Google ID token');
    }

    const { sub: googleId, email, name, picture: googleAvatar, email_verified } = payload;

    let user = await userRepository.findByGoogleId(googleId);
    let profileExists = false;
    let isNewUser = false;

    if (!user) {
      const byEmail = await userRepository.findByEmail(email.toLowerCase(), { withSensitive: true });
      if (byEmail) {
        user = await userRepository.update(byEmail.id, { googleId, googleAvatar, isEmailVerified: true });
      } else {
        user = await userRepository.create({ googleId, email, fullName: name, googleAvatar, isEmailVerified: email_verified });
        isNewUser = true;
      }
    }

    profileExists = !!user.fullName && !isNewUser;

    return sendTokens(res, user, 200, { profile_exists: profileExists });
  } catch (err) {
    next(err);
  }
};

// ── Apple OAuth: POST /api/v1/auth/apple/callback ────────────────────
export const appleCallback = async (req, res, next) => {
  try {
    const { identity_token } = req.body;
    if (!identity_token) return R.validationError(res, 'identity_token is required');

    // TODO: Implement Apple JWT verification (Phase 5)
    return R.error(res, 501, 'NOT_IMPLEMENTED', 'Apple Sign-In is not yet implemented');
  } catch (err) {
    next(err);
  }
};

// ── Refresh token: POST /api/v1/auth/refresh-token ───────────────────
export const refreshToken = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return R.unauthorized(res, 'refresh_token is required');

    let decoded;
    try {
      decoded = verifyRefreshToken(refresh_token);
    } catch {
      return R.unauthorized(res, 'Invalid or expired refresh token');
    }

    const stored = await userRepository.getRefreshToken(decoded.userId);
    if (!stored || stored !== refresh_token)
      return R.unauthorized(res, 'Refresh token is invalid or has been rotated');

    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    await userRepository.updateRefreshToken(decoded.userId, newRefreshToken);

    return R.success(
      res,
      { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in: 3600 },
      'Token refreshed'
    );
  } catch (err) {
    next(err);
  }
};

// ── Logout: POST /api/v1/auth/logout ─────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    await userRepository.updateRefreshToken(req.user.id, null);
    return R.success(res, {}, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};
