/**
 * create-admin — the ONLY supported way to create an admin account.
 * No manual SQL: this sets the role, hashes the password, generates and
 * encrypts the MFA secret, and prints single-use recovery codes once.
 *
 * Usage:
 *   npm run admin:create -- --email admin@ping.app --password 'S3cret!' [--name 'Ayush']
 *   (missing args are prompted for; password input is hidden)
 *
 * Requires in .env:
 *   DATABASE_URL        — staging/prod DB (never develop against prod)
 *   MFA_ENCRYPTION_KEY  — 32-byte hex (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
 *
 * Output:
 *   - otpauth:// URI → scan with Google Authenticator / Authy / 1Password
 *   - 10 recovery codes → shown ONCE, stored only as bcrypt hashes
 */
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// ── Env validation BEFORE any DB import ────────────────────────────────
if (!process.env.DATABASE_URL)
  die('DATABASE_URL is not set — run with: node --env-file=.env scripts/create-admin.mjs');

if (!process.env.MFA_ENCRYPTION_KEY)
  die(
    'MFA_ENCRYPTION_KEY is not set. Generate one:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'and add it to .env (the SAME key is required by the server to verify logins).'
  );

const { db, default: pool } = await import('../src/config/database.js');
const { users } = await import('../src/db/schema/users.js');
const { adminRepository } = await import('../src/db/repositories/admin.repository.js');
const {
  generateTotpSecret,
  encryptSecret,
  buildOtpauthUri,
  generateRecoveryCodes,
} = await import('../src/utils/totp.utils.js');

// ── Args + prompts ─────────────────────────────────────────────────────
const getArg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};

let email = getArg('--email');
let password = getArg('--password');
let name = getArg('--name');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

if (!email) email = await rl.question('Admin email: ');
if (!name) name = await rl.question('Display name (optional): ');

if (!password) {
  // Hidden input: mute output while typing
  const mutedRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  mutedRl.output.mute();
  password = await mutedRl.question('Password (input hidden): ');
  mutedRl.output.unmute();
  mutedRl.close();
}
rl.close();

email = email.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die(`"${email}" is not a valid email`);
if (password.length < 10) die('Password must be at least 10 characters');

// ── Upsert the admin user ──────────────────────────────────────────────
const passwordHash = await bcrypt.hash(password, 12);

const [existing] = await db.select({ id: users.id, role: users.role })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

let userId;
if (existing) {
  if (existing.role === 'admin' && !process.argv.includes('--force')) {
    die(`An admin with email ${email} already exists. Re-run with --force to reset it.`);
  }
  const [updated] = await db.update(users)
    .set({
      password: passwordHash,
      role: 'admin',
      isEmailVerified: true,
      isBanned: false,
      bannedAt: null,
      bannedReason: null,
      isAccountDeleted: false,
      isDeleted: false,
      ...(name ? { fullName: name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id))
    .returning({ id: users.id });
  userId = updated.id;
  console.log(`✓ Reset existing account ${email} → role=admin`);
} else {
  const [created] = await db.insert(users)
    .values({
      email,
      fullName: name || 'Ping Admin',
      password: passwordHash,
      role: 'admin',
      isEmailVerified: true,
      onboardingCompleted: true,
      onboardingStep: 'completed',
    })
    .returning({ id: users.id });
  userId = created.id;
  console.log(`✓ Created admin user ${email}`);
}

// ── MFA: generate secret + recovery codes, enable immediately ──────────
const secret = generateTotpSecret();
const recoveryCodes = generateRecoveryCodes(10);
const recoveryHashes = await Promise.all(
  recoveryCodes.map((c) => bcrypt.hash(c, 10))
);

await adminRepository.upsertCredentials(userId, {
  mfaSecretEncrypted: encryptSecret(secret),
  mfaEnabled: true,
  recoveryCodes: recoveryHashes,
  failedLoginAttempts: 0,
  lockedUntil: null,
});

console.log(`
✓ Admin ready — MFA is ENABLED. Everything below is shown ONCE.

  Email:         ${email}
  TOTP secret:   ${secret}

  Scan this URI with your authenticator app:
  ${buildOtpauthUri(email, secret)}

  Recovery codes (each single-use, stored only as bcrypt hashes):
${recoveryCodes.map((c) => `    ${c}`).join('\n')}

  Store these now (password manager). Closing this terminal loses them.
`);

await pool.end();
process.exit(0);

