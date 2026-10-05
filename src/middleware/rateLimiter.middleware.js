/**
 * Per-endpoint rate limiters using express-rate-limit.
 *
 * All limiters return the spec-compliant error envelope:
 *   { status: "error", code: "RATE_LIMIT_EXCEEDED", message: "..." }
 *
 * Limits:
 *   auth        → 10 requests / 15 min  (prevent OTP brute-force)
 *   discover    → 30 requests / 1 min   (swipe deck throttle)
 *   interaction → 100 requests / 1 min  (swipe action throttle)
 *   upload      → 20 requests / 1 min   (media upload)
 *   default     → 100 requests / 15 min (everything else)
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { verifyAccessToken } from '../utils/jwt.utils.js';

/**
 * Bucket by signed-in user when a valid access token is present, otherwise by IP.
 * Mobile carriers / campus Wi-Fi put many users behind one IP, so IP-only keys
 * would make users throttle each other.
 */
export const userOrIpKey = (req) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const { userId } = verifyAccessToken(auth.slice(7));
      if (userId) return `u:${userId}`;
    } catch {
      // fall through to IP
    }
  }
  return `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`;
};

const rateLimitError = {
  status: 'error',
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many requests — please wait before trying again',
};

const makeRateLimiter = (windowMs, max, message = rateLimitError) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json(options.message);
    },
    keyGenerator: userOrIpKey,
  });

// 600 requests per 15 minutes per user (or IP) — fallback for every /api route
export const globalRateLimiter = makeRateLimiter(15 * 60 * 1000, 600, {
  ...rateLimitError,
  message: 'Too many requests',
});

// 10 requests per 15 minutes — OTP endpoints (signup, login, resend)
export const authRateLimiter = makeRateLimiter(15 * 60 * 1000, 10, {
  ...rateLimitError,
  message: 'Too many auth attempts — please wait 15 minutes before trying again',
});

// 60 requests per 15 minutes — Google/Apple exchange, refresh-token, logout
export const tokenRateLimiter = makeRateLimiter(15 * 60 * 1000, 60, {
  ...rateLimitError,
  message: 'Too many sign-in attempts — please wait a few minutes and try again',
});

// 30 requests per minute — discover stack
export const discoverRateLimiter = makeRateLimiter(60 * 1000, 30, {
  ...rateLimitError,
  message: 'Discover rate limit exceeded — slow down your requests',
});

// 100 swipe actions per minute
export const interactionRateLimiter = makeRateLimiter(60 * 1000, 100, {
  ...rateLimitError,
  message: 'Swipe rate limit exceeded',
});

// 20 media uploads per minute
export const uploadRateLimiter = makeRateLimiter(60 * 1000, 20, {
  ...rateLimitError,
  message: 'Upload rate limit exceeded — please wait before uploading again',
});

// 5 report actions per hour (prevent spam reports)
export const reportRateLimiter = makeRateLimiter(60 * 60 * 1000, 5, {
  ...rateLimitError,
  message: 'Report rate limit exceeded — you can report up to 5 users per hour',
});

// 20 assistant messages per minute (each one may call OpenRouter)
export const assistantRateLimiter = makeRateLimiter(60 * 1000, 20, {
  ...rateLimitError,
  message: 'You’re messaging Ping Assistant too fast — wait a moment and try again',
});
