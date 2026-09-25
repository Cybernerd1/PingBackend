import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import {
  getChatHistory,
  getChatMessages,
  uploadChatMedia,
} from '../../controllers/v1/chat.controller.js';
// Alias to avoid collision with the controller function of the same name
import { uploadChatMedia as chatMediaUpload } from '../../middleware/upload.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Chats
 *   description: Chat history and messaging
 */

/**
 * @swagger
 * /v1/chats:
 *   get:
 *     summary: Get chat history (paginated)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of chats to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of chats to skip
 *     responses:
 *       200:
 *         description: Chat history fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chat_id:
 *                         type: string
 *                         format: uuid
 *                       match_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       status_code:
 *                         type: string
 *                         enum: [active, archived]
 *                       matched_user_id:
 *                         type: string
 *                         format: uuid
 *                       matched_user_name:
 *                         type: string
 *                       matched_user_photo_url:
 *                         type: string
 *                         nullable: true
 *                       last_message:
 *                         type: object
 *                         nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get('/', getChatHistory);

/**
 * @swagger
 * /v1/chats/{chat_id}/messages:
 *   get:
 *     summary: Get messages for a chat (chronological)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chat_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Messages fetched successfully
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
 *                     chat_id:
 *                       type: string
 *                       format: uuid
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Message'
 *                     total:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found or not a participant
 */
router.get('/:chatId/messages', getChatMessages);

/**
 * @swagger
 * /v1/chats/{chatId}/media:
 *   post:
 *     summary: Upload chat media (image or voice note)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image (JPEG/PNG) or audio (MP3/M4A/OGG) file
 *     responses:
 *       200:
 *         description: Media uploaded — send the returned media_url via Socket.io
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
 *                     media_url:
 *                       type: string
 *                     media_type:
 *                       type: string
 *                       enum: [image, voice]
 *       400:
 *         description: Bad file type/size
 *       404:
 *         description: Chat not found
 */
router.post('/:chatId/media', chatMediaUpload.single('file'), uploadChatMedia);

export default router;
