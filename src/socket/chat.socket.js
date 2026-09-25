/**
 * Socket.io gateway — v1 (Phase 4 refactor)
 *
 * Connection flow:
 *   1. Client connects: socket.handshake.auth.token = "<JWT access token>"
 *   2. Server verifies JWT → attaches user to socket
 *   3. Server adds user to onlineUsers map → broadcasts presence_update online
 *   4. Client emits events: send_message, message_read, typing, stop_typing, location_update
 *   5. On disconnect → remove from map → broadcast presence_update offline
 *
 * Rooms:
 *   - Each chat uses its conversationId as the room name
 *   - Clients join rooms by emitting join_chat (not join_conversation legacy)
 *
 * Spec events (client → server):
 *   send_message     { chatId, content, message_type?, media_url? }
 *   message_read     { chatId }
 *   typing           { chatId }
 *   stop_typing      { chatId }
 *   location_update  { latitude, longitude }
 *
 * Spec events (server → client):
 *   new_message      { message }
 *   presence_update  { user_id, online, last_seen? }
 *   match_created    { match, chat }
 *   user_typing      { user_id, chat_id }
 *   user_stop_typing { user_id, chat_id }
 *   message_status   { message_id, chat_id, status }
 *   error            { code, message }
 */

import { verifyAccessToken } from '../utils/jwt.utils.js';
import { userRepository } from '../db/repositories/user.repository.js';
import { messageRepository } from '../db/repositories/message.repository.js';
import { conversationRepository } from '../db/repositories/conversation.repository.js';

// ── In-process presence store ──────────────────────────────────────────
// Maps userId → Set<socketId>. Supports multiple devices per user.
const onlineUsers = new Map();

const addOnline = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
};

const removeOnline = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
};

const isOnline = (userId) =>
  onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;

const getSocketIds = (userId) => [...(onlineUsers.get(userId) ?? [])];

// ── Emit to all sockets of a user ──────────────────────────────────────
const emitToUser = (io, userId, event, payload) => {
  getSocketIds(userId).forEach((sid) => io.to(sid).emit(event, payload));
};

// ── Socket error helper ────────────────────────────────────────────────
const socketError = (socket, code, message) => {
  socket.emit('error', { code, message });
};

