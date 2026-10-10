// End-to-end test of every Ping v1 endpoint against a local server + Postgres.
// Run: start the server, then `npm run test:e2e` (uses the same .env). Creates and deletes *@e2e.test users.
// NEVER point this at production data you care about.
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { io } from 'socket.io-client';

const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 5000}`;
const API = `${BASE}/api/v1`;
const ACCESS = process.env.JWT_ACCESS_SECRET;
const REFRESH = process.env.JWT_REFRESH_SECRET;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; failures.push(name); console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
};

async function call(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(API + path, { method, headers, body: payload });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

async function mkUser(email, name) {
  const { rows } = await pool.query(
    `insert into users (email, full_name, google_id) values ($1,$2,$3) returning id`,
    [email, name, 'g-' + email]);
  const id = rows[0].id;
  const refresh = jwt.sign({ userId: id, aud: 'app' }, REFRESH, { expiresIn: '7d' });
  await pool.query('update users set refresh_token=$1 where id=$2', [refresh, id]);
  return { id, token: jwt.sign({ userId: id, aud: 'app' }, ACCESS, { expiresIn: '1h' }), refresh };
}

const once = (sock, ev, ms = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms);
  sock.once(ev, d => { clearTimeout(t); res(d); });
});

async function main() {
  await pool.query(`delete from users where email like '%@e2e.test'`);
  const A = await mkUser('alice@e2e.test', 'Alice Google');
  const B = await mkUser('bob@e2e.test', 'Bob Google');

  console.log('\n# Health / Auth');
  let r = await fetch(`${API}/health`); check('GET /health', r.status === 200);
  r = await call('POST', '/auth/google/callback', { body: { id_token: 'nope' } });
  check('POST /auth/google/callback rejects bad token (401, not 404)', r.status === 401, r);
  r = await call('POST', '/auth/google/callback', { body: {} });
  check('POST /auth/google/callback 400 without id_token', r.status === 400, r);
  r = await call('POST', '/auth/apple/callback', { body: { identity_token: 'x' } });
  check('POST /auth/apple/callback 501 (not implemented)', r.status === 501, r);
  r = await call('POST', '/auth/signup', { body: { username: 'new@e2e.test', preferred_challenge: 'EMAIL_OTP' } });
  check('POST /auth/signup 200', r.status === 200, r);
  r = await call('POST', '/auth/login', { body: { username: 'nobody@e2e.test', preferred_challenge: 'EMAIL_OTP' } });
  check('POST /auth/login 404 unknown user', r.status === 404, r);
  r = await call('POST', '/auth/refresh-token', { body: { refresh_token: A.refresh } });
  check('POST /auth/refresh-token rotates both tokens', r.status === 200 && r.json?.data?.access_token && r.json?.data?.refresh_token, r);
  if (r.json?.data) { A.token = r.json.data.access_token; A.refresh = r.json.data.refresh_token; }
  r = await call('GET', '/users/profile');
  check('protected route 401 without token', r.status === 401, r);

  console.log('\n# Profile');
  r = await call('GET', '/users/profile', { token: A.token });
  check('GET /users/profile (fresh google user)', r.status === 200 && r.json.data.onboarding_completed === false && r.json.data.email === 'alice@e2e.test', r.json);
  r = await call('POST', '/users/profile', { token: A.token, body: { full_name: 'Alice', birthdate: '1999-05-10', gender: 'female', bio: 'hi' } });
  check('POST /users/profile works for Google user with pre-filled name', r.status === 200, r);
  r = await call('POST', '/users/profile', { token: A.token, body: { full_name: 'Alice', birthdate: '1999-05-10', gender: 'female' } });
  check('POST /users/profile second time → 409', r.status === 409, r);
  r = await call('POST', '/users/profile', { token: B.token, body: { full_name: 'Bob', birthdate: '1997-01-20', gender: 'male' } });
  check('POST /users/profile (B)', r.status === 200, r);
  r = await call('PUT', '/users/profile', { token: A.token, body: { bio: 'Trying every rooftop cafe' } });
  check('PUT /users/profile non-sensitive', r.status === 200 && r.json.data.profile.bio === 'Trying every rooftop cafe', r);
  r = await call('PUT', '/users/profile', { token: A.token, body: { bio: 'x', email: 'a@b.c' } });
  check('PUT /users/profile mixed fields → 400', r.status === 400, r);
  r = await call('PUT', '/users/profile', { token: A.token, body: { phone: '+919999999999' } });
  check('PUT /users/profile sensitive → verification_required', r.status === 200 && r.json.data.verification_required === true, r);
  const sess = r.json?.data?.session;
  r = await call('POST', '/users/profile/verify-login-info', { token: A.token, body: { otp: '123456', session: sess } });
  check('POST /users/profile/verify-login-info', r.status === 200, r);
  r = await call('PUT', '/users/profile', { token: A.token, body: { gender: 'alien' } });
  check('PUT /users/profile invalid gender → 400', r.status === 400, r);

  console.log('\n# Interests');
  r = await call('GET', '/interests');
  const cat = r.json?.data?.interests ?? [];
  check('GET /interests returns seeded catalogue', r.status === 200 && cat.length >= 30, cat.length);
  const ids = cat.slice(0, 4).map(i => i.id);
  r = await call('POST', '/users/interests', { token: A.token, body: { interest_ids: ids.slice(0, 2) } });
  check('POST /users/interests <3 → 400', r.status === 400, r);
  r = await call('POST', '/users/interests', { token: A.token, body: { interest_ids: ids.slice(0, 3) } });
  check('POST /users/interests', r.status === 200 && r.json.data.interests.length === 3, r);
  r = await call('PUT', '/users/interests', { token: A.token, body: { interest_ids: ids } });
  check('PUT /users/interests replaces set', r.status === 200 && r.json.data.interests.length === 4, r);
  r = await call('PUT', '/users/interests', { token: B.token, body: { interest_ids: cat.slice(2, 6).map(i => i.id) } });
  check('PUT /users/interests (B)', r.status === 200, r);
  r = await call('GET', '/users/interests', { token: A.token });
  check('GET /users/interests', r.status === 200 && r.json.data.interests.length === 4, r);

  console.log('\n# Photos');
  r = await call('GET', '/users/photos', { token: A.token });
  check('GET /users/photos (empty)', r.status === 200 && r.json.data.photos.length === 0, r);
  r = await call('POST', '/users/photos', { token: A.token, raw: new FormData() });
  check('POST /users/photos with no files → 400', r.status === 400, r);
  // Cloudinary isn't reachable from the test box — insert rows the way the upload handler would.
  for (const [u, n] of [[A, 3], [B, 1]]) {
    for (let i = 0; i < n; i++) await pool.query(`insert into photos (user_id, url, public_id, "order") values ($1,$2,$3,$4)`, [u.id, `https://img.test/${u.id}/${i}.jpg`, `e2e/${u.id}/${i}`, i]);
  }
  r = await call('GET', '/users/photos', { token: A.token });
  const ph = r.json?.data?.photos ?? [];
  check('GET /users/photos lists 3 with main first', ph.length === 3 && ph[0].is_profile_picture === true, ph);
  r = await call('PUT', '/users/photos/profile-picture', { token: A.token, body: { photo_id: ph[2].photo_id } });
  check('PUT /users/photos/profile-picture', r.status === 200, r);
  r = await call('GET', '/users/photos', { token: A.token });
  check('…new main photo is order 0', r.json.data.photos.find(p => p.order === 0)?.photo_id === ph[2].photo_id, r.json.data.photos);
  r = await call('DELETE', '/users/photos', { token: A.token, body: { photo_id: ph[1].photo_id } });
  check('DELETE /users/photos', r.status === 200, r);
  r = await call('DELETE', '/users/photos', { token: A.token, body: { photo_id: '00000000-0000-0000-0000-000000000000' } });
  check('DELETE /users/photos unknown → 404', r.status === 404, r);

  console.log('\n# Preferences / Privacy / Location');
  r = await call('GET', '/users/preferences', { token: A.token });
  check('GET /users/preferences before create → 404', r.status === 404, r);
  r = await call('PUT', '/users/preferences', { token: A.token, body: { interested_in: ['male'], min_age: 21, max_age: 35, max_distance_km: 25 } });
  check('PUT /users/preferences upserts', r.status === 200 && r.json.data.min_age === 21, r);
  r = await call('POST', '/users/preferences', { token: A.token, body: { interested_in: ['male'], min_age: 21, max_age: 35, max_distance_km: 25 } });
  check('POST /users/preferences when exists → 409', r.status === 409, r);
  r = await call('POST', '/users/preferences', { token: B.token, body: { interested_in: ['female'], min_age: 18, max_age: 40, max_distance_km: 50 } });
  check('POST /users/preferences (B)', r.status === 200 && r.json.data.preferences.min_age === 18, r);
  r = await call('PUT', '/users/preferences', { token: A.token, body: { min_age: 50 } });
  check('PUT /users/preferences min>max → 400', r.status === 400, r);
  r = await call('PUT', '/users/preferences', { token: A.token, body: { interested_in: ['other'] } });
  check('PUT /users/preferences invalid gender → 400', r.status === 400, r);
  r = await call('GET', '/users/preferences', { token: A.token });
  check('GET /users/preferences', r.status === 200 && r.json.data.interested_in[0] === 'male', r);

  r = await call('PUT', '/users/privacy/settings', { token: A.token, body: { show_distance: true, show_age: true, show_online_status: false, profile_visible_in_discover: true } });
  check('PUT /users/privacy/settings upserts', r.status === 200, r);
  r = await call('POST', '/users/privacy/settings', { token: B.token, body: { show_distance: false } });
  check('POST /users/privacy/settings (B, hide distance)', r.status === 200 && r.json.data.show_distance === false, r);
  r = await call('GET', '/users/privacy/settings', { token: A.token });
  check('GET /users/privacy/settings', r.status === 200 && r.json.data.profile_visible_in_discover === true, r);

  r = await call('POST', '/users/location/start', { token: A.token, body: { latitude: 28.4595, longitude: 77.0266 } });
  check('POST /users/location/start', r.status === 200 && r.json.data.sharing === true, r);
  r = await call('POST', '/users/location/start', { token: B.token, body: { latitude: 28.47, longitude: 77.03 } });
  check('POST /users/location/start (B)', r.status === 200, r);
  r = await call('POST', '/users/location/start', { token: A.token, body: { latitude: 200, longitude: 0 } });
  check('POST /users/location/start invalid → 400', r.status === 400, r);

  r = await call('GET', '/users/profile', { token: A.token });
  check('GET /users/profile → onboarding_completed true after all steps', r.json?.data?.onboarding_completed === true && r.json.data.onboarding_step === 'completed', r.json?.data);
  const dbA = await pool.query('select onboarding_completed from users where id=$1', [A.id]);
  check('…persisted in users.onboarding_completed', dbA.rows[0].onboarding_completed === true);

  r = await call('GET', `/users/profile/${B.id}`, { token: A.token });
  check('GET /users/profile/{id} public view (no email)', r.status === 200 && r.json.data.full_name === 'Bob' && r.json.data.email === undefined, r);
  r = await call('GET', '/users/profile/not-a-uuid', { token: A.token });
  check('GET /users/profile/{bad id} → 404', r.status === 404, r);
  r = await call('GET', '/users/profile/export', { token: A.token });
  check('GET /users/profile/export', r.status === 200 && r.json.data.export_url.startsWith('data:application/json'), r.status);

  console.log('\n# Discover / Interactions / Matches');
  r = await call('GET', '/discover?limit=10', { token: A.token });
  const deckA = r.json?.data?.users ?? [];
  check('GET /discover (A sees B)', r.status === 200 && deckA.some(u => u.user_id === B.id), r.json);
  const bCard = deckA.find(u => u.user_id === B.id);
  check('…card has age, interests, photos; distance hidden by B privacy', bCard && bCard.age > 18 && bCard.interests.length === 4 && bCard.photos.length === 1 && bCard.distance_km === null, bCard);
  r = await call('GET', '/discover', { token: B.token });
  const aCard = (r.json?.data?.users ?? []).find(u => u.user_id === A.id);
  check('GET /discover (B sees A with distance)', !!aCard && typeof aCard.distance_km === 'number', r.json);

  r = await call('POST', '/interactions', { token: A.token, body: { user_id: B.id, action: 'dislike' } });
  check('POST /interactions dislike', r.status === 200 && r.json.data.is_match === false, r);
  r = await call('DELETE', `/interactions/dislikes/${B.id}`, { token: A.token });
  check('DELETE /interactions/dislikes/{id} (rewind)', r.status === 200, r);
  r = await call('POST', '/interactions', { token: A.token, body: { user_id: B.id, action: 'like' } });
  check('POST /interactions like (no match yet)', r.status === 200 && r.json.data.is_match === false, r);
  r = await call('DELETE', `/interactions/likes/${B.id}`, { token: A.token });
  check('DELETE /interactions/likes/{id}', r.status === 200, r);
  r = await call('POST', '/interactions', { token: A.token, body: { user_id: B.id, action: 'like' } });
  check('POST /interactions like again', r.status === 200, r);
  r = await call('POST', '/interactions', { token: A.token, body: { user_id: 'bad', action: 'like' } });
  check('POST /interactions bad uuid → 400', r.status === 400, r);

  // socket listener for match_created on A before B likes back
  const sA = io(BASE, { auth: { token: A.token }, transports: ['websocket'] });
  await once(sA, 'connect');
  const matchEvt = once(sA, 'match_created');
  r = await call('POST', '/interactions', { token: B.token, body: { user_id: A.id, action: 'like' } });
  check("POST /interactions mutual like → 201 It's a match", r.status === 201 && r.json.data.is_match === true && r.json.data.chat.id, r);
  const chatId = r.json?.data?.chat?.id;
  const matchId = r.json?.data?.match?.id;
  try { const evt = await matchEvt; check('socket match_created delivered to A only', evt.matched_user_id === B.id, evt); }
  catch (e) { check('socket match_created delivered to A only', false, e.message); }

  r = await call('GET', '/discover', { token: A.token });
  check('matched user no longer in deck', !(r.json?.data?.users ?? []).some(u => u.user_id === B.id), r.json);

  r = await call('GET', '/matches', { token: A.token });
  const mA = r.json?.data?.matches ?? [];
  check('GET /matches', r.status === 200 && mA.length === 1 && mA[0].chat_id === chatId && mA[0].matched_user.full_name === 'Bob', mA);

  console.log('\n# Chats + Socket');
  const sB = io(BASE, { auth: { token: B.token }, transports: ['websocket'] });
  await once(sB, 'connect');
  sA.emit('join_chat', { chatId }); await once(sA, 'chat_joined');
  sB.emit('join_chat', { chatId }); await once(sB, 'chat_joined');
  check('socket join_chat (both)', true);
  const typing = once(sB, 'user_typing');
  sA.emit('typing', { chatId });
  try { await typing; check('socket typing → user_typing', true); } catch (e) { check('socket typing → user_typing', false, e.message); }
  const got = once(sB, 'new_message');
  sA.emit('send_message', { chatId, content: 'Hey Bob 👋' });
  try { const m = await got; check('socket send_message → new_message', m.message.content === 'Hey Bob 👋' && m.message.sender_id === A.id, m); }
  catch (e) { check('socket send_message → new_message', false, e.message); }
  const readEvt = once(sA, 'message_status');
  sB.emit('message_read', { chatId });
  try { const s = await readEvt; check('socket message_read → message_status', !!s.status, s); } catch (e) { check('socket message_read → message_status', false, e.message); }
  const sErr = once(sA, 'error');
  sA.emit('send_message', { chatId, content: '   ' });
  try { const e = await sErr; check('socket rejects empty message', e.code === 'VALIDATION_ERROR', e); } catch (e) { check('socket rejects empty message', false, e.message); }
  const badSock = io(BASE, { auth: { token: 'bad' }, transports: ['websocket'], reconnection: false });
  try { await once(badSock, 'connect_error'); check('socket rejects bad JWT', true); } catch { check('socket rejects bad JWT', false); }
  badSock.close();

  r = await call('GET', '/chats', { token: A.token });
  check('GET /chats', r.status === 200 && Array.isArray(r.json.data) && r.json.data[0]?.chat_id === chatId && r.json.data[0].last_message?.content === 'Hey Bob 👋', r.json);
  r = await call('GET', `/chats/${chatId}/messages`, { token: B.token });
  check('GET /chats/{id}/messages', r.status === 200 && r.json.data.messages.length === 1, r.json);
  const C = await mkUser('carol@e2e.test', 'Carol');
  r = await call('GET', `/chats/${chatId}/messages`, { token: C.token });
  check('GET /chats/{id}/messages by non-participant → 404', r.status === 404, r);
  r = await call('POST', `/chats/${chatId}/media`, { token: A.token, raw: new FormData() });
  check('POST /chats/{id}/media without file → 400', r.status === 400, r);
  r = await call('GET', '/matches', { token: B.token });
  check('GET /matches has_conversation after message', r.json?.data?.matches?.[0]?.has_conversation === true, r.json);

  console.log('\n# Safety');
  r = await call('POST', `/users/${B.id}/report`, { token: A.token, body: { reason: 'spam', details: 'test' } });
  check('POST /users/{id}/report', r.status === 200 && r.json.data.report_id, r);
  r = await call('POST', `/users/${B.id}/report`, { token: A.token, body: { reason: 'nope' } });
  check('POST /users/{id}/report invalid reason → 400', r.status === 400, r);
  r = await call('DELETE', `/matches/${matchId}`, { token: A.token });
  check('DELETE /matches/{id} (unmatch)', r.status === 200, r);
  r = await call('GET', '/chats', { token: A.token });
  check('…chat archived after unmatch', r.json.data.length === 0, r.json);
  r = await call('POST', `/users/${C.id}/block`, { token: A.token });
  check('POST /users/{id}/block', r.status === 200, r);
  r = await call('GET', '/users/blocked', { token: A.token });
  check('GET /users/blocked', r.status === 200 && r.json.data.users.length === 1 && r.json.data.users[0].user_id === C.id, r.json);
  for (let i = 0; i < 6; i++) await call('GET', '/users/blocked', { token: A.token });
  r = await call('GET', '/users/blocked', { token: A.token });
  check('GET /users/blocked is not throttled by the report limiter', r.status === 200, r);
  r = await call('DELETE', `/users/${C.id}/block`, { token: A.token });
  check('DELETE /users/{id}/block', r.status === 200, r);

  console.log('\n# Logout / Delete');
  r = await call('POST', '/users/location/stop', { token: A.token });
  check('POST /users/location/stop', r.status === 200 && r.json.data.sharing === false, r);
  r = await call('DELETE', '/users/profile', { token: C.token });
  check('DELETE /users/profile (soft)', r.status === 200, r);
  r = await call('DELETE', '/users/account', { token: B.token, body: {} });
  check('DELETE /users/account without confirm → 400', r.status === 400, r);
  r = await call('DELETE', '/users/account', { token: B.token, body: { confirm: B.id } });
  check('DELETE /users/account', r.status === 200, r);
  r = await call('POST', '/auth/logout', { token: A.token });
  check('POST /auth/logout', r.status === 200, r);
  r = await call('POST', '/auth/refresh-token', { body: { refresh_token: A.refresh } });
  check('refresh after logout → 401', r.status === 401, r);

  sA.close(); sB.close();
  await pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:', failures.join(' | ')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
