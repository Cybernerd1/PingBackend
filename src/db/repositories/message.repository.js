import { eq, and, ne, lt, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { messages } from '../schema/messages.js';
import { conversations } from '../schema/conversations.js';

export const messageRepository = {

  async create(conversationId, senderId, content) {
    const result = await db
      .insert(messages)
      .values({ conversationId, senderId, content, status: 'sent' })
      .returning();

    return result[0];
  },

  /**
   * Paginated message fetch (cursor-based, newest first).
   * @param {string} conversationId
   * @param {{ limit?: number, cursor?: string }} options - cursor = last message's createdAt ISO string
   */
  async findByConversationId(conversationId, { limit = 30, cursor } = {}) {
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

    return rows.reverse(); // return chronological order
  },

  async updateStatus(messageId, status) {
    const result = await db
      .update(messages)
      .set({ status })
      .where(eq(messages.id, messageId))
      .returning();

    return result[0] ?? null;
  },

  /**
   * Bulk-mark all messages in a conversation that were NOT sent by userId as delivered.
   * Called when a user comes online / joins a conversation.
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

  /**
   * Mark all messages in a conversation not sent by the reading user as read.
   */
  async markConversationRead(conversationId, recipientId) {
    const updated = await db
      .update(messages)
      .set({ status: 'read' })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, recipientId),
          ne(messages.status, 'read')
        )
      )
      .returning();

    return updated;
  },

  async findById(messageId) {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    return result[0] ?? null;
  },
};
