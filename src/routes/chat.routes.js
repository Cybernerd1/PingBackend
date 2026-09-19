import { Router } from 'express';
import {
  getConversations,
  createOrGetConversation,
  getMessages,
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Real-time chat REST endpoints (history & conversation management)
 */

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: Get all conversations for the current user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations with partner info and last message
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
 *                     conversations:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Unauthorized
 */
router.get('/conversations', getConversations);

/**
 * @swagger
 * /chat/conversations:
 *   post:
 *     summary: Create or retrieve a conversation with another user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the other user
 *     responses:
 *       200:
 *         description: Existing conversation returned
 *       201:
 *         description: New conversation created
 *       400:
 *         description: Invalid request
 */
router.post('/conversations', createOrGetConversation);

/**
 * @swagger
 * /chat/conversations/{id}/messages:
 *   get:
 *     summary: Get paginated messages for a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Conversation ID
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO timestamp of the oldest message from previous page (for pagination)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated messages (also marks unread messages as read)
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
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Message'
 *                     nextCursor:
 *                       type: string
 *                       nullable: true
 *                     markedRead:
 *                       type: integer
 *       403:
 *         description: Not a participant in this conversation
 *       404:
 *         description: Conversation not found
 */
router.get('/conversations/:id/messages', getMessages);

export default router;
