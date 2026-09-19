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
 */

import { OAuth2Client } from 'google-auth-library';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ping-67804';
const FIREBASE_ISS = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

// OAuth2Client with no clientId — used only for public key verification of ID tokens
const client = new OAuth2Client();

/**
 * Verifies a Firebase ID token and returns the decoded payload.
 * Throws if the token is invalid, expired, or from the wrong project.
 *
 * @param {string} firebaseIdToken - The JWT from Firebase Auth getIdToken()
 * @returns {Promise<{uid: string, email: string, name: string, picture: string, emailVerified: boolean}>}
 */
export const verifyFirebaseIdToken = async (firebaseIdToken) => {
  // Firebase ID tokens use Google's key endpoint for RS256 verification
  const CERTS_URL = `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`;

  // Use google-auth-library's low-level verifier which handles key fetching & caching
  const ticket = await client.verifySignedJwtWithCertsAsync(
    firebaseIdToken,
    null, // keys — null means fetch from certsUrl
    [FIREBASE_PROJECT_ID], // expected audience
    [FIREBASE_ISS], // expected issuer(s)
    CERTS_URL,
  );

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Firebase token payload is empty after verification.');
  }

  return {
    uid: payload.sub,              // Firebase UID (= Google UID for Google sign-in)
    email: payload.email || null,
    name: payload.name || null,
    picture: payload.picture || null,
    emailVerified: payload.email_verified === true,
  };
};
