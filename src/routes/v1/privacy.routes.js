import { Router } from 'express';
import {
  createPrivacySettings,
  getPrivacySettings,
  updatePrivacySettings,
} from '../../controllers/v1/privacy.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * /v1/users/privacy/settings:
 *   post:
 *     summary: Create privacy settings
 *     tags: [Privacy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               show_distance:
 *                 type: boolean
 *               show_age:
 *                 type: boolean
 *               show_online_status:
 *                 type: boolean
 *               profile_visible_in_discover:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Privacy settings created
 *       409:
 *         description: Settings already exist — use PUT
 */
router.post('/settings', createPrivacySettings);

/**
 * @swagger
 * /v1/users/privacy/settings:
 *   get:
 *     summary: Get privacy settings
 *     tags: [Privacy]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Privacy settings fetched
 *       404:
 *         description: Settings not found
 */
router.get('/settings', getPrivacySettings);

/**
 * @swagger
 * /v1/users/privacy/settings:
 *   put:
 *     summary: Update privacy settings
 *     tags: [Privacy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               show_distance:
 *                 type: boolean
 *               show_age:
 *                 type: boolean
 *               show_online_status:
 *                 type: boolean
 *               profile_visible_in_discover:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Privacy settings updated
 */
router.put('/settings', updatePrivacySettings);

export default router;
