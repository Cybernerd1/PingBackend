import { Router } from 'express';
import {
  savePreferences,
  getPreferences,
  updatePreferences,
} from '../../controllers/v1/preferences.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * /v1/users/preferences:
 *   post:
 *     summary: Save dating preferences
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [interested_in, min_age, max_age, max_distance_km]
 *             properties:
 *               interested_in:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [male, female, non-binary, everyone]
 *               min_age:
 *                 type: integer
 *                 minimum: 18
 *               max_age:
 *                 type: integer
 *                 maximum: 100
 *               max_distance_km:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Preferences saved
 *       400:
 *         description: Validation error
 *       409:
 *         description: Preferences already exist — use PUT to update
 */
router.post('/', savePreferences);

/**
 * @swagger
 * /v1/users/preferences:
 *   get:
 *     summary: Get dating preferences
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences fetched
 *       404:
 *         description: No preferences set yet
 */
router.get('/', getPreferences);

/**
 * @swagger
 * /v1/users/preferences:
 *   put:
 *     summary: Update dating preferences (partial update)
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               interested_in:
 *                 type: array
 *                 items:
 *                   type: string
 *               min_age:
 *                 type: integer
 *               max_age:
 *                 type: integer
 *               max_distance_km:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Preferences updated
 */
router.put('/', updatePreferences);

export default router;
