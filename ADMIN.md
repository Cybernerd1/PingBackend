# Ping Admin Backend

Security-hardened admin API mounted at `/api/v1/admin/*`. This document is the
operator/dev guide; the review checklist it implements is in the git history.

## Verify-first answers (state before this work)

| Question | Answer |
|---|---|
| Does auth.middleware trust JWT claims? | No — it loads the user from the DB **per request**. Bans/demotions take effect on the next request. It also rejects banned/deleted users. |
| Are refresh tokens stored server-side? | Yes — `refresh_tokens` table: SHA-256 **hash** only, per-audience (`app` / `admin`), revocable, rotated on refresh. The legacy `users.refresh_token` column is cleared on ban and still used by the app flow. |
| `last_active` + admin password path? | `users.last_active_at` (throttled 5-min write in auth middleware); admin passwords use `users.password` (bcrypt, cost 12); MFA secrets live encrypted in `admin_credentials`. |
| Photo/media URLs signed or public? | Public Cloudinary URLs (`photos.url`). Not signed — acceptable for profile photos; revisit if private media is ever added. |

## Auth model

- **Separate secrets + audience.** Admin access tokens are signed with
  `JWT_ADMIN_ACCESS_SECRET` and carry `aud: "admin"`. App tokens (`aud: "app"`,
  different secret) are rejected by `requireAdmin` before the DB is even hit.
- **DB re-check on every admin request.** `requireAdmin` re-validates
  `role === 'admin'` and not banned/deleted from the DB — token claims are
  never trusted for the role.
- **MFA (TOTP, RFC 6238).** When `admin_credentials.mfa_enabled` is true,
  `POST /admin/auth/login` returns a 5-minute `aud: "admin-mfa"` pending token
  and **no session**. The session is issued only after
  `POST /admin/auth/mfa/verify` accepts the 6-digit code (±30s drift) or a
  single-use recovery code (10 generated, stored as bcrypt hashes).
- **Lockout.** 5 failed attempts (password or MFA step) → 15-minute DB lock
  (`failed_login_attempts`, `locked_until`). Works even for bootstrap admins
  created before MFA setup.
- **Rate limits.** Login + MFA: 5/min per IP **and** per account. Refresh:
  30/min. Reads: 60/min. Mutations: 20/min (keyed by admin user, else IP).
- **Session length.** 30-min access token, 8-hour refresh (both env-tunable).
- **CSRF.** Not applicable — Bearer tokens only, no cookies. If cookie
  sessions are ever introduced, add `SameSite=Strict` or double-submit tokens.
- **CORS.** Comma-separated allow-list in `CORS_ORIGIN` (the admin dashboard
  origin), `credentials: true`. `*` is dev-only.

## Creating an admin

```bash
npm run admin:create -- --email admin@ping.app --password 'S3cret!!' --name 'Ayush'
```

Generates + encrypts the TOTP secret, enables MFA, prints the `otpauth://` URI
and 10 recovery codes **once**. No manual SQL. Requires `MFA_ENCRYPTION_KEY` in
`.env` (the server needs the same key to verify logins).

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/admin/auth/login` | email + password → `{mfa_required, mfa_token}` or session |
| POST | `/admin/auth/mfa/verify` | `{mfa_token, code}` → session |
| POST | `/admin/auth/refresh` | rotates the admin refresh token |
| POST | `/admin/auth/logout` | revokes the refresh token |
| GET | `/admin/users` | `?search&filter&sort&page&limit` (limit ≤ 100) |
| GET | `/admin/users/:id` | profile, photos, report counts, ban history (audit log) |
| POST | `/admin/users/:id/ban` | `{reason}` — idempotent |
| POST | `/admin/users/:id/unban` | idempotent |
| PATCH | `/admin/users/:id/verify` | `{verified}` |
| DELETE | `/admin/users/:id` | soft delete; purge job hard-deletes after retention |
| GET | `/admin/reports` | `?status&reason&page&limit` |
| GET | `/admin/reports/:id` | reporter, reported, prior report count |
| PATCH | `/admin/reports/:id` | `{status?, admin_note?}` |
| POST | `/admin/reports/:id/action` | bans reported user + closes report in **one transaction** |
| GET | `/admin/reports/:id/conversation` | only the linked conversation, cursor-paginated — **every read is audit-logged** |
| GET | `/admin/audit-log` | `?admin_id&target_type&target_id&action&from&to` |
| GET | `/admin/stats/overview` | cached 60s |
| GET | `/admin/stats/signups` / `/matches` | daily series, bucketed in Asia/Kolkata |

Error envelope: `{ status: "error", code, message }`; success:
`{ status: "success", message, data }`.

## Ban mechanics (what actually happens)

In **one transaction**: `users.is_banned/banned_at/banned_reason` set → every
live `refresh_tokens` row (both audiences) revoked → legacy
`users.refresh_token` cleared → `admin_audit_log` row written. After commit:
FCM device tokens deleted, all live sockets force-disconnected.

Enforcement in the main app:
- `auth.middleware` rejects banned users on every request (403).
- `/auth/refresh-token` refuses to mint tokens for banned/deleted accounts.
- Socket connect rejects banned users; live sockets are kicked on ban.
- **Banned users are never notified** (deliberate — harassment bans stay silent).

Admin and demo accounts cannot be banned/soft-deleted via these endpoints.

## Audit log

Append-only; every mutating admin action writes a row **in the same
transaction** as the action. Conversation reads are audited too. There are no
update/delete routes for it anywhere in the API.

## Stats rules

Every overview query excludes `is_demo` and `is_dummy` (matches require both
sides real; messages exclude demo/dummy senders). Day bucketing uses
`AT TIME ZONE '+05:30'` (Asia/Kolkata). "Active" = `last_active_at`, never
`updated_at`. Overview cached 60s in-process.

## Purge job

`startPurgeJob()` (server.js) daily: hard-deletes accounts soft-deleted
> `PURGE_RETENTION_DAYS` ago (default 30; admins never purged — the audit log
references them `ON DELETE RESTRICT`), and expired refresh tokens older than
7 days. Run manually with `npm run jobs:purge`. Disable with `RUN_PURGE_JOB=false`.

## Tests

```bash
npm run server &        # or npm run dev
npm run test:admin      # requireAdmin rejections, ban enforcement, lockout, reports flow
npm run test:e2e        # existing v1 app endpoint suite
```

## Ops checklist (not code)

- Use a separate staging DB/env — never develop against production.
- Put Cloudflare Access (or equivalent) in front of the admin dashboard and
  `/admin/*` API paths.
- Ship error monitoring (Sentry or similar) on admin routes; `errorHandler`
  already logs 5xx with request IDs via Pino.
- The TOTP secret is encrypted at rest, but `MFA_ENCRYPTION_KEY` lives in env —
  treat it like a signing secret (secret manager, rotation runbook).
