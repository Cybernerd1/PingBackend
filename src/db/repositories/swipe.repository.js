import { db } from '../../config/database.js';
import { swipes } from '../schema/swipes.js';
import { eq, and } from 'drizzle-orm';

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
   */
  async getSwipedIds(swiperId) {
    const rows = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, swiperId));
    return rows.map((r) => r.swipedId);
  },
};
