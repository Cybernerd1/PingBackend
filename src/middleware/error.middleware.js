/**
 * Spec-compliant error handling middleware.
 *
 * Error envelope: { status: "error", code: "...", message: "..." }
 * Never leaks stack traces to clients in production.
 * Server errors are logged via Pino with request correlation ID.
 */

import logger from '../utils/logger.js';

// ── 404 catcher ────────────────────────────────────────────────────────
export const notFound = (req, res, next) => {
  const err = new Error(`${req.method} ${req.originalUrl} — endpoint not found`);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  next(err);
};

// ── Central error handler ──────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  // Map HTTP status to spec error code
  let code = err.code || 'INTERNAL_ERROR';
  if (statusCode === 400 && !err.code) code = 'VALIDATION_ERROR';
  if (statusCode === 401 && !err.code) code = 'UNAUTHORIZED';
  if (statusCode === 403 && !err.code) code = 'FORBIDDEN';
  if (statusCode === 404 && !err.code) code = 'NOT_FOUND';
  if (statusCode === 409 && !err.code) code = 'CONFLICT';
  if (statusCode === 429 && !err.code) code = 'RATE_LIMIT_EXCEEDED';

  const body = {
    status: 'error',
    code,
    message:
      statusCode >= 500
        ? 'Internal server error'
        : err.message || 'An error occurred',
  };

  // Include field-level details for validation errors (Zod)
  if (err.details) body.details = err.details;

  // Log server errors via Pino (never sent to client)
  if (statusCode >= 500) {
    logger.error(
      {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode,
        err,
      },
      'Internal server error'
    );
  } else if (statusCode >= 400) {
    logger.warn(
      {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode,
        code,
      },
      err.message
    );
  }

  res.status(statusCode).json(body);
};
