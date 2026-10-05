/**
 * Ping Assistant — an in-app helper bot backed by OpenRouter.
 *
 * Env:
 *   OPENROUTER_API_KEY  — required for AI replies (without it a built-in
 *                         rule-based fallback answers instead)
 *   OPENROUTER_MODEL    — optional, default "openai/gpt-4o-mini"
 *   OPENROUTER_SITE_URL — optional, sent as HTTP-Referer for OpenRouter rankings
 */

import logger from '../utils/logger.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const TIMEOUT_MS = 25_000;

export const isAssistantConfigured = () => !!process.env.OPENROUTER_API_KEY;

const systemPrompt = (profile) => {
  const about = [
    profile?.firstName && `Name: ${profile.firstName}`,
    profile?.age && `Age: ${profile.age}`,
    profile?.bio && `Bio: "${profile.bio}"`,
    profile?.interests?.length && `Interests: ${profile.interests.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are Ping Assistant, the friendly built-in helper inside "Ping", a dating app.
You help the user with: writing or improving their bio, conversation openers and replies for their matches,
date ideas, confidence and dating etiquette, online-dating safety, and how to use Ping
(swipe right / Like to like someone, left to pass; a mutual like makes a match and opens a chat;
Discovery filters live behind the sliders icon on Home; profile, photos, interests, privacy and blocking live in the Profile tab;
users can report or block from a profile or chat).
Style: warm, upbeat, concise (usually under 120 words), plain text with short lists when useful, at most one emoji.
Never invent facts about the user's matches. Don't give medical, legal or financial advice; for anything unsafe
(harassment, threats, being asked for money) tell them to block/report and, if in danger, contact local emergency services.
Politely steer unrelated requests back to dating, relationships, or the app.
${about ? `\nWhat you know about the user (use naturally, don't recite):\n${about}` : ''}`;
};

/** Rule-based replies used when OpenRouter isn't configured or fails. */
export const fallbackReply = (text, profile) => {
  const t = (text || '').toLowerCase();
  const name = profile?.firstName ? ` ${profile.firstName}` : '';
  const interest = profile?.interests?.[0];

  if (/\b(hi|hello|hey|yo|namaste|hola)\b/.test(t))
    return `Hey${name}! 👋 I'm Ping Assistant. I can help you write a bio, come up with openers, plan a date, or figure out the app. What would you like?`;
  if (/\bbio\b|about me|profile text/.test(t))
    return `A great bio is short, specific and gives people something to reply to. Try this shape:\n\n1. One line about what you love${interest ? ` (e.g. ${interest})` : ''}\n2. One fun or oddly specific detail\n3. A question or invite — "Tell me your go-to comfort movie"\n\nShare your current bio and I'll polish it.`;
  if (/opener|first message|start (a )?(chat|conversation)|what (should|do) i (say|text)|icebreaker/.test(t))
    return `Openers that work:\n\n• Ask about something in their profile — "Okay, best trek you've done so far?"\n• Playful either/or — "Chai or coffee? This decides everything."\n• Their photos — "That view is unreal, where was it?"\n\nSkip plain "hey" — a specific question gets far more replies.`;
  if (/date idea|where (should|to) (we )?go|first date|plan a date/.test(t))
    return `First-date ideas that keep it easy:\n\n• Coffee or chai walk in a park\n• A food market or street-food crawl\n• Board-game café or bowling\n• Sunset spot + ice cream\n\nPick somewhere public, keep it 1–2 hours, and tell a friend your plans.`;
  if (/safe|safety|scam|money|harass|creepy|uncomfortable|block|report/.test(t))
    return `Your safety comes first:\n\n• Meet in public and tell a friend where you'll be\n• Never send money or share OTPs/bank details\n• Trust your gut — you can leave any time\n\nIf someone makes you uncomfortable, open their profile or chat and tap Report or Block. If you're in danger, contact local emergency services.`;
  if (/match|no one|no likes|not getting|swipe/.test(t))
    return `To get more matches:\n\n• Lead with a clear, smiling solo photo\n• Add 4–6 photos showing your hobbies\n• Pick interests that are really you — they show on your card\n• Widen distance or age in Discovery filters (sliders icon on Home)\n\nWant me to review your bio?`;
  if (/reply|respond|what (do|should) i say back|left on read|ghost/.test(t))
    return `Paste what they said and I'll suggest a few replies. In general: answer their question, add a little about you, and end with a question so the chat keeps flowing.`;
  if (/thank/.test(t)) return `Anytime${name}! Good luck out there 💜`;
  return `I'm here to help with your Ping profile, openers, replies to matches, date ideas and staying safe. Tell me a bit more about what you need${name ? `,${name}` : ''}?`;
};

/**
 * Generate a reply.
 * @param {{role:'user'|'assistant', content:string}[]} history oldest → newest, ending with the new user message
 * @returns {Promise<{content:string, source:'openrouter'|'fallback'}>}
 */
export const generateReply = async (history, profile) => {
  const last = history[history.length - 1]?.content ?? '';
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { content: fallbackReply(last, profile), source: 'fallback' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ping.app',
        'X-Title': 'Ping',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt(profile) }, ...history],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });
    const json = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!res.ok || !content) {
      logger.warn({ status: res.status, error: json?.error }, 'OpenRouter request failed — using fallback');
      return { content: fallbackReply(last, profile), source: 'fallback' };
    }
    return { content: content.slice(0, 4000), source: 'openrouter' };
  } catch (err) {
    logger.warn({ err: err?.message }, 'OpenRouter unreachable — using fallback');
    return { content: fallbackReply(last, profile), source: 'fallback' };
  } finally {
    clearTimeout(timer);
  }
};
