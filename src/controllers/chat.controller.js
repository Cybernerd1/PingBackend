import { validationResult } from 'express-validator';
import { conversationRepository } from '../db/repositories/conversation.repository.js';
import { messageRepository } from '../db/repositories/message.repository.js';

// ─── GET /api/chat/conversations ─────────────────────────────────────────────
export const getConversations = async (req, res, next) => {
  try {
    const conversations = await conversationRepository.findByUserId(req.user.id);
    res.status(200).json({ success: true, data: { conversations } });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/chat/conversations ────────────────────────────────────────────
export const createOrGetConversation = async (req, res, next) => {
  try {
    const { userId: partnerId } = req.body;

    if (!partnerId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    if (partnerId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot start a conversation with yourself' });
    }

    const { conversation, isNew } = await conversationRepository.findOrCreate(
      req.user.id,
      partnerId
    );

    res.status(isNew ? 201 : 200).json({ success: true, data: { conversation } });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/chat/conversations/:id/messages ─────────────────────────────────
export const getMessages = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { cursor, limit = 30 } = req.query;

    // Verify user is part of this conversation
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const userId = req.user.id;
    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const msgs = await messageRepository.findByConversationId(conversationId, {
      limit: Math.min(Number(limit), 100),
      cursor,
    });

    // Mark messages as read (side effect)
    const updated = await messageRepository.markConversationRead(conversationId, userId);

    res.status(200).json({
      success: true,
      data: {
        messages: msgs,
        nextCursor: msgs.length > 0 ? msgs[0].createdAt : null,
        markedRead: updated.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
