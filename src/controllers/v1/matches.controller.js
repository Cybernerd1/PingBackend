/**
 * Matches controller — v1
 *
 * GET    /api/v1/matches            → getMatches
 * DELETE /api/v1/matches/:matchId   → unmatch
 *
 * Spec response for GET /api/v1/matches:
 *   data.matches = [{
 *     match_id, chat_id, matched_at, has_conversation,
 *     last_message: { content, message_type, sent_at, sender_user_id },
 *     matched_user: { user_id, full_name, age, profile_picture }
 *   }]
 */

import { db } from '../../config/database.js';
import { matches } from '../../db/schema/matches.js';
import { conversations } from '../../db/schema/conversations.js';
import { messages } from '../../db/schema/messages.js';
import { users } from '../../db/schema/users.js';
import { photos } from '../../db/schema/photos.js';
import { matchRepository } from '../../db/repositories/match.repository.js';
import { eq, or, and, desc } from 'drizzle-orm';
import * as R from '../../utils/response.js';

// ── Age from birthdate ─────────────────────────────────────────────────
const calcAge = (birthdate) => {
  if (!birthdate) return null;
  const today = new Date();
  const dob = new Date(birthdate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

// ── GET /api/v1/matches ────────────────────────────────────────────────
export const getMatches = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;

    // 1. Fetch active matches for this user
    const matchRows = await db
      .select()
      .from(matches)
      .where(
        and(
          or(
            eq(matches.userAId, currentUserId),
            eq(matches.userBId, currentUserId)
          ),
          eq(matches.isActive, true)
        )
      )
      .orderBy(desc(matches.createdAt));

    if (matchRows.length === 0) {
      return R.success(res, { matches: [] }, 'Matches fetched successfully');
    }

    // 2. Collect other-user IDs
    const otherIds = matchRows.map((m) =>
      m.userAId === currentUserId ? m.userBId : m.userAId
    );

    // 3. Batch-fetch other users' profiles
    const partnerProfiles = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        birthdate: users.birthdate,
        googleAvatar: users.googleAvatar,
      })
      .from(users)
      .where(
        otherIds.length === 1
          ? eq(users.id, otherIds[0])
          : or(...otherIds.map((id) => eq(users.id, id)))
      );

    // 4. Batch-fetch profile photos (order 0)
    const partnerPhotos = await db
      .select({ userId: photos.userId, id: photos.id, url: photos.url })
      .from(photos)
      .where(
        otherIds.length === 1
          ? eq(photos.userId, otherIds[0])
          : or(...otherIds.map((id) => eq(photos.userId, id)))
      )
      .orderBy(photos.order);

    // 5. Batch-fetch chats for all matches (one per match pair)
    const matchIds = matchRows.map((m) => m.id);
    const chatRows = await db
      .select()
      .from(conversations)
      .where(
        matchIds.length === 1
          ? eq(conversations.matchId, matchIds[0])
          : or(...matchIds.map((id) => eq(conversations.matchId, id)))
      );

    // 6. Batch-fetch last messages for those chats
    const chatIds = chatRows.map((c) => c.id);
    const lastMessages =
      chatIds.length > 0
        ? await db
            .select()
            .from(messages)
            .where(
              chatIds.length === 1
                ? eq(messages.conversationId, chatIds[0])
                : or(...chatIds.map((id) => eq(messages.conversationId, id)))
            )
            .orderBy(desc(messages.createdAt))
        : [];

    // 7. Build lookup maps
    const profileMap = Object.fromEntries(partnerProfiles.map((p) => [p.id, p]));
    const photoMap = {}; // userId → first photo
    for (const ph of partnerPhotos) {
      if (!photoMap[ph.userId]) photoMap[ph.userId] = ph;
    }
    const chatByMatchId = Object.fromEntries(chatRows.map((c) => [c.matchId, c]));
    const lastMsgByChatId = {}; // chatId → last message
    for (const msg of lastMessages) {
      if (!lastMsgByChatId[msg.conversationId]) {
        lastMsgByChatId[msg.conversationId] = msg;
      }
    }

    // 8. Shape response
    const payload = matchRows.map((m) => {
      const otherId = m.userAId === currentUserId ? m.userBId : m.userAId;
      const profile = profileMap[otherId] || {};
      const photo = photoMap[otherId] || null;
      const chat = chatByMatchId[m.id] || null;
      const lastMsg = chat ? lastMsgByChatId[chat.id] || null : null;

      return {
        match_id: m.id,
        chat_id: chat?.id || null,
        matched_at: m.createdAt,
        has_conversation: !!lastMsg,
        last_message: lastMsg
          ? {
              content: lastMsg.content,
              message_type: lastMsg.messageType || 'text',
              sent_at: lastMsg.createdAt,
              sender_user_id: lastMsg.senderId,
            }
          : null,
        matched_user: {
          user_id: otherId,
          full_name: profile.fullName || profile.username || 'Ping User',
          age: calcAge(profile.birthdate),
          profile_picture: photo
            ? { photo_id: photo.id, photo_url: photo.url }
            : profile.googleAvatar
            ? { photo_id: null, photo_url: profile.googleAvatar }
            : null,
        },
      };
    });

    return R.success(res, { matches: payload }, 'Matches fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/v1/matches/:matchId ───────────────────────────────────
export const unmatch = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const { matchId } = req.params;

    // matchRepository.unmatch throws 403/404 if user isn't in the match
    const updated = await matchRepository.unmatch(matchId, currentUserId);
    if (!updated) return R.notFound(res, 'Match not found');

    // Archive the associated chat (messages retained — required for moderation)
    await db
      .update(conversations)
      .set({ statusCode: 'archived', updatedAt: new Date() })
      .where(eq(conversations.matchId, matchId));

    return R.success(res, { unmatched: true }, 'Unmatched successfully');
  } catch (error) {
    next(error);
  }
};