export const initChatSocket = (io) => {

  // ── JWT auth middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) return next(new Error('AUTH_REQUIRED: No token provided'));

      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch {
        return next(new Error('AUTH_INVALID: Token invalid or expired'));
      }

      const user = await userRepository.findById(decoded.userId);
      if (!user) return next(new Error('AUTH_INVALID: User not found'));
      if (user.isDeleted || user.isAccountDeleted)
        return next(new Error('AUTH_INVALID: Account deleted'));

      socket.user = user;
      next();
    } catch {
      next(new Error('AUTH_ERROR: Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    addOnline(userId, socket.id);

    // Broadcast online presence to everyone
    socket.broadcast.emit('presence_update', {
      user_id: userId,
      online: true,
    });

    // ── join_chat ────────────────────────────────────────────────────
    // Client must join a chat room before sending/receiving messages
    socket.on('join_chat', async ({ chatId }) => {
      try {
        if (!chatId) return socketError(socket, 'VALIDATION_ERROR', 'chatId is required');

        const chat = await conversationRepository.findById(chatId);
        if (!chat) return socketError(socket, 'NOT_FOUND', 'Chat not found');

        const isParticipant =
          chat.user1Id === userId || chat.user2Id === userId;
        if (!isParticipant)
          return socketError(socket, 'FORBIDDEN', 'You are not a participant in this chat');

        socket.join(chatId);

        // Mark messages as delivered when joining
        await messageRepository.markConversationDelivered(chatId, userId);

        const partnerId =
          chat.user1Id === userId ? chat.user2Id : chat.user1Id;

        // Notify partner of delivery
        emitToUser(io, partnerId, 'message_status', {
          chat_id: chatId,
          status: 'delivered',
          updated_by: userId,
        });

        socket.emit('chat_joined', { chat_id: chatId });
      } catch {
        socketError(socket, 'INTERNAL_ERROR', 'Failed to join chat');
      }
    });

    // ── send_message ─────────────────────────────────────────────────
    socket.on('send_message', async ({ chatId, content, message_type, media_url }) => {
      try {
        const msgType = message_type || 'text';

        if (!chatId)
          return socketError(socket, 'VALIDATION_ERROR', 'chatId is required');

        if (msgType === 'text' && !content?.trim())
          return socketError(socket, 'VALIDATION_ERROR', 'content is required for text messages');

        if ((msgType === 'image' || msgType === 'voice') && !media_url)
          return socketError(socket, 'VALIDATION_ERROR', 'media_url is required for image/voice messages');

        const chat = await conversationRepository.findById(chatId);
        if (!chat) return socketError(socket, 'NOT_FOUND', 'Chat not found');

        if (chat.statusCode === 'archived')
          return socketError(socket, 'FORBIDDEN', 'This chat has been archived');

        const isParticipant =
          chat.user1Id === userId || chat.user2Id === userId;
        if (!isParticipant)
          return socketError(socket, 'FORBIDDEN', 'Not a participant');

        const partnerId =
          chat.user1Id === userId ? chat.user2Id : chat.user1Id;

        // Persist message
        let message = await messageRepository.create(
          chatId,
          userId,
          msgType === 'text' ? content.trim() : (content || ''),
          { messageType: msgType, mediaUrl: media_url || null }
        );

        // Update conversation lastMessageAt
        await conversationRepository.updateLastMessageAt(chatId, message.createdAt);

        // If partner is online → immediately upgrade to delivered
        if (isOnline(partnerId)) {
          message = await messageRepository.updateStatus(message.id, 'delivered');
          socket.emit('message_status', {
            message_id: message.id,
            chat_id: chatId,
            status: 'delivered',
          });
        }

        // Shape for wire
        const wireMessage = {
          message_id: message.id,
          chat_id: message.conversationId,
          sender_id: message.senderId,
          content: message.content,
          message_type: message.messageType,
          media_url: message.mediaUrl,
          is_read: message.isRead,
          created_at: message.createdAt,
        };

        // Broadcast to everyone in the chat room
        io.to(chatId).emit('new_message', { message: wireMessage });

        // Also push to partner sockets not in the room (background tab)
        const roomSockets = io.sockets.adapter.rooms.get(chatId) ?? new Set();
        getSocketIds(partnerId).forEach((sid) => {
          if (!roomSockets.has(sid)) {
            io.to(sid).emit('new_message', { message: wireMessage });
          }
        });
      } catch {
        socketError(socket, 'INTERNAL_ERROR', 'Failed to send message');
      }
    });

    // ── message_read ─────────────────────────────────────────────────
    socket.on('message_read', async ({ chatId }) => {
      try {
        if (!chatId) return;

        const chat = await conversationRepository.findById(chatId);
        if (!chat) return;

        const partnerId =
          chat.user1Id === userId ? chat.user2Id : chat.user1Id;

        await messageRepository.markConversationRead(chatId, userId);

        // Notify sender that their messages were read
        emitToUser(io, partnerId, 'message_status', {
          chat_id: chatId,
          status: 'read',
          read_by: userId,
        });
      } catch {
        // Non-critical — swallow silently
      }
    });

    // ── typing ───────────────────────────────────────────────────────
    socket.on('typing', ({ chatId }) => {
      if (chatId) {
        socket.to(chatId).emit('user_typing', {
          user_id: userId,
          chat_id: chatId,
        });
      }
    });

    socket.on('stop_typing', ({ chatId }) => {
      if (chatId) {
        socket.to(chatId).emit('user_stop_typing', {
          user_id: userId,
          chat_id: chatId,
        });
      }
    });

    // ── location_update ──────────────────────────────────────────────
    // Persists location to DB (used by discover engine for distance sorting)
    socket.on('location_update', async ({ latitude, longitude }) => {
      try {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || lat < -90 || lat > 90) return;
        if (isNaN(lng) || lng < -180 || lng > 180) return;

        await userRepository.update(userId, {
          locationLat: lat,
          locationLng: lng,
          locationSharing: true,
        });
      } catch {
        // Non-critical — swallow silently
      }
    });

    // ── disconnect ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
      removeOnline(userId, socket.id);
      if (!isOnline(userId)) {
        socket.broadcast.emit('presence_update', {
          user_id: userId,
          online: false,
          last_seen: new Date().toISOString(),
        });
      }
    });
  });
};
