/**
 * Request ID middleware.
 * Attaches a unique request ID to every request for log correlation.
 * Uses the X-Request-ID header if the client/proxy sends one,
 * otherwise generates a new UUID.
 */

import { randomUUID } from 'crypto';

export const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};
