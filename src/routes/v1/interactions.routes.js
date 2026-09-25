import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import {
  recordInteraction,
  undoLike,
  undoDislike,
} from '../../controllers/v1/interactions.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { recordInteractionSchema } from '../../utils/validators/schemas.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Interactions
 *   description: Swipe interactions (like / dislike / undo)
 */

/**
 * @swagger
 * /v1/interactions:
 *   post:
 *     summary: Record a swipe interaction (like or dislike)
 *     tags: [Interactions]
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
 *                 format: uuid
 *                 description: ID of the user being swiped
 *               action:
 *                 type: string
 *                 enum: [like, dislike]
 *                 description: Swipe direction
 *     responses:
 *       200:
 *         description: Interaction recorded; matched flag returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     matched:
 *                       type: boolean
 *                     matchId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     targetUserId:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', protect, validate(recordInteractionSchema), recordInteraction);

/**
 * @swagger
 * /v1/interactions/likes/{targetUserId}:
 *   delete:
 *     summary: Undo a like
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Like removed successfully
 *       404:
 *         description: No like found
 *       401:
 *         description: Unauthorized
 */
router.delete('/likes/:targetUserId', protect, undoLike);

/**
 * @swagger
 * /v1/interactions/dislikes/{targetUserId}:
 *   delete:
 *     summary: Undo a dislike (user will reappear in discover)
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Dislike removed successfully
 *       404:
 *         description: No dislike found
 *       401:
 *         description: Unauthorized
 */
router.delete('/dislikes/:targetUserId', protect, undoDislike);

export default router;
