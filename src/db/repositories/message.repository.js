import { eq, and, ne, lt, desc, asc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { messages } from '../schema/messages.js';

export const messageRepository = {

  /**
   * Create a new message in a conversation.
   * @param {string} conversationId
   * @param {string} senderId
   * @param {string} content
   * @param {{ messageType?: 'text'|'image'|'voice', mediaUrl?: string }} opts
   */
  async create(conversationId, senderId, content, opts = {}) {
    const [row] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId,
        content: content || '',
        messageType: opts.messageType || 'text',
        mediaUrl: opts.mediaUrl || null,
        isRead: false,
        status: 'sent',
      })
      .returning();
    return row;
  },

  /**
   * Paginated message fetch (offset-based, chronological).
   */
  async findByConversationId(conversationId, { limit = 50, offset = 0 } = {}) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Cursor-based fetch (newest first, reversed to chronological).
   * cursor = ISO string of the oldest message's createdAt in the current batch.
   */
  async findByConversationIdCursor(conversationId, { limit = 30, cursor } = {}) {
    const conditions = [eq(messages.conversationId, conversationId)];
    if (cursor) {
      conditions.push(lt(messages.createdAt, new Date(cursor)));
    }

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.reverse(); // chronological order
  },

  async updateStatus(messageId, status) {
    const [row] = await db
      .update(messages)
      .set({ status })
      .where(eq(messages.id, messageId))
      .returning();
    return row ?? null;
  },

  /**
   * Mark all messages in a conversation not sent by userId as read.
   */
  async markConversationRead(conversationId, recipientId) {
    return db
      .update(messages)
      .set({ status: 'read', isRead: true })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, recipientId),
          ne(messages.status, 'read')
        )
      )
      .returning();
  },

  /**
   * Bulk-mark sent messages as delivered when recipient comes online.
   */
  async markConversationDelivered(conversationId, recipientId) {
    await db
      .update(messages)
      .set({ status: 'delivered' })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, recipientId),
          eq(messages.status, 'sent')
        )
      );
  },

  async findById(messageId) {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return row ?? null;
  },
};
