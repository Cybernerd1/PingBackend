import { eq, and, or, desc, ne } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { conversations } from '../schema/conversations.js';
import { messages } from '../schema/messages.js';
import { users } from '../schema/users.js';
import { photos } from '../schema/photos.js';

export const conversationRepository = {

  /**
   * Find an existing conversation between two users, or create one.
   * Canonical ordering: user1Id < user2Id (alphabetical).
   */
  async findOrCreate(user1Id, user2Id, matchId = null) {
    const [lo, hi] = [user1Id, user2Id].sort();

    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.user1Id, lo),
          eq(conversations.user2Id, hi)
        )
      )
      .limit(1);

    if (existing) return { conversation: existing, isNew: false };

    const [row] = await db
      .insert(conversations)
      .values({
        user1Id: lo,
        user2Id: hi,
        matchId: matchId || null,
        statusCode: 'active',
      })
      .returning();

    return { conversation: row, isNew: true };
  },

  /**
   * All active conversations for a user, with last message + partner info.
   */
  async findByUserId(userId, { limit = 20, offset = 0 } = {}) {
    const userConvs = await db
      .select()
      .from(conversations)
      .where(
        and(
          or(
            eq(conversations.user1Id, userId),
            eq(conversations.user2Id, userId)
          ),
          eq(conversations.statusCode, 'active')
        )
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    if (!userConvs.length) return [];

    const enriched = await Promise.all(
      userConvs.map(async (conv) => {
        const partnerId =
          conv.user1Id === userId ? conv.user2Id : conv.user1Id;

        const [[partnerRow], [lastMsg], [photoRow]] = await Promise.all([
          db
            .select({
              id: users.id,
              fullName: users.fullName,
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
          db
            .select({ url: photos.url })
            .from(photos)
            .where(eq(photos.userId, partnerId))
            .orderBy(photos.order)
            .limit(1),
        ]);

        return {
          ...conv,
          partner: partnerRow ?? null,
          partnerPhotoUrl: photoRow?.url ?? partnerRow?.googleAvatar ?? null,
          lastMessage: lastMsg ?? null,
        };
      })
    );

    return enriched;
  },

  async findById(id) {
    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return row ?? null;
  },

  /**
   * Verify user is a participant of the given conversation.
   */
  async isParticipant(conversationId, userId) {
    const [row] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          or(
            eq(conversations.user1Id, userId),
            eq(conversations.user2Id, userId)
          )
        )
      )
      .limit(1);
    return !!row;
  },

  async updateLastMessageAt(id, timestamp) {
    await db
      .update(conversations)
      .set({ lastMessageAt: timestamp, updatedAt: new Date() })
      .where(eq(conversations.id, id));
  },

  async archive(id) {
    await db
      .update(conversations)
      .set({ statusCode: 'archived', updatedAt: new Date() })
      .where(eq(conversations.id, id));
  },
};
