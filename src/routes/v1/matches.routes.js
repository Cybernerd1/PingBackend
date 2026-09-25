import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { getMatches, unmatch } from '../../controllers/v1/matches.controller.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Matches
 *   description: Match management
 */

/**
 * @swagger
 * /v1/matches:
 *   get:
 *     summary: Get user's matches (with last message preview)
 *     tags: [Matches]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Matches fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     matches:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Match'
 *       401:
 *         description: Unauthorized
 */
router.get('/', getMatches);

/**
 * @swagger
 * /v1/matches/{matchId}:
 *   delete:
 *     summary: Unmatch (soft-delete, archives chat)
 *     tags: [Matches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Unmatched successfully
 *       403:
 *         description: Not part of this match
 *       404:
 *         description: Match not found
 */
router.delete('/:matchId', unmatch);

export default router;
