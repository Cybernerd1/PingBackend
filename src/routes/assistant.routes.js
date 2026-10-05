import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {
  getAssistantMessages,
  sendAssistantMessage,
  clearAssistantMessages,
} from '../controllers/assistant.controller.js';
import { assistantRateLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();
router.use(protect);

/**
 * @swagger
 * /v1/assistant/messages:
 *   get:
 *     summary: Ping Assistant chat history (oldest → newest)
 *     tags: [Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *       - in: query
 *         name: before
 *         schema: { type: string, format: date-time }
 *   post:
 *     summary: Send a message to Ping Assistant and get its reply
 *     description: Uses OpenRouter when OPENROUTER_API_KEY is set, otherwise a built-in rule-based fallback.
 *     tags: [Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 1000, example: Help me write a bio }
 *   delete:
 *     summary: Clear the Ping Assistant chat
 *     tags: [Assistant]
 *     security:
 *       - bearerAuth: []
 */
router.get('/messages', getAssistantMessages);
router.post('/messages', assistantRateLimiter, sendAssistantMessage);
router.delete('/messages', clearAssistantMessages);

export default router;
