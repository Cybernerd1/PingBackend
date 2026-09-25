/**
 * Interactions controller — v1
 *
 * POST   /api/v1/interactions                           → recordInteraction
 * DELETE /api/v1/interactions/likes/:targetUserId       → undoLike
 * DELETE /api/v1/interactions/dislikes/:targetUserId    → undoDislike
 *
 * Spec body for POST:  { user_id, action: "like" | "dislike" }
 * Response 200 (no match):  { liked_user_id, is_match: false, like_id, match: {}, chat: {} }
 * Response 201 (it's a match): { liked_user_id, is_match: true, like_id, match: {...}, chat: {...} }
 */

import { db } from '../../config/database.js';
import { swipeRepository } from '../../db/repositories/swipe.repository.js';
import { matchRepository } from '../../db/repositories/match.repository.js';
import { conversations } from '../../db/schema/conversations.js';
import { eq, and, or } from 'drizzle-orm';
import * as R from '../../utils/response.js';
import { getIO } from '../../socket/index.js';

// ── POST /api/v1/interactions ──────────────────────────────────────────
export const recordInteraction = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    // Spec uses `user_id` for the target; support both for safety
    const targetUserId = req.body.user_id || req.body.targetUserId;
    const action = req.body.action;

    if (!targetUserId) return R.validationError(res, 'user_id is required');
    if (!action || !['like', 'dislike'].includes(action))
      return R.validationError(res, 'action must be "like" or "dislike"');
    if (targetUserId === currentUserId)
      return R.validationError(res, 'You cannot swipe yourself');

    // 1. Record the swipe (upserts safely via unique constraint)
    const direction = action === 'like' ? 'like' : 'dislike';
    const swipeRow = await swipeRepository.recordSwipe(currentUserId, targetUserId, direction);

    // 2. Dislike path — quick exit
    if (direction === 'dislike') {
      return R.success(
        res,
        {
          liked_user_id: targetUserId,
          is_match: false,
          like_id: swipeRow.id,
          match: {},
          chat: {},
        },
        'User disliked successfully.'
      );
    }

    // 3. Check for mutual like
    const isMutual = await swipeRepository.hasMutualLike(currentUserId, targetUserId);

    if (!isMutual) {
      return R.success(
        res,
        {
          liked_user_id: targetUserId,
          is_match: false,
          like_id: swipeRow.id,
          match: {},
          chat: {},
        },
        'User liked successfully.'
      );
    }

    // 4. It's a match! Create match + chat in a DB transaction
    let match = null;
    let chat = null;

    await db.transaction(async (tx) => {
      // 4a. Create match (idempotent — unique constraint on userAId+userBId)
      match = await matchRepository.createMatch(currentUserId, targetUserId);

      // 4b. Create the linked chat (idempotent — check for existing first)
      const [lo, hi] = [currentUserId, targetUserId].sort();
      const [existingChat] = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.user1Id, lo),
            eq(conversations.user2Id, hi)
          )
        );

      if (existingChat) {
        chat = existingChat;
      } else {
        const [newChat] = await tx
          .insert(conversations)
          .values({
            user1Id: lo,
            user2Id: hi,
            matchId: match.id,
            statusCode: 'active',
          })
          .returning();
        chat = newChat;
      }
    });

    // Broadcast match_created to both users via Socket.io (non-blocking)
    try {
      const io = getIO();
      const matchPayload = {
        match: { id: match.id, status: 'active', created_at: match.createdAt },
        chat: { id: chat.id, status: chat.statusCode, created_at: chat.createdAt },
      };
      // Emit to both — the emitToUser helper is in chat.socket so we use io directly
      [currentUserId, targetUserId].forEach((uid) => {
        io.emit(`match_created:${uid}`, matchPayload); // per-user channel
      });
    } catch {
      // Socket may not be initialized in tests — non-fatal
    }

    return R.success(
      res,
      {
        liked_user_id: targetUserId,
        is_match: true,
        like_id: swipeRow.id,
        match: {
          id: match.id,
          status: 'active',
          created_at: match.createdAt,
        },
        chat: {
          id: chat.id,
          status: chat.statusCode,
          created_at: chat.createdAt,
        },
      },
      "It's a match!",
      201
    );
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/v1/interactions/likes/:targetUserId ───────────────────
export const undoLike = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.params;

    const swipe = await swipeRepository.findSwipe(currentUserId, targetUserId);

    if (!swipe) return R.notFound(res, 'No like found for this user');
    if (swipe.direction !== 'like')
      return R.validationError(res, 'The existing swipe is not a like');

    await swipeRepository.deleteSwipe(currentUserId, targetUserId);

    return R.success(res, { removed: true }, 'Like removed successfully.');
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/v1/interactions/dislikes/:targetUserId ────────────────
export const undoDislike = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.params;

    const swipe = await swipeRepository.findSwipe(currentUserId, targetUserId);

    if (!swipe) return R.notFound(res, 'No dislike found for this user');
    if (swipe.direction !== 'dislike')
      return R.validationError(res, 'The existing swipe is not a dislike');

    await swipeRepository.deleteSwipe(currentUserId, targetUserId);

    return R.success(
      res,
      { removed: true },
      'Dislike removed successfully.'
    );
  } catch (error) {
    next(error);
  }
};
