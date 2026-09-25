import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { getDiscoverStack } from '../../controllers/v1/discover.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Discover
 *   description: Swipe deck discovery
 */

/**
 * @swagger
 * /v1/discover:
 *   get:
 *     summary: Get filtered discover (swipe deck) candidates
 *     tags: [Discover]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Max candidates to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for offset pagination
 *     responses:
 *       200:
 *         description: Candidate batch returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     candidates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                             format: uuid
 *                           fullName:
 *                             type: string
 *                           age:
 *                             type: integer
 *                           bio:
 *                             type: string
 *                           distanceKm:
 *                             type: number
 *                           photos:
 *                             type: array
 *                             items:
 *                               type: string
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/', protect, getDiscoverStack);

export default router;
