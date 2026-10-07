import { db } from '../../config/database.js';
import { swipes } from '../schema/swipes.js';
import { matches } from '../schema/matches.js';
import { eq, and, or } from 'drizzle-orm';

export const swipeRepository = {
  /**
   * Record a swipe (like or dislike).
   * Uses ON CONFLICT DO NOTHING via the unique constraint — safe to retry.
   * Returns the inserted/existing row.
   */
  async recordSwipe(swiperId, swipedId, direction) {
    const [existing] = await db
      .select()
      .from(swipes)
      .where(and(eq(swipes.swiperId, swiperId), eq(swipes.swipedId, swipedId)));

    if (existing) {
      // Update direction if changed (e.g., re-swiping after undo)
      if (existing.direction !== direction) {
        const [updated] = await db
          .update(swipes)
          .set({ direction })
          .where(eq(swipes.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    const [row] = await db
      .insert(swipes)
      .values({ swiperId, swipedId, direction })
      .returning();
    return row;
  },

  /**
   * Check whether swiperId has already swiped swipedId.
   */
  async findSwipe(swiperId, swipedId) {
    const [row] = await db
      .select()
      .from(swipes)
      .where(and(eq(swipes.swiperId, swiperId), eq(swipes.swipedId, swipedId)));
    return row || null;
  },

  /**
   * Check if the reverse swipe exists AND is a like (mutual like = match).
   */
  async hasMutualLike(userAId, userBId) {
    const [row] = await db
      .select()
      .from(swipes)
      .where(
        and(
          eq(swipes.swiperId, userBId),
          eq(swipes.swipedId, userAId),
          eq(swipes.direction, 'like')
        )
      );
    return !!row;
  },

  /**
   * Delete (undo) a swipe. Returns deleted row or null.
   */
  async deleteSwipe(swiperId, swipedId) {
    const [deleted] = await db
      .delete(swipes)
      .where(and(eq(swipes.swiperId, swiperId), eq(swipes.swipedId, swipedId)))
      .returning();
    return deleted || null;
  },

  /**
   * Get all user IDs that swiperId has already swiped (any direction).
   * Used to exclude from discover stack.
   *
   * Excludes swipes toward users the swiper has since unmatched — those pairs
   * should be discoverable again (unmatch also deletes swipes going forward,
   * but this covers rows that predate that fix).
   */
  async getSwipedIds(swiperId) {
    const rows = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, swiperId));

    if (rows.length === 0) return [];

    const swipedIds = rows.map((r) => r.swipedId);

    // Fetch inactive matches involving swiperId
    const inactiveMatches = await db
      .select({ userAId: matches.userAId, userBId: matches.userBId })
      .from(matches)
      .where(
        and(
          or(eq(matches.userAId, swiperId), eq(matches.userBId, swiperId)),
          eq(matches.isActive, false)
        )
      );

    // Build set of unmatched partner IDs
    const unmatchedIds = new Set(
      inactiveMatches.map((m) =>
        m.userAId === swiperId ? m.userBId : m.userAId
      )
    );

    // Exclude swipes toward unmatched partners
    return swipedIds.filter((id) => !unmatchedIds.has(id));
  },
};
