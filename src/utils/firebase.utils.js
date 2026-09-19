/**
 * Firebase ID Token Verification Utility
 *
 * Verifies a Firebase-issued ID token using google-auth-library's OAuth2Client.
 * This validates the JWT signature against Google's public keys and checks:
 *   - Token is not expired
 *   - Token was issued by Firebase (iss = https://securetoken.google.com/<project>)
 *   - Token audience matches our Firebase Project ID
 *
 * No Firebase Admin SDK required — google-auth-library is lighter and sufficient.
 *
 * Key fix: verifySignedJwtWithCertsAsync requires an actual {kid: cert} object as the
 * second argument — passing null causes "Cannot convert undefined or null to object".
 * We fetch the certs from Google's JWKS endpoint first, then pass the populated object.
 */

import { OAuth2Client } from 'google-auth-library';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ping-67804';
const FIREBASE_ISS = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// OAuth2Client — used only for public key verification
const client = new OAuth2Client();

// ── In-memory cert cache ───────────────────────────────────────────────────────
// Google rotates Firebase signing keys every ~6 hours; we cache for 1 hour.
let _certCache = null;
let _certCacheExpiry = 0;

async function getFirebaseCerts() {
  const now = Date.now();
  if (_certCache && now < _certCacheExpiry) {
    return _certCache;
  }

  console.log('[firebase.utils] Fetching Firebase public key certs from Google...');
  const res = await fetch(CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase certs: HTTP ${res.status}`);
  }

  const certs = await res.json();

  // Cache for 1 hour
  _certCache = certs;
  _certCacheExpiry = now + 60 * 60 * 1000;
  console.log('[firebase.utils] Firebase certs cached. Keys:', Object.keys(certs));

  return certs;
}

// ── Verifier ──────────────────────────────────────────────────────────────────

/**
 * Verifies a Firebase ID token and returns the decoded payload.
 * Throws if the token is invalid, expired, or from the wrong project.
 *
 * @param {string} firebaseIdToken - The JWT from Firebase Auth getIdToken()
 * @returns {Promise<{uid, email, name, picture, emailVerified}>}
 */
export const verifyFirebaseIdToken = async (firebaseIdToken) => {
  // Fetch (or return cached) Google public key certs
  const certs = await getFirebaseCerts();

  // verifySignedJwtWithCertsAsync(jwt, certs, audience, issuers, maxExpiry?)
  // certs must be a non-null {kid: x509PemCert} object — NOT null or certsUrl.
  const ticket = await client.verifySignedJwtWithCertsAsync(
    firebaseIdToken,
    certs,               // ← populated {kid: cert} object
    [FIREBASE_PROJECT_ID],
    [FIREBASE_ISS],
  );

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Firebase token payload is empty after verification.');
  }

  return {
    uid: payload.sub,              // Firebase UID
    email: payload.email || null,
    name: payload.name || null,
    picture: payload.picture || null,
    emailVerified: payload.email_verified === true,
  };
};

