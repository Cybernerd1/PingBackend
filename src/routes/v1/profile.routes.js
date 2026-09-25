import { Router } from 'express';
import {
  createProfile,
  getMyProfile,
  updateProfile,
  deleteProfile,
  verifyLoginInfo,
  getPublicProfile,
  exportProfile,
} from '../../controllers/v1/profile.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

const router = Router();

// All profile routes require authentication
router.use(protect);

/**
 * @swagger
 * /v1/users/profile:
 *   post:
 *     summary: Create user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, birthdate, gender]
 *             properties:
 *               full_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               birthdate:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female, non-binary, other, prefer_not_to_say]
 *               bio:
 *                 type: string
 *                 maxLength: 300
 *     responses:
 *       200:
 *         description: Profile created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Profile already exists
 */
router.post('/', createProfile);

/**
 * @swagger
 * /v1/users/profile:
 *   get:
 *     summary: Fetch authenticated user's own profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *       404:
 *         description: Profile not found
 */
router.get('/', getMyProfile);

/**
 * @swagger
 * /v1/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               bio:
 *                 type: string
 *               gender:
 *                 type: string
 *               birthdate:
 *                 type: string
 *                 format: date
 *               email:
 *                 type: string
 *                 description: "Sensitive — triggers OTP verification"
 *               phone:
 *                 type: string
 *                 description: "Sensitive — triggers OTP verification"
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Validation error
 */
router.put('/', updateProfile);

/**
 * @swagger
 * /v1/users/profile:
 *   delete:
 *     summary: Soft-delete dating profile (keeps account/auth)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile deleted
 */
router.delete('/', deleteProfile);

/**
 * @swagger
 * /v1/users/profile/export:
 *   get:
 *     summary: Export user data (GDPR)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Export URL generated
 */
router.get('/export', exportProfile);

/**
 * @swagger
 * /v1/users/profile/verify-login-info:
 *   post:
 *     summary: Verify updated email/phone via OTP
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp, session]
 *             properties:
 *               otp:
 *                 type: string
 *               session:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login info verified and updated
 */
router.post('/verify-login-info', verifyLoginInfo);

/**
 * @swagger
 * /v1/users/profile/{user_id}:
 *   get:
 *     summary: Fetch another user's public profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public profile (no email/phone)
 *       403:
 *         description: Forbidden (blocked or not matched)
 *       404:
 *         description: User not found
 */
router.get('/:user_id', getPublicProfile);

export default router;
