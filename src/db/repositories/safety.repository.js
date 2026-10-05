import { eq, and, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { reports } from '../schema/reports.js';
import { blocks } from '../schema/blocks.js';
import { matches } from '../schema/matches.js';
import { conversations } from '../schema/conversations.js';
import { users } from '../schema/users.js';

export const safetyRepository = {

  // ── Reports ──────────────────────────────────────────────────────────

  async createReport(reporterId, reportedId, reason, details = null) {
    // Idempotent — if already reported, return existing
    const [existing] = await db
      .select()
      .from(reports)
      .where(
        and(eq(reports.reporterId, reporterId), eq(reports.reportedId, reportedId))
      );
    if (existing) return existing;

    const [row] = await db
      .insert(reports)
      .values({ reporterId, reportedId, reason, details })
      .returning();
    return row;
  },

  // ── Blocks ────────────────────────────────────────────────────────────

  async blockUser(blockerId, blockedId) {
    // Idempotent — return existing if already blocked
    const [existing] = await db
      .select()
      .from(blocks)
      .where(
        and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId))
      );
    if (existing) return existing;

    // Run block + unmatch + archive chat in a single transaction
    const [blockRow] = await db.transaction(async (tx) => {
      // 1. Insert block
      const [b] = await tx
        .insert(blocks)
        .values({ blockerId, blockedId })
        .returning();

      // 2. Soft-delete any active match between them
      const [lo, hi] = [blockerId, blockedId].sort();
      await tx
        .update(matches)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            or(
              and(eq(matches.userAId, lo), eq(matches.userBId, hi)),
              and(eq(matches.userAId, hi), eq(matches.userBId, lo))
            ),
            eq(matches.isActive, true)
          )
        );

      // 3. Archive their chat
      await tx
        .update(conversations)
        .set({ statusCode: 'archived', updatedAt: new Date() })
        .where(
          and(
            eq(conversations.user1Id, lo),
            eq(conversations.user2Id, hi)
          )
        );

      return [b];
    });

    return blockRow;
  },

  async unblockUser(blockerId, blockedId) {
    const [deleted] = await db
      .delete(blocks)
      .where(
        and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId))
      )
      .returning();
    return deleted ?? null;
  },

  async isBlocked(blockerId, blockedId) {
    const [row] = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(
        and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId))
      );
    return !!row;
  },

  /**
   * Get all users blocked by blockerId, with their profile info.
   */
  async getBlockedUsers(blockerId) {
    const rows = await db
      .select({
        blockId: blocks.id,
        blockedId: blocks.blockedId,
        blockedAt: blocks.createdAt,
        fullName: users.fullName,
        username: users.username,
        googleAvatar: users.googleAvatar,
      })
      .from(blocks)
      .leftJoin(users, eq(blocks.blockedId, users.id))
      .where(eq(blocks.blockerId, blockerId));
    return rows;
  },

  /**
   * Get all blocked-by user IDs for a given user.
   * Used by discover engine to filter out blocked users.
   */
  async getBlockedIds(userId) {
    const rows = await db
      .select({ blockedId: blocks.blockedId })
      .from(blocks)
      .where(eq(blocks.blockerId, userId));
    return rows.map((r) => r.blockedId);
  },

  /**
   * Get IDs of users who have blocked this user.
   * Used by discover engine to prevent showing the blocker to the blocked.
   */
  async getBlockedByIds(userId) {
    const rows = await db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(eq(blocks.blockedId, userId));
    return rows.map((r) => r.blockerId);
  },
};
