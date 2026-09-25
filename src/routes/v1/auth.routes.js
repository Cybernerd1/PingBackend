import { Router } from 'express';
import {
  signup,
  verifySignupOtp,
  resendSignupOtp,
  login,
  verifyLoginOtp,
  resendLoginOtp,
  googleCallback,
  appleCallback,
  refreshToken,
  logout,
} from '../../controllers/v1/auth.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

const router = Router();

// ── Signup flow ────────────────────────────────────────────────────────

/**
 * @swagger
 * /v1/auth/signup:
 *   post:
 *     summary: Register a new user and send OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, preferred_challenge]
 *             properties:
 *               username:
 *                 type: string
 *                 example: riya@gmail.com
 *               preferred_challenge:
 *                 type: string
 *                 enum: [EMAIL_OTP, SMS_OTP]
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/signup', signup);

/**
 * @swagger
 * /v1/auth/verify-otp:
 *   post:
 *     summary: Verify signup OTP and authenticate user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, otp, challenge_name, session]
 *             properties:
 *               username:
 *                 type: string
 *               otp:
 *                 type: string
 *               challenge_name:
 *                 type: string
 *                 enum: [EMAIL_OTP, SMS_OTP]
 *               session:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified, tokens issued
 *       401:
 *         description: Invalid OTP
 */
router.post('/verify-otp', verifySignupOtp);

/**
 * @swagger
 * /v1/auth/resend-otp:
 *   post:
 *     summary: Resend signup confirmation code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP resent
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/resend-otp', resendSignupOtp);

// ── Login flow ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /v1/auth/login:
 *   post:
 *     summary: Initiate passwordless login (sends OTP)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, preferred_challenge]
 *             properties:
 *               username:
 *                 type: string
 *               preferred_challenge:
 *                 type: string
 *                 enum: [EMAIL_OTP, SMS_OTP]
 *     responses:
 *       200:
 *         description: OTP sent
 *       404:
 *         description: User not found
 */
router.post('/login', login);

/**
 * @swagger
 * /v1/auth/login/verify-otp:
 *   post:
 *     summary: Verify login OTP and get JWT tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, otp, challenge_name, session]
 *             properties:
 *               username:
 *                 type: string
 *               otp:
 *                 type: string
 *               challenge_name:
 *                 type: string
 *               session:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, tokens issued
 *       401:
 *         description: Invalid OTP
 */
router.post('/login/verify-otp', verifyLoginOtp);

/**
 * @swagger
 * /v1/auth/login/resend-otp:
 *   post:
 *     summary: Resend login OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, session]
 *             properties:
 *               username:
 *                 type: string
 *               session:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP resent
 */
router.post('/login/resend-otp', resendLoginOtp);

// ── OAuth ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /v1/auth/google/callback:
 *   post:
 *     summary: Google OAuth token exchange
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_token]
 *             properties:
 *               id_token:
 *                 type: string
 *                 description: Google-issued ID token
 *     responses:
 *       200:
 *         description: Authenticated with Google
 *       401:
 *         description: Invalid token
 */
router.post('/google/callback', googleCallback);

/**
 * @swagger
 * /v1/auth/apple/callback:
 *   post:
 *     summary: Apple OAuth token exchange
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identity_token]
 *             properties:
 *               identity_token:
 *                 type: string
 *                 description: Apple-issued identity token
 *     responses:
 *       200:
 *         description: Authenticated with Apple
 *       401:
 *         description: Invalid token
 */
router.post('/apple/callback', appleCallback);

// ── Token management ───────────────────────────────────────────────────

/**
 * @swagger
 * /v1/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh-token', refreshToken);

/**
 * @swagger
 * /v1/auth/logout:
 *   post:
 *     summary: Logout user
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

export default router;
