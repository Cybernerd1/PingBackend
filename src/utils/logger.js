/**
 * Structured logger using pino.
 *
 * Usage:
 *   import logger from '../utils/logger.js';
 *   logger.info({ userId, action: 'login' }, 'User logged in');
 *   logger.error({ err }, 'Database error');
 *
 * In development: pretty-prints with colors.
 * In production: outputs JSON lines (log aggregators parse these).
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    // Redact sensitive fields from all log lines
    redact: {
      paths: [
        'req.headers.authorization',
        'body.password',
        'body.refresh_token',
        'body.id_token',
        'body.identity_token',
        '*.password',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    base: {
      env: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,env,version',
        },
      })
    : undefined // production: raw JSON to stdout
);

export default logger;
