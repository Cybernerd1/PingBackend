import { eq, and, or, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { conversations } from '../schema/conversations.js';
import { messages } from '../schema/messages.js';
import { users } from '../schema/users.js';

export const conversationRepository = {

  /**
   * Find an existing conversation between two users, or create one.
   */
  async findOrCreate(user1Id, user2Id) {
    // Ensure consistent ordering so (A,B) and (B,A) map to same row
    const [lo, hi] = [user1Id, user2Id].sort();

    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          or(eq(conversations.user1Id, lo), eq(conversations.user1Id, hi)),
          or(eq(conversations.user2Id, lo), eq(conversations.user2Id, hi)),
          or(
            and(eq(conversations.user1Id, lo), eq(conversations.user2Id, hi)),
            and(eq(conversations.user1Id, hi), eq(conversations.user2Id, lo))
          )
        )
      )
      .limit(1);

    if (existing.length) return { conversation: existing[0], isNew: false };

    const result = await db
      .insert(conversations)
      .values({ user1Id: lo, user2Id: hi })
      .returning();

    return { conversation: result[0], isNew: true };
  },

  /**
   * All conversations for a user, with last message + other user details.
   */
  async findByUserId(userId) {
    const userConvs = await db
      .select()
      .from(conversations)
      .where(
        or(
          eq(conversations.user1Id, userId),
          eq(conversations.user2Id, userId)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));

    if (!userConvs.length) return [];

    // For each conversation, fetch last message and partner info
    const enriched = await Promise.all(
      userConvs.map(async (conv) => {
        const partnerId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;

        const [partnerRows, lastMsgRows] = await Promise.all([
          db
            .select({
              id: users.id,
              name: users.name,
              username: users.username,
              googleAvatar: users.googleAvatar,
            })
            .from(users)
            .where(eq(users.id, partnerId))
            .limit(1),
          db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt))
            .limit(1),
        ]);

        return {
          ...conv,
          partner: partnerRows[0] ?? null,
          lastMessage: lastMsgRows[0] ?? null,
        };
      })
    );

    return enriched;
  },

  async findById(id) {
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    return result[0] ?? null;
  },

  async updateLastMessageAt(id, timestamp) {
    await db
      .update(conversations)
      .set({ lastMessageAt: timestamp })
      .where(eq(conversations.id, id));
  },
};
