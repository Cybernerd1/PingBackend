/**
 * Chat controller — v1
 *
 * GET  /api/v1/chats                          → getChatHistory
 * GET  /api/v1/chats/:chatId/messages         → getChatMessages
 * POST /api/v1/chats/:chatId/media            → uploadChatMedia
 *
 * Spec:
 *   GET /chats          — paginated list, query: limit, offset
 *   GET /chats/:id/messages — chronological messages, full payload
 *   POST /chats/:id/media — multipart upload, returns media_url + media_type
 */

import { db } from '../../config/database.js';
import { conversations } from '../../db/schema/conversations.js';
import { messages } from '../../db/schema/messages.js';
import { users } from '../../db/schema/users.js';
import { photos } from '../../db/schema/photos.js';
import { eq, and, or, desc, asc } from 'drizzle-orm';
import { cloudinary } from '../../config/cloudinary.js';
import * as R from '../../utils/response.js';

// ── GET /api/v1/chats ──────────────────────────────────────────────────
export const getChatHistory = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // 1. Fetch active chats the user is part of
    const chatRows = await db
      .select()
      .from(conversations)
      .where(
        and(
          or(
            eq(conversations.user1Id, currentUserId),
            eq(conversations.user2Id, currentUserId)
          ),
          eq(conversations.statusCode, 'active')
        )
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    if (chatRows.length === 0) {
      return R.success(res, [], 'Chat history fetched successfully');
    }

    // 2. Batch-fetch last messages for those chats
    const chatIds = chatRows.map((c) => c.id);
    const lastMessages = await db
      .select()
      .from(messages)
      .where(
        chatIds.length === 1
          ? eq(messages.conversationId, chatIds[0])
          : or(...chatIds.map((id) => eq(messages.conversationId, id)))
      )
      .orderBy(desc(messages.createdAt));

    // 3. Batch-fetch partner user info (matched_user_id etc.)
    const partnerIds = chatRows.map((c) =>
      c.user1Id === currentUserId ? c.user2Id : c.user1Id
    );

    const partnerUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        googleAvatar: users.googleAvatar,
      })
      .from(users)
      .where(
        partnerIds.length === 1
          ? eq(users.id, partnerIds[0])
          : or(...partnerIds.map((id) => eq(users.id, id)))
      );

    // 4. Batch-fetch partner profile photos (order 0)
    const partnerPhotos = await db
      .select({ userId: photos.userId, url: photos.url })
      .from(photos)
      .where(
        partnerIds.length === 1
          ? eq(photos.userId, partnerIds[0])
          : or(...partnerIds.map((id) => eq(photos.userId, id)))
      )
      .orderBy(photos.order);

    // 5. Build lookup maps
    const lastMsgByChatId = {};
    for (const msg of lastMessages) {
      if (!lastMsgByChatId[msg.conversationId]) {
        lastMsgByChatId[msg.conversationId] = msg;
      }
    }
    const partnerMap = Object.fromEntries(partnerUsers.map((u) => [u.id, u]));
    const photoMap = {};
    for (const ph of partnerPhotos) {
      if (!photoMap[ph.userId]) photoMap[ph.userId] = ph.url;
    }

    // 6. Shape response — matches spec field names exactly
    const payload = chatRows.map((c) => {
      const partnerId = c.user1Id === currentUserId ? c.user2Id : c.user1Id;
      const partner = partnerMap[partnerId] || {};
      const lastMsg = lastMsgByChatId[c.id] || null;

      return {
        chat_id: c.id,
        match_id: c.matchId || null,
        status_code: c.statusCode,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        matched_user_id: partnerId,
        matched_user_name: partner.fullName || partner.username || 'Ping User',
        matched_user_photo_url:
          photoMap[partnerId] || partner.googleAvatar || null,
        last_message: lastMsg
          ? {
              content: lastMsg.content,
              message_type: lastMsg.messageType || 'text',
              sent_at: lastMsg.createdAt,
              sender_user_id: lastMsg.senderId,
            }
          : null,
      };
    });

    return R.success(res, payload, 'Chat history fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ── GET /api/v1/chats/:chatId/messages ────────────────────────────────
export const getChatMessages = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const { chatId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // 1. Verify the chat exists and the user is a participant
    const [chat] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, chatId));

    if (!chat) return R.notFound(res, 'Chat not found');

    const isParticipant =
      chat.user1Id === currentUserId || chat.user2Id === currentUserId;
    if (!isParticipant)
      return R.notFound(res, 'Chat not found or you are not a participant');

    // 2. Fetch messages in chronological order (asc by createdAt)
    const msgRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, chatId))
      .orderBy(asc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    // 3. Total count (simple — might add count() in Phase 5)
    const total = msgRows.length; // approximate for now

    // 4. Shape response — spec field names
    const messagesPayload = msgRows.map((m) => ({
      message_id: m.id,
      chat_id: m.conversationId,
      sender_id: m.senderId,
      content: m.content,
      message_type: m.messageType || 'text',
      is_read: m.isRead,
      created_at: m.createdAt,
      media_url: m.mediaUrl || null,
    }));

    return R.success(
      res,
      { chat_id: chatId, messages: messagesPayload, total },
      'Messages fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};

// ── POST /api/v1/chats/:chatId/media ─────────────────────────────────
export const uploadChatMedia = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const { chatId } = req.params;

    // 1. Verify chat + participant
    const [chat] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, chatId));

    if (!chat) return R.notFound(res, 'Chat not found');

    const isParticipant =
      chat.user1Id === currentUserId || chat.user2Id === currentUserId;
    if (!isParticipant)
      return R.notFound(res, 'Chat not found or you are not a participant');

    if (!req.file)
      return R.validationError(res, 'A file is required (field name: file)');

    // 2. File is already uploaded to Cloudinary by multer-storage-cloudinary
    const mediaUrl = req.file.path;
    const mimetype = req.file.mimetype || '';

    // 3. Determine media type from MIME
    let mediaType = 'image';
    if (mimetype.startsWith('audio/')) mediaType = 'voice';
    else if (mimetype.startsWith('video/')) mediaType = 'image'; // treat as image for now

    return R.success(
      res,
      { media_url: mediaUrl, media_type: mediaType },
      'Media uploaded'
    );
  } catch (error) {
    next(error);
  }
};
