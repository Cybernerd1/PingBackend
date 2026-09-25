import { Router } from 'express';
import {
  startLocationSharing,
  stopLocationSharing,
} from '../../controllers/v1/location.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * /v1/users/location/start:
 *   post:
 *     summary: Start location sharing
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *                 format: double
 *                 example: 28.4595
 *               longitude:
 *                 type: number
 *                 format: double
 *                 example: 77.0266
 *     responses:
 *       200:
 *         description: Location sharing started
 *       400:
 *         description: Invalid coordinates
 */
router.post('/start', startLocationSharing);

/**
 * @swagger
 * /v1/users/location/stop:
 *   post:
 *     summary: Stop location sharing
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Location sharing stopped
 */
router.post('/stop', stopLocationSharing);

export default router;
