import { Router } from 'express';
import passport from '../config/passport.js';
import {
  register,
  login,
  googleCallback,
  refreshAccessToken,
  logout,
  getMe,
  verifyFirebaseToken,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import {
  validateRegister,
  validateLogin,
  validateRefreshToken,
} from '../middleware/validators/auth.validators.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', validateRegister, register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', validateLogin, login);

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Initiate Google OAuth flow
 *     tags: [Auth]
 *     description: Redirects the user to Google's OAuth consent page.
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Auth]
 *     description: >
 *       Google redirects here after authentication.
 *       On success, redirects to the mobile deep link with tokens in query params.
 *     responses:
 *       302:
 *         description: Redirect to mobile deep link
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google/failure' }),
  googleCallback
);

router.get('/google/failure', (req, res) => {
  res.status(401).json({ success: false, message: 'Google authentication failed' });
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', validateRefreshToken, refreshAccessToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout (invalidates refresh token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', protect, logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data with photos
 *       401:
 *         description: Unauthorized
 */
router.get('/me', protect, getMe);

/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: Verify Firebase ID token from native Google Sign-In (React Native)
 *     tags: [Auth]
 *     description: >
 *       Called by the mobile app after the user completes native Google Sign-In
 *       via @react-native-google-signin/google-signin + Firebase Auth.
 *       Verifies the Firebase ID token, finds-or-creates the user, and returns JWT tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firebaseIdToken]
 *             properties:
 *               firebaseIdToken:
 *                 type: string
 *                 description: Firebase ID token from userCredential.user.getIdToken()
 *               deviceId:
 *                 type: string
 *                 description: Stable device identifier for analytics/session tracking
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing or invalid token
 *       401:
 *         description: Token verification failed (expired, wrong project, tampered)
 */
router.post('/verify', verifyFirebaseToken);

export default router;
