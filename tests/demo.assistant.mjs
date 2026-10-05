// Demo login, sample profiles and Ping Assistant checks.
// Run against a fresh, migrated DB:  node tests/demo.assistant.mjs [baseUrl]
const B = (process.argv[2] || 'http://localhost:5055') + '/api/v1';
const DUMMY = '00000000-0000-4000-8000-0000000000';
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log('✓', m); }
  else { fail++; console.log('✗', m, JSON.stringify(x)?.slice(0, 300)); }
};
const j = async (method, path, body, tok) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const isDummy = (u) => u.user_id.startsWith(DUMMY);

let r = await j('POST', '/auth/login/password', { email: 'demo@ping.app', password: 'nope' });
ok(r.s === 401, 'wrong password → 401', r);
r = await j('POST', '/auth/login/password', { email: 'aanya.sharma@dummy.ping.app', password: 'x' });
ok(r.s === 401, 'sample profile cannot sign in', r);
r = await j('POST', '/auth/login/password', { email: 'demo@ping.app' });
ok(r.s === 400, 'missing password → 400', r);
r = await j('POST', '/auth/login/password', { email: ' Demo@Ping.app ', password: 'Demo@1234' });
ok(r.s === 200 && r.b.data.access_token && r.b.data.is_demo && r.b.data.profile_exists, 'demo login', r);
const T = r.b.data.access_token;

r = await j('GET', '/users/profile', null, T);
ok(r.b.data.is_demo === true && r.b.data.onboarding_completed && r.b.data.photos.length === 1, 'demo profile complete', r.b);

r = await j('GET', '/discover?limit=50', null, T);
const deck = r.b.data.users;
const dummies = deck.filter(isDummy);
ok(dummies.length === 12, `12 sample profiles visible (deck ${deck.length})`, dummies.length);
ok(dummies.every((u) => u.photos.length === 2 && u.interests.length === 5 && u.age), 'sample profiles have photos, interests, age', dummies[0]);
console.log('  real users in demo deck:', deck.length - dummies.length);

r = await j('POST', '/interactions', { user_id: DUMMY + '01', action: 'like' }, T);
ok(r.s === 201 && r.b.data.is_match && r.b.data.chat.id, 'liking a sample profile that liked you → match', r);
const chatId = r.b.data.chat.id;
r = await j('POST', '/interactions', { user_id: DUMMY + '04', action: 'like' }, T);
ok(r.s === 200 && !r.b.data.is_match, 'liking one that did not → no match', r);
r = await j('POST', '/interactions', { user_id: DUMMY + '02', action: 'dislike' }, T);
ok(r.s === 200, 'dislike', r);
r = await j('GET', '/discover?limit=50', null, T);
ok(r.b.data.users.filter(isDummy).length === 9, 'deck shrinks to 9', r.b.data.users.length);
r = await j('GET', '/chats?limit=50&offset=0', null, T);
ok(JSON.stringify(r.b).includes(chatId), 'match chat listed', r);

r = await j('POST', '/auth/login/password', { email: 'demo@ping.app', password: 'Demo@1234' });
const T2 = r.b.data.access_token;
r = await j('GET', '/discover?limit=50', null, T2);
const d2 = r.b.data.users.filter(isDummy);
ok(d2.length === 11 && !d2.find((u) => u.user_id === DUMMY + '01'), 're-login refills deck except matched (11)', d2.length);

r = await j('DELETE', '/users/account', { confirm: 'x' }, T2);
ok(r.s === 403, 'demo account delete blocked', r);
r = await j('DELETE', '/users/profile', null, T2);
ok(r.s === 403, 'demo profile delete blocked', r);

// ── Assistant ──
r = await j('GET', '/assistant/messages', null, T2);
ok(r.s === 200 && Array.isArray(r.b.data.messages) && typeof r.b.data.ai_enabled === 'boolean', 'assistant history', r);
const before = r.b.data.messages.length;
r = await j('POST', '/assistant/messages', { content: 'hey there' }, T2);
ok(r.s === 201 && r.b.data.reply.role === 'assistant' && r.b.data.reply.content.length > 10, `assistant replies (${r.b?.data?.source})`, r);
console.log('  reply:', r.b?.data?.reply?.content.slice(0, 90));
r = await j('POST', '/assistant/messages', { content: 'help me write a bio' }, T2);
ok(r.s === 201 && r.b.data.reply.content.length > 10, 'assistant bio reply', r);
r = await j('POST', '/assistant/messages', { content: '' }, T2);
ok(r.s === 400, 'empty → 400', r);
r = await j('POST', '/assistant/messages', { content: 'x'.repeat(1001) }, T2);
ok(r.s === 400, 'too long → 400', r);
r = await j('GET', '/assistant/messages', null, T2);
ok(r.b.data.messages.length === before + 4 && r.b.data.messages.at(-1).role === 'assistant', 'history ordered oldest → newest', r.b.data.messages.map((m) => m.role));
r = await j('GET', '/assistant/messages');
ok(r.s === 401, 'assistant needs auth', r);
await j('DELETE', '/assistant/messages', null, T2);
r = await j('GET', '/assistant/messages', null, T2);
ok(r.b.data.messages.length === 0, 'cleared', r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
