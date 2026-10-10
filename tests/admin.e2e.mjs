// End-to-end test of the admin backend against a local server + Postgres.
// Run: start the server, then `npm run test:admin` (uses the same .env).
// Creates and deletes *-admin@e2e.test / *-victim@e2e.test users.
// NEVER point this at production data you care about.
//
// Covers the security-critical paths:
//   1. requireAdmin — no token, app-audience token, wrong-secret token,
//      and a demoted admin are ALL rejected; a real admin session works.
//   2. Ban enforcement — banned user rejected on app routes AND app refresh,
//      refresh tokens revoked, FCM device tokens wiped, idempotent re-ban.
//   3. Login lockout — 5 failed attempts lock the account even for the
//      correct password (rotating X-Forwarded-For sidesteps the IP limiter
//      bucket to prove the DB lockout, not the rate limiter, is rejecting).
//   4. Reports workflow — patch, action (ban + close in one tx), and the
//      audit-logged conversation read.
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 5000}`;
const API = `${BASE}/api/v1`;
const ACCESS = process.env.JWT_ACCESS_SECRET;
const REFRESH = process.env.JWT_REFRESH_SECRET;
const ADMIN_ACCESS = process.env.JWT_ADMIN_ACCESS_SECRET;
const ADMIN_REFRESH = process.env.JWT_ADMIN_REFRESH_SECRET;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; failures.push(name); console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
};

async function call(method, path, { token, body, ip } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(API + path, { method, headers, body: payload });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

const ADMIN_EMAIL = 'root-admin@e2e.test';
const ADMIN_PASS = 'admin-e2e-password-123';
const VICTIM_EMAIL = 'banned-victim@e2e.test';
const REPORTER_EMAIL = 'reporter-u@e2e.test';

async function mkUser(email, name, extra = {}) {
  const { rows } = await pool.query(
    `insert into users (email, full_name, google_id, onboarding_completed) values ($1,$2,$3,true) returning id`,
    [email, name, 'g-' + email]);
  return { id: rows[0].id, email };
}

async function main() {
  // ── Cleanup from previous runs (audit log first — RESTRICT FK) ────────
  await pool.query(`
    DELETE FROM admin_audit_log
    WHERE admin_id IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')
       OR target_id IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@e2e.test'`);

  console.log('\n# Fixtures');
  const admin = await mkUser(ADMIN_EMAIL, 'Root Admin');
  const victim = await mkUser(VICTIM_EMAIL, 'Victim');
  const reporter = await mkUser(REPORTER_EMAIL, 'Reporter');
  await pool.query(
    `update users set role='admin', password=$1, is_email_verified=true where id=$2`,
    [await bcrypt.hash(ADMIN_PASS, 10), admin.id]);

  const adminToken = jwt.sign({ userId: admin.id, aud: 'admin' }, ADMIN_ACCESS, { expiresIn: '1h' });
  const victimToken = jwt.sign({ userId: victim.id, aud: 'app' }, ACCESS, { expiresIn: '1h' });
  const victimRefresh = jwt.sign({ userId: victim.id, aud: 'app' }, REFRESH, { expiresIn: '7d' });
  await pool.query(`update users set refresh_token=$1 where id=$2`, [victimRefresh, victim.id]);
  await pool.query(`insert into device_tokens (token, user_id, platform) values ($1,$2,'android')`,
    ['e2e-fcm-token-' + victim.id, victim.id]);
  await pool.query(
    `insert into refresh_tokens (token_hash, user_id, audience, expires_at)
     values ($1,$2,'app', now() + interval '7 days')`,
    ['sha256-e2e-unused-app-token', victim.id]);
  console.log(`  admin=${admin.id} victim=${victim.id} reporter=${reporter.id}`);

  console.log('\n# 1. requireAdmin rejections');
  let r = await call('GET', '/admin/users');
  check('GET /admin/users with NO token → 401', r.status === 401, r);
  r = await call('GET', '/admin/users', { token: victimToken });
  check('GET /admin/users with app-audience token → 401', r.status === 401, r);
  const wrongSecretToken = jwt.sign({ userId: admin.id, aud: 'admin' }, ADMIN_REFRESH, { expiresIn: '1h' });
  r = await call('GET', '/admin/users', { token: wrongSecretToken });
  check('GET /admin/users with admin-REFRESH-secret token → 401', r.status === 401, r);
  const wrongAudToken = jwt.sign({ userId: admin.id, aud: 'app' }, ADMIN_ACCESS, { expiresIn: '1h' });
  r = await call('GET', '/admin/users', { token: wrongAudToken });
  check('GET /admin/users with admin secret but aud:app → 401', r.status === 401, r);

  console.log('\n# 2. Admin login (no MFA — bootstrap path, no credentials row)');
  r = await call('POST', '/admin/auth/login', { body: { email: ADMIN_EMAIL, password: 'wrong-password' } });
  check('login with wrong password → 401', r.status === 401, r);
  r = await call('POST', '/admin/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASS } });
  check('login with correct password → 200 + tokens', r.status === 200 && r.json?.data?.access_token, r);
  const session = r.json?.data ?? {};

  r = await call('GET', '/admin/users', { token: session.access_token });
  check('GET /admin/users with real admin session → 200', r.status === 200, r);
  r = await call('POST', '/admin/auth/refresh', { body: { refresh_token: session.refresh_token } });
  check('POST /admin/auth/refresh rotates → 200', r.status === 200 && r.json?.data?.access_token, r);
  r = await call('POST', '/admin/auth/refresh', { body: { refresh_token: session.refresh_token } });
  check('reusing the OLD refresh token → 401 (rotation)', r.status === 401, r);

  console.log('\n# 3. Demoted admin rejected');
  await pool.query(`update users set role='user' where id=$1`, [admin.id]);
  r = await call('GET', '/admin/users', { token: session.access_token });
  check('demoted admin (DB role=user) → 403, token claims irrelevant', r.status === 403, r);
  await pool.query(`update users set role='admin' where id=$1`, [admin.id]);
  r = await call('GET', '/admin/users', { token: session.access_token });
  check('re-promoted admin → 200 again', r.status === 200, r);

  console.log('\n# 4. Ban enforcement');
  r = await call('POST', `/admin/users/${victim.id}/ban`, { token: session.access_token, body: {} });
  check('ban without reason → 400 (Zod)', r.status === 400, r);
  r = await call('POST', `/admin/users/${victim.id}/ban`, { token: session.access_token, body: { reason: 'e2e harassment test' } });
  check('POST /admin/users/:id/ban → 200', r.status === 200, r);
  r = await call('POST', `/admin/users/${victim.id}/ban`, { token: session.access_token, body: { reason: 'second ban same reason' } });
  check('re-ban is idempotent → 200 already_banned', r.status === 200 && r.json?.data?.already_banned === true, r);
  r = await call('GET', '/users/profile', { token: victimToken });
  check('banned user rejected on app route → 403', r.status === 403, r);
  r = await call('POST', '/auth/refresh-token', { body: { refresh_token: victimRefresh } });
  check('banned user cannot refresh app token', r.status === 403 || r.status === 401, r);
  const { rows: deviceRows } = await pool.query(`SELECT 1 FROM device_tokens WHERE user_id=$1`, [victim.id]);
  check('FCM device tokens wiped on ban', deviceRows.length === 0, deviceRows.length);
  const { rows: legacyRows } = await pool.query(`SELECT refresh_token FROM users WHERE id=$1`, [victim.id]);
  check('legacy refresh_token cleared on ban', !legacyRows[0]?.refresh_token, legacyRows[0]);
  const { rows: revokedRt } = await pool.query(
    `SELECT revoked_at FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NOT NULL`, [victim.id]);
  check('refresh_tokens rows revoked on ban', revokedRt.length >= 1, revokedRt.length);

  console.log('\n# 5. Audit log recorded the ban');
  r = await call('GET', `/admin/audit-log?target_id=${victim.id}&action=ban_user`, { token: session.access_token });
  check('audit-log shows ban_user for victim', r.status === 200 && r.json?.data?.entries?.length >= 1, r);
  r = await call('GET', `/admin/audit-log?target_id=${victim.id}`, { token: session.access_token });
  check('both ban attempts audited (idempotent one too)', r.json?.data?.entries?.length >= 2, r.json?.data?.entries?.length);

  console.log('\n# 6. Unban restores access');
  r = await call('POST', `/admin/users/${victim.id}/unban`, { token: session.access_token });
  check('POST /admin/users/:id/unban → 200', r.status === 200, r);
  r = await call('GET', '/users/profile', { token: victimToken });
  check('unbanned user can use app routes again → 200', r.status === 200, r);

  console.log('\n# 7. Verify / soft-delete');
  r = await call('PATCH', `/admin/users/${victim.id}/verify`, { token: session.access_token, body: { verified: true } });
  check('PATCH verify {verified:true} → 200', r.status === 200 && r.json?.data?.is_verified === true, r);
  const disposable = await mkUser('disposable@e2e.test', 'Disposable');
  const { rows: auditBefore } = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id=$1`, [disposable.id]);
  r = await call('DELETE', `/admin/users/${disposable.id}`, { token: session.access_token, body: { reason: 'e2e spam account' } });
  check('DELETE /admin/users/:id soft-deletes → 200', r.status === 200, r);
  const { rows: deletedFlag } = await pool.query(`SELECT is_account_deleted, deleted_at FROM users WHERE id=$1`, [disposable.id]);
  check('soft-delete flags set (purge job picks it up later)',
    deletedFlag[0]?.is_account_deleted === true && deletedFlag[0]?.deleted_at !== null, deletedFlag[0]);
  r = await call('DELETE', `/admin/users/${admin.id}`, { token: session.access_token, body: {} });
  check('DELETE on an admin account → 403', r.status === 403, r);

  console.log('\n# 8. Reports workflow');
  const { rows: convRows } = await pool.query(
    `insert into conversations (user1_id, user2_id) values ($1,$2) returning id`,
    [reporter.id < victim.id ? reporter.id : victim.id, reporter.id < victim.id ? victim.id : reporter.id]);
  const conversationId = convRows[0].id;
  await pool.query(`insert into messages (conversation_id, sender_id, content) values ($1,$2,$3)`,
    [conversationId, victim.id, 'e2e abusive message content']);
  const { rows: reportRows } = await pool.query(
    `insert into reports (reporter_id, reported_id, reason, details, conversation_id)
     values ($1,$2,'harassment','e2e report',$3) returning id`,
    [reporter.id, victim.id, conversationId]);
  const reportId = reportRows[0].id;

  r = await call('GET', '/admin/reports?status=pending&reason=harassment', { token: session.access_token });
  check('GET /admin/reports filter status+reason', r.status === 200 && r.json?.data?.reports?.some(x => x.id === reportId), r);
  r = await call('GET', '/admin/reports?status=pending&limit=500', { token: session.access_token });
  check('limit > 100 rejected by Zod → 400', r.status === 400, r);
  r = await call('GET', `/admin/reports/${reportId}`, { token: session.access_token });
  check('GET /admin/reports/:id with prior_reports count', r.status === 200 && r.json?.data?.report?.prior_reports >= 1, r);

  r = await call('GET', `/admin/reports/${reportId}/conversation`, { token: session.access_token });
  check('GET report conversation → 200, cursor-paginated', r.status === 200 && Array.isArray(r.json?.data?.messages), r);
  r = await call('GET', `/admin/audit-log?action=view_conversation&target_id=${reportId}`, { token: session.access_token });
  check('conversation READ itself is in the audit log', r.status === 200 && r.json?.data?.entries?.length >= 1, r);

  r = await call('PATCH', `/admin/reports/${reportId}`, { token: session.access_token, body: { status: 'reviewed', admin_note: 'looks credible' } });
  check('PATCH report → reviewed', r.status === 200 && r.json?.data?.report?.status === 'reviewed', r);

  r = await call('POST', `/admin/reports/${reportId}/action`, { token: session.access_token, body: { admin_note: 'banned via report action' } });
  check('POST report action → ban + close in one tx', r.status === 200 && r.json?.data?.banned === true, r);
  const { rows: reportStatus } = await pool.query(`SELECT status, reviewed_by FROM reports WHERE id=$1`, [reportId]);
  check('report closed as actioned with reviewer', reportStatus[0]?.status === 'actioned' && reportStatus[0]?.reviewed_by === admin.id, reportStatus[0]);
  r = await call('GET', '/users/profile', { token: victimToken });
  check('reported user banned by action → 403 on app route', r.status === 403, r);
  r = await call('POST', `/admin/reports/${reportId}/action`, { token: session.access_token, body: {} });
  check('re-action is idempotent (already actioned, no double ban)', r.status === 200 && r.json?.data?.banned === false, r);
  await call('POST', `/admin/users/${victim.id}/unban`, { token: session.access_token });

  console.log('\n# 9. Stats + validation');
  r = await call('GET', '/admin/stats/overview', { token: session.access_token });
  check('GET /admin/stats/overview → KPIs', r.status === 200 && typeof r.json?.data?.total_users === 'number', r);
  r = await call('GET', '/admin/users?filter=banned&limit=100&page=1', { token: session.access_token });
  check('GET /admin/users filter=banned ok', r.status === 200, r);
  r = await call('GET', '/admin/users?filter=notafilter', { token: session.access_token });
  check('unknown filter rejected → 400', r.status === 400, r);

  console.log('\n# 10. Login lockout (DB-level, survives IP rotation)');
  // Isolate from the failed login in section #2
  await pool.query(`UPDATE admin_credentials SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`, [admin.id]);
  for (let i = 1; i <= 4; i++) {
    r = await call('POST', '/admin/auth/login', { body: { email: ADMIN_EMAIL, password: `bad-${i}` }, ip: `10.9.9.${i}` });
  }
  check('4 bad attempts → 401 (not locked yet)', r.status === 401 && r.json?.code === 'UNAUTHORIZED', r);
  r = await call('POST', '/admin/auth/login', { body: { email: ADMIN_EMAIL, password: 'bad-5' }, ip: '10.9.9.5' });
  check('5th bad attempt → 429 ACCOUNT_LOCKED', r.status === 429 && r.json?.code === 'ACCOUNT_LOCKED', r);
  r = await call('POST', '/admin/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASS }, ip: '10.9.9.99' });
  check('correct password still locked → 429 ACCOUNT_LOCKED', r.status === 429 && r.json?.code === 'ACCOUNT_LOCKED', r);

  // ── Cleanup (audit log first — RESTRICT FK) ───────────────────────────
  await pool.query(`
    DELETE FROM admin_audit_log
    WHERE admin_id IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')
       OR target_id IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@e2e.test'`);

  await pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:', failures.join(' | ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
