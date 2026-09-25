/**
 * Standardised API response envelope as defined in the Ping API spec.
 *
 * Success:  { status: "success", message: "...", data: {} }
 * Error:    { status: "error",   code: "...",    message: "...", details: "..." }
 */

// ── Success helper ─────────────────────────────────────────────────────
export const success = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ status: 'success', message, data });

// ── Error helper ───────────────────────────────────────────────────────
export const error = (res, statusCode, code, message, details = null) => {
  const body = { status: 'error', code, message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
};

// ── Typed error shortcuts (spec error codes) ───────────────────────────
export const validationError = (res, details) =>
  error(res, 400, 'VALIDATION_ERROR', 'Invalid request', details);

export const unauthorized = (res, message = 'Missing, expired, or invalid JWT') =>
  error(res, 401, 'UNAUTHORIZED', message);

export const forbidden = (res, message = 'Action not permitted') =>
  error(res, 403, 'FORBIDDEN', message);

export const notFound = (res, message = 'Resource not found') =>
  error(res, 404, 'NOT_FOUND', message);

export const conflict = (res, message = 'State conflict') =>
  error(res, 409, 'CONFLICT', message);

export const rateLimitExceeded = (res, message = 'Too many requests') =>
  error(res, 429, 'RATE_LIMIT_EXCEEDED', message);

export const internalError = (res, message = 'Internal server error') =>
  error(res, 500, 'INTERNAL_ERROR', message);
