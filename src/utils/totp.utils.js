/**
 * TOTP (RFC 6238) + MFA crypto helpers — zero new dependencies.
 *
 *  - base32 encode/decode (RFC 4648) for shared secrets
 *  - 6-digit / 30s TOTP generation + verification (HMAC-SHA1)
 *  - otpauth:// URI for authenticator apps (Google Authenticator, Authy, …)
 *  - AES-256-GCM envelope encryption for the TOTP secret at rest
 *    (key: MFA_ENCRYPTION_KEY env — 32-byte hex, or any string hashed once)
 *  - single-use recovery code generation (hashed with bcrypt by the caller)
 */
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ── Base32 ──────────────────────────────────────────────────────────────

export const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (str) => {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

// ── TOTP ────────────────────────────────────────────────────────────────

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

const hotp = (secretBuf, counter, digits = 6) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
};

/** Current 6-digit TOTP for a base32 secret (mainly for tests/debug). */
export const totpNow = (secret, { period = 30 } = {}) =>
  hotp(base32Decode(secret), Math.floor(Date.now() / 1000 / period));

/**
 * Verify a TOTP, allowing ±`window` steps of clock drift (default ±1 = ±30s).
 * Comparisons are constant-time per candidate.
 */
export const verifyTotp = (secret, code, { window = 1, period = 30, digits = 6 } = {}) => {
  if (typeof code !== 'string') return false;
  const normalized = code.replace(/\s/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(normalized)) return false;

  const secretBuf = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secretBuf, counter + i, digits);
    if (
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))
    ) {
      return true;
    }
  }
  return false;
};

export const buildOtpauthUri = (email, secret) =>
  `otpauth://totp/${encodeURIComponent(`Ping Admin:${email}`)}` +
  `?secret=${secret}&issuer=Ping&algorithm=SHA1&digits=6&period=30`;

// ── AES-256-GCM envelope encryption for the stored TOTP secret ──────────

const encryptionKey = () => {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MFA_ENCRYPTION_KEY is not set — required to store admin MFA secrets'
    );
  }
  // 64-char hex = 32 bytes; otherwise hash whatever was provided
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(String(raw)).digest();
};

/** "v1.<iv b64>.<tag b64>.<ciphertext b64>" */
export const encryptSecret = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
};

export const decryptSecret = (envelope) => {
  if (typeof envelope !== 'string') return null;
  const [version, ivB64, tagB64, ctB64] = envelope.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null; // wrong key or tampered envelope
  }
};

// ── Recovery codes ──────────────────────────────────────────────────────

/** 10 human-typable codes like "K7M2-9XQ4" (base32 alphabet, no 0/1/O/I). */
export const generateRecoveryCodes = (n = 10) =>
  Array.from({ length: n }, () => {
    const bytes = crypto.randomBytes(8);
    const chars = [...bytes]
      .map((b) => BASE32_ALPHABET[b % 32])
      .join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  });
