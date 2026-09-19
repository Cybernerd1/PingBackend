import { verifyAccessToken } from '../utils/jwt.utils.js';
import { userRepository } from '../db/repositories/user.repository.js';
import { messageRepository } from '../db/repositories/message.repository.js';
import { conversationRepository } from '../db/repositories/conversation.repository.js';

/**
 * Map of userId -> Set<socketId> (a user can have multiple tabs/devices)
 * @type {Map<string, Set<string>>}
 */
const onlineUsers = new Map();

const addOnlineUser = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
};

const removeOnlineUser = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
};

const isUserOnline = (userId) => onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;

const getSocketsForUser = (userId) => [...(onlineUsers.get(userId) ?? [])];

export const initChatSocket = (io) => {
  // ─── Auth middleware ────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyAccessToken(token);
      const user = await userRepository.findById(decoded.userId);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    addOnlineUser(userId, socket.id);

    console.log(`[Socket] ${socket.user.name ?? userId} connected (${socket.id})`);

    // Notify contacts that this user is online
    socket.broadcast.emit('user_online', { userId });

    // ─── join_conversation ──────────────────────────────────────────────────
    // Client joins the room for a specific conversation
    socket.on('join_conversation', async ({ conversationId }) => {
      try {
        const conversation = await conversationRepository.findById(conversationId);
        if (!conversation) return socket.emit('error', { message: 'Conversation not found' });

        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
          return socket.emit('error', { message: 'Forbidden' });
        }

        socket.join(conversationId);

        // Mark all messages from the other user as delivered when joining
        const updated = await messageRepository.markConversationDelivered(conversationId, userId);

        // Determine the sender of those messages to notify them
        const partnerId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
        const partnerSockets = getSocketsForUser(partnerId);

        if (partnerSockets.length) {
          partnerSockets.forEach((sid) => {
            io.to(sid).emit('message_status', {
              conversationId,
              status: 'delivered',
              updatedBy: userId,
            });
          });
        }
      } catch (err) {
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // ─── send_message ───────────────────────────────────────────────────────
    socket.on('send_message', async ({ conversationId, content }) => {
      try {
        if (!conversationId || !content?.trim()) {
          return socket.emit('error', { message: 'conversationId and content are required' });
        }

        const conversation = await conversationRepository.findById(conversationId);
        if (!conversation) return socket.emit('error', { message: 'Conversation not found' });

        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
          return socket.emit('error', { message: 'Forbidden' });
        }

        const partnerId =
          conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

        // Save message as 'sent' (single grey tick)
        let message = await messageRepository.create(conversationId, userId, content.trim());

        // Update conversation's lastMessageAt
        await conversationRepository.updateLastMessageAt(conversationId, message.createdAt);

        // If recipient is online → upgrade to 'delivered' immediately (double grey tick)
        if (isUserOnline(partnerId)) {
          message = await messageRepository.updateStatus(message.id, 'delivered');

          // Notify sender of delivery upgrade
          socket.emit('message_status', {
            messageId: message.id,
            conversationId,
            status: 'delivered',
          });
        }

        // Broadcast message to everyone in the conversation room (including sender)
        io.to(conversationId).emit('new_message', { message });

        // If partner is online but NOT in the room, send a push-style notification
        const partnerSockets = getSocketsForUser(partnerId);
        const roomSockets = io.sockets.adapter.rooms.get(conversationId) ?? new Set();
        partnerSockets.forEach((sid) => {
          if (!roomSockets.has(sid)) {
            io.to(sid).emit('new_message', { message });
          }
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ─── message_read ───────────────────────────────────────────────────────
    // Emitted by recipient when they actually view messages
    socket.on('message_read', async ({ conversationId }) => {
      try {
        const conversation = await conversationRepository.findById(conversationId);
        if (!conversation) return;

        const partnerId =
          conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

        // Mark all partner's messages as read (double blue tick)
        await messageRepository.markConversationRead(conversationId, userId);

        // Notify the sender
        const partnerSockets = getSocketsForUser(partnerId);
        partnerSockets.forEach((sid) => {
          io.to(sid).emit('message_status', {
            conversationId,
            status: 'read',
            readBy: userId,
          });
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to mark as read' });
      }
    });

    // ─── typing ─────────────────────────────────────────────────────────────
    socket.on('typing', ({ conversationId }) => {
      socket.to(conversationId).emit('user_typing', { userId, conversationId });
    });

    socket.on('stop_typing', ({ conversationId }) => {
      socket.to(conversationId).emit('user_stop_typing', { userId, conversationId });
    });

    // ─── disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      removeOnlineUser(userId, socket.id);
      if (!isUserOnline(userId)) {
        socket.broadcast.emit('user_offline', { userId });
        console.log(`[Socket] ${socket.user.name ?? userId} disconnected`);
      }
    });
  });
};
