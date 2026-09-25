import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import passport from './config/passport.js';
import { swaggerSpec } from './config/swagger.js';
import { requestId } from './middleware/requestId.middleware.js';
import {
  authRateLimiter,
  discoverRateLimiter,
  interactionRateLimiter,
  uploadRateLimiter,
  reportRateLimiter,
} from './middleware/rateLimiter.middleware.js';

// ── Phase 1 routes ─────────────────────────────────────────────────────
import v1AuthRoutes from './routes/v1/auth.routes.js';
import v1ProfileRoutes from './routes/v1/profile.routes.js';
import { interestsCatalogueRouter, userInterestsRouter } from './routes/v1/interests.routes.js';
import v1PhotosRoutes from './routes/v1/photos.routes.js';
import v1PreferencesRoutes from './routes/v1/preferences.routes.js';
import v1PrivacyRoutes from './routes/v1/privacy.routes.js';
import v1LocationRoutes from './routes/v1/location.routes.js';

// ── Phase 2 routes ─────────────────────────────────────────────────────
import v1DiscoverRoutes from './routes/v1/discover.routes.js';
import v1InteractionsRoutes from './routes/v1/interactions.routes.js';

// ── Phase 3 routes ─────────────────────────────────────────────────────
import v1MatchesRoutes from './routes/v1/matches.routes.js';
import v1ChatRoutes from './routes/v1/chat.routes.js';

// ── Phase 4 routes ─────────────────────────────────────────────────────
import v1SafetyRoutes from './routes/v1/safety.routes.js';
import v1AccountRoutes from './routes/v1/account.routes.js';

// ── Legacy routes (deprecated, backward-compat only) ──────────────────
import legacyAuthRoutes from './routes/auth.routes.js';
import legacyOnboardingRoutes from './routes/onboarding.routes.js';
import legacyChatRoutes from './routes/chat.routes.js';
import legacyDiscoveryRoutes from './routes/discovery.routes.js';
import legacyProfileRoutes from './routes/profile.routes.js';

import { errorHandler, notFound } from './middleware/error.middleware.js';

const app = express();

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
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
});
app.use('/api', globalLimiter);

// ─── Body parsers ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

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

// ─── v1 API Routes ────────────────────────────────────────────────────

// Phase 1
app.use('/api/v1/auth', authRateLimiter, v1AuthRoutes);
app.use('/api/v1/users/profile', v1ProfileRoutes);
app.use('/api/v1/interests', interestsCatalogueRouter);
app.use('/api/v1/users/interests', userInterestsRouter);
app.use('/api/v1/users/photos', uploadRateLimiter, v1PhotosRoutes);
app.use('/api/v1/users/preferences', v1PreferencesRoutes);
app.use('/api/v1/users/privacy', v1PrivacyRoutes);
app.use('/api/v1/users/location', v1LocationRoutes);

// Phase 2
app.use('/api/v1/discover', discoverRateLimiter, v1DiscoverRoutes);
app.use('/api/v1/interactions', interactionRateLimiter, v1InteractionsRoutes);

// Phase 3
app.use('/api/v1/matches', v1MatchesRoutes);
app.use('/api/v1/chats', v1ChatRoutes);

// Phase 4 — Safety & Account
// IMPORTANT: /api/v1/users/blocked and /api/v1/users/account must come BEFORE
// the dynamic /api/v1/users/:userId routes to avoid being swallowed by the param
app.use('/api/v1/users', v1AccountRoutes);      // DELETE /api/v1/users/account
app.use('/api/v1/users', reportRateLimiter, v1SafetyRoutes); // POST /api/v1/users/:id/report etc.

// ─── Legacy Routes ────────────────────────────────────────────────────
app.use('/api/auth', legacyAuthRoutes);
app.use('/api/onboarding', legacyOnboardingRoutes);
app.use('/api/chat', legacyChatRoutes);
app.use('/api/discovery', legacyDiscoveryRoutes);
app.use('/api/profile', legacyProfileRoutes);

// ─── Error Handling ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;