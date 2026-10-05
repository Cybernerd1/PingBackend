/**
 * Ping Assistant controller — v1
 *
 * GET    /api/v1/assistant/messages   → history (oldest → newest)
 * POST   /api/v1/assistant/messages   → { content } → saves it, replies
 * DELETE /api/v1/assistant/messages   → clear history
 */

import { db } from '../config/database.js';
import { assistantMessages } from '../db/schema/assistant.js';
import { userInterests, interests } from '../db/schema/interests.js';
import { and, desc, eq, lt } from 'drizzle-orm';
import * as R from '../utils/response.js';
import { generateReply, isAssistantConfigured } from '../services/assistant.service.js';

const MAX_LEN = 1000;
const CONTEXT_MESSAGES = 20;

const shape = (m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.createdAt });

const profileContext = async (user) => {
  const rows = await db
    .select({ name: interests.name })
    .from(userInterests)
    .innerJoin(interests, eq(userInterests.interestId, interests.id))
    .where(eq(userInterests.userId, user.id));
  return {
    firstName: (user.fullName || '').split(' ')[0] || null,
    age: user.age ?? null,
    bio: user.bio || null,
    interests: rows.map((r) => r.name),
  };
};

export const getAssistantMessages = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const before = req.query.before ? new Date(req.query.before) : null;
    const conds = [eq(assistantMessages.userId, req.user.id)];
    if (before && !Number.isNaN(before.getTime())) conds.push(lt(assistantMessages.createdAt, before));

    const rows = await db
      .select()
      .from(assistantMessages)
      .where(and(...conds))
      .orderBy(desc(assistantMessages.createdAt))
      .limit(limit);

    return R.success(
      res,
      { messages: rows.reverse().map(shape), ai_enabled: isAssistantConfigured() },
      'Assistant messages fetched'
    );
  } catch (err) {
    next(err);
  }
};

export const sendAssistantMessage = async (req, res, next) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return R.validationError(res, 'content is required');
    if (content.length > MAX_LEN) return R.validationError(res, `content must be at most ${MAX_LEN} characters`);

    const [userMsg] = await db
      .insert(assistantMessages)
      .values({ userId: req.user.id, role: 'user', content })
      .returning();

    const recent = await db
      .select({ role: assistantMessages.role, content: assistantMessages.content })
      .from(assistantMessages)
      .where(eq(assistantMessages.userId, req.user.id))
      .orderBy(desc(assistantMessages.createdAt))
      .limit(CONTEXT_MESSAGES);

    const { content: replyText, source } = await generateReply(recent.reverse(), await profileContext(req.user));

    const [reply] = await db
      .insert(assistantMessages)
      .values({ userId: req.user.id, role: 'assistant', content: replyText })
      .returning();

    return R.success(res, { message: shape(userMsg), reply: shape(reply), source }, 'Reply generated', 201);
  } catch (err) {
    next(err);
  }
};

export const clearAssistantMessages = async (req, res, next) => {
  try {
    await db.delete(assistantMessages).where(eq(assistantMessages.userId, req.user.id));
    return R.success(res, { cleared: true }, 'Assistant chat cleared');
  } catch (err) {
    next(err);
  }
};
