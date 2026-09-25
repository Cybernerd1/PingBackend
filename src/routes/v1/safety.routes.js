import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import {
  reportUser,
  blockUser,
  unblockUser,
  getBlockedUsers,
} from '../../controllers/v1/safety.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { reportUserSchema } from '../../utils/validators/schemas.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Safety
 *   description: Reporting and blocking
 */

/**
 * @swagger
 * /v1/users/blocked:
 *   get:
 *     summary: List all blocked users
 *     tags: [Safety]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Blocked users list
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
 *                     blocked:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           user_id:
 *                             type: string
 *                             format: uuid
 *                           full_name:
 *                             type: string
 *                           profile_picture:
 *                             type: string
 *                             nullable: true
 *                           blocked_at:
 *                             type: string
 *                             format: date-time
 */
router.get('/blocked', getBlockedUsers);

/**
 * @swagger
 * /v1/users/{userId}/report:
 *   post:
 *     summary: Report a user
 *     tags: [Safety]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [spam, inappropriate_content, harassment, fake_profile, underage, hate_speech, other]
 *               details:
 *                 type: string
 *                 description: Optional elaboration
 *     responses:
 *       200:
 *         description: User reported
 *       400:
 *         description: Validation error (invalid reason)
 *       404:
 *         description: Target user not found
 */
router.post('/:userId/report', validate(reportUserSchema), reportUser);

/**
 * @swagger
 * /v1/users/{userId}/block:
 *   post:
 *     summary: Block a user (also unmatches + archives chat)
 *     tags: [Safety]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User blocked, match archived
 *       404:
 *         description: User not found
 */
router.post('/:userId/block', blockUser);

/**
 * @swagger
 * /v1/users/{userId}/block:
 *   delete:
 *     summary: Unblock a user
 *     tags: [Safety]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User unblocked
 *       404:
 *         description: Block not found
 */
router.delete('/:userId/block', unblockUser);

export default router;
