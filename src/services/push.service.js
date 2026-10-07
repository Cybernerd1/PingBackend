/**
 * Push notifications via Firebase Cloud Messaging.
 *
 * Setup: `npm i firebase-admin` and set FIREBASE_SERVICE_ACCOUNT to the
 * service-account JSON (single line). Without it, pushes are skipped silently.
 * Device tokens live in the `device_tokens` table (created on first use).
 */
import pool from '../config/database.js';

let ready = null;
let messagingPromise = null;

const ensureTable = () => {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        token text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform varchar(20),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);
    `);
  }
  return ready;
};

const getMessaging = () => {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
      try {
        const admin = (await import('firebase-admin')).default;
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
          });
        }
        return admin.messaging();
      } catch (e) {
        console.error('[push] firebase-admin unavailable:', e.message);
        return null;
      }
    })();
  }
  return messagingPromise;
};

export const registerDeviceToken = async (userId, token, platform = 'android') => {
  await ensureTable();
  await pool.query(
    `INSERT INTO device_tokens (token, user_id, platform) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, platform = $3, updated_at = now()`,
    [token, userId, platform]
  );
};

export const removeDeviceToken = async (token) => {
  await ensureTable();
  await pool.query('DELETE FROM device_tokens WHERE token = $1', [token]);
};

/** Fire-and-forget push to every device of a user. Never throws. */
export const sendPushToUser = async (userId, { title, body, imageUrl, data = {} }) => {
  try {
    const messaging = await getMessaging();
    if (!messaging) return;
    await ensureTable();
    const { rows } = await pool.query('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
    if (!rows.length) return;
    const tokens = rows.map(r => r.token);
    const payloadData = { ...data, ...(imageUrl ? { avatar_url: imageUrl } : {}) };
    const res = await messaging.sendEachForMulticast({
      tokens,
      // Title is branded with the app name: "Ping · Name"
      notification: { title: `Ping · ${title}`, body, ...(imageUrl ? { imageUrl } : {}) },
      data: Object.fromEntries(Object.entries(payloadData).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: { color: '#7C3AED', ...(imageUrl ? { imageUrl } : {}) },
      },
    });
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        dead.push(tokens[i]);
      }
    });
    if (dead.length) await pool.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
  } catch (e) {
    console.error('[push] send failed:', e.message);
  }
};

export const getUserName = async (userId) => {
  const { rows } = await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
  return rows[0]?.full_name?.split(' ')[0] || 'Someone';
};

/** First name + first profile photo, for rich notifications. */
export const getUserCard = async (userId) => {
  const { rows } = await pool.query(
    `SELECT u.full_name,
            (SELECT url FROM photos p WHERE p.user_id = u.id ORDER BY p."order" ASC LIMIT 1) AS photo
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  return { name: rows[0]?.full_name?.split(' ')[0] || 'Someone', photo: rows[0]?.photo || null };
};
