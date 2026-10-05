import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import { requestId } from './middleware/requestId.middleware.js';
import {
  authRateLimiter,
  tokenRateLimiter,
  globalRateLimiter,
  discoverRateLimiter,
  interactionRateLimiter,
  uploadRateLimiter,
  reportRateLimiter,
} from './middleware/rateLimiter.middleware.js';

// ── Routes ─────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import { interestsCatalogueRouter, userInterestsRouter } from './routes/interests.routes.js';
import photosRoutes from './routes/photos.routes.js';
import preferencesRoutes from './routes/preferences.routes.js';
import privacyRoutes from './routes/privacy.routes.js';
import locationRoutes from './routes/location.routes.js';
import devicesRoutes from './routes/devices.routes.js';

import discoverRoutes from './routes/discover.routes.js';
import interactionsRoutes from './routes/interactions.routes.js';

import matchesRoutes from './routes/matches.routes.js';
import chatRoutes from './routes/chat.routes.js';
import assistantRoutes from './routes/assistant.routes.js';

import safetyRoutes from './routes/safety.routes.js';
import accountRoutes from './routes/account.routes.js';

import { errorHandler, notFound } from './middleware/error.middleware.js';

const app = express();

// Render / any reverse proxy: trust the first hop so req.ip is the client's IP.
// Without this every user shares one rate-limit bucket (the proxy's IP).
app.set('trust proxy', 1);

// ─── Security ──────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
}));

// ─── Request ID (log correlation) ─────────────────────────────────────
app.use(requestId);

// ─── Global rate limit (fallback) ─────────────────────────────────────
// Keyed per signed-in user (falls back to IP) — see rateLimiter.middleware.js
app.use('/api', globalRateLimiter);

// ─── Body parsers ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─── HTTP logging (dev only — Pino used for structured logging) ───────
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ─── Root & Health ────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Ping API is running',
    version: '1.0.0',
    docs: '/api/docs',
    health: '/api/v1/health',
  });
});

/**
 * @swagger
 * /v1/health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/api/v1/health', (_req, res) =>
  res.status(200).json({
    status: 'ok',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
);

// ─── Swagger Docs ─────────────────────────────────────────────────────
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Ping API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: { persistAuthorization: true },
  })
);

app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ─── API Routes (/api/v1) ─────────────────────────────────────────────

// Auth, profile & onboarding
// Strict limit only on OTP endpoints; OAuth exchange / refresh / logout get a looser one.
app.use(
  ['/api/v1/auth/signup', '/api/v1/auth/verify-otp', '/api/v1/auth/resend-otp', '/api/v1/auth/login'],
  authRateLimiter
);
app.use('/api/v1/auth', tokenRateLimiter, authRoutes);
app.use('/api/v1/users/profile', profileRoutes);
app.use('/api/v1/interests', interestsCatalogueRouter);
app.use('/api/v1/users/interests', userInterestsRouter);
app.use('/api/v1/users/photos', uploadRateLimiter, photosRoutes);
app.use('/api/v1/users/preferences', preferencesRoutes);
app.use('/api/v1/users/privacy', privacyRoutes);
app.use('/api/v1/users/location', locationRoutes);
app.use('/api/v1/users/devices', devicesRoutes);

// Discover & swipes
app.use('/api/v1/discover', discoverRateLimiter, discoverRoutes);
app.use('/api/v1/interactions', interactionRateLimiter, interactionsRoutes);

// Matches & chat
app.use('/api/v1/matches', matchesRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/assistant', assistantRoutes);

// Safety & account
// IMPORTANT: /api/v1/users/blocked and /api/v1/users/account must come BEFORE
// the dynamic /api/v1/users/:userId routes to avoid being swallowed by the param
app.use('/api/v1/users', accountRoutes);      // DELETE /api/v1/users/account
app.post('/api/v1/users/:userId/report', reportRateLimiter); // only reports are throttled hard
app.use('/api/v1/users', safetyRoutes); // report / block / unblock / blocked

// ─── Error Handling ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;