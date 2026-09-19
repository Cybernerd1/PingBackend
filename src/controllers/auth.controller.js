import { validationResult } from 'express-validator';
import { userRepository } from '../db/repositories/user.repository.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.utils.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sendTokens = async (res, user, statusCode = 200, extra = {}) => {
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  await userRepository.updateRefreshToken(user.id, refreshToken);

  res.status(statusCode).json({
    success: true,
    data: { accessToken, refreshToken, user, ...extra },
  });
};

// ─── Register ─────────────────────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { name, email, password } = req.body;

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const user = await userRepository.create({ name, email, password });
    await sendTokens(res, user, 201);
  } catch (error) {
    next(error);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { email, password } = req.body;

    // Fetch with sensitive fields so we can compare password
    const user = await userRepository.findByEmail(email, { withSensitive: true });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google sign-in. Please log in with Google.',
      });
    }

    const isMatch = await userRepository.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Strip sensitive fields before sending
    const { password: _, refreshToken: __, ...safeUser } = user;
    await sendTokens(res, safeUser);
  } catch (error) {
    next(error);
  }
};

// ─── Google OAuth Callback ────────────────────────────────────────────────────
export const googleCallback = async (req, res) => {
  try {
    const result = req.user;

    if (result.error) {
      const params = new URLSearchParams({
        error: result.error,
        message: result.message,
      });
      return res.redirect(`${process.env.MOBILE_DEEP_LINK}?${params}`);
    }

    const { user, isNewUser } = result;

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await userRepository.updateRefreshToken(user.id, refreshToken);

    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      isNewUser: String(isNewUser),
      onboardingCompleted: String(user.onboardingCompleted),
      onboardingStep: user.onboardingStep,
    });

    res.redirect(`${process.env.MOBILE_DEEP_LINK}?${params}`);
  } catch (error) {
    const params = new URLSearchParams({ error: 'server_error' });
    res.redirect(`${process.env.MOBILE_DEEP_LINK}?${params}`);
  }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────
export const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const storedToken = await userRepository.getRefreshToken(decoded.userId);
    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);

    await userRepository.updateRefreshToken(decoded.userId, newRefreshToken);

    res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    await userRepository.updateRefreshToken(req.user.id, null);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── Get Me ───────────────────────────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id, { withPhotos: true });
    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};