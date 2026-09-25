import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { getDiscoveryStack, recordSwipe } from '../controllers/discovery.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Discovery
 *   description: User discovery and swiping
 */

/**
 * @swagger
 * /discovery/stack:
 *   get:
 *     summary: Get a stack of candidate profiles to swipe on
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of candidates to return (max 50)
 *     responses:
 *       200:
 *         description: Candidate stack returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     candidates:
 *                       type: array
 *                     total:
 *                       type: integer
 *                     isDummy:
 *                       type: boolean
 *                       description: True when dummy/fallback data is returned
 *       401:
 *         description: Unauthorized
 */
router.get('/stack', protect, getDiscoveryStack);

/**
 * @swagger
 * /discovery/swipe:
 *   post:
 *     summary: Record a swipe action on a candidate
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetUserId, action]
 *             properties:
 *               targetUserId:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [like, pass]
 *     responses:
 *       200:
 *         description: Swipe recorded
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/swipe', protect, recordSwipe);

export default router;
