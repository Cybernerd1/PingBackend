import { db } from '../../config/database.js';
import { matches } from '../schema/matches.js';
import { users } from '../schema/users.js';
import { photos } from '../schema/photos.js';
import { eq, or, and, desc } from 'drizzle-orm';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Canonical ordering: always store userAId < userBId.
 * This prevents duplicate pairs (A,B) and (B,A).
 */
const ordered = (idA, idB) =>
  idA < idB ? { userAId: idA, userBId: idB } : { userAId: idB, userBId: idA };

export const matchRepository = {
  /**
   * Create a new match. Idempotent — does nothing if match already exists.
   * Must be called inside a DB transaction for atomicity with swipe insert.
   */
  async createMatch(userIdA, userIdB) {
    const { userAId, userBId } = ordered(userIdA, userIdB);

    // Check if match already exists (defensive — unique constraint also guards this)
    const [existing] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.userAId, userAId), eq(matches.userBId, userBId)));
    if (existing) return existing;

    const [row] = await db
      .insert(matches)
      .values({ userAId, userBId })
      .returning();
    return row;
  },

  /**
   * Find existing match between two users regardless of ordering.
   */
  async findMatch(userIdA, userIdB) {
    const { userAId, userBId } = ordered(userIdA, userIdB);
    const [row] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.userAId, userAId), eq(matches.userBId, userBId)));
    return row || null;
  },

  /**
   * List all active matches for a user, with the other party's profile data.
   */
  async listMatchesForUser(userId) {
    // Fetch matches where user is either A or B
    const rows = await db
      .select()
      .from(matches)
      .where(
        and(
          or(eq(matches.userAId, userId), eq(matches.userBId, userId)),
          eq(matches.isActive, true)
        )
      )
      .orderBy(desc(matches.createdAt));

    if (rows.length === 0) return [];

    // Collect the "other" user IDs
    const otherIds = rows.map((m) => (m.userAId === userId ? m.userBId : m.userAId));

    // Fetch profiles for those IDs in one query
    const profiles = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        bio: users.bio,
        googleAvatar: users.googleAvatar,
        birthdate: users.birthdate,
      })
      .from(users)
      .where(
        // IN equivalent via multiple OR conditions
        otherIds.length === 1
          ? eq(users.id, otherIds[0])
          : or(...otherIds.map((id) => eq(users.id, id)))
      );

    // Fetch first photos for those users
    const profilePhotos = await db
      .select({ userId: photos.userId, url: photos.url })
      .from(photos)
      .where(
        otherIds.length === 1
          ? eq(photos.userId, otherIds[0])
          : or(...otherIds.map((id) => eq(photos.userId, id)))
      )
      .orderBy(photos.order);

    // Build lookup maps
    const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const firstPhoto = {};
    for (const ph of profilePhotos) {
      if (!firstPhoto[ph.userId]) firstPhoto[ph.userId] = ph.url;
    }

    return rows.map((m) => {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      const profile = profileMap[otherId] || {};
      return {
        matchId: m.id,
        matchedAt: m.createdAt,
        user: {
          userId: otherId,
          fullName: profile.fullName || profile.username || 'Ping User',
          photo: firstPhoto[otherId] || profile.googleAvatar || null,
          bio: profile.bio || null,
        },
      };
    });
  },

  /**
   * Soft-delete a match (unmatch). Does NOT delete the chat.
   */
  async unmatch(matchId, requestingUserId) {
    // Verify the requesting user is part of this match
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) return null;
    if (match.userAId !== requestingUserId && match.userBId !== requestingUserId) {
      const err = new Error('You are not part of this match');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const [updated] = await db
      .update(matches)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  },

  /**
   * Get all active match user IDs for a given user.
   * Used to exclude already-matched users from discover stack.
   */
  async getMatchedUserIds(userId) {
    const rows = await db
      .select({ userAId: matches.userAId, userBId: matches.userBId })
      .from(matches)
      .where(
        and(
          or(eq(matches.userAId, userId), eq(matches.userBId, userId)),
          eq(matches.isActive, true)
        )
      );
    return rows.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
  },
};
