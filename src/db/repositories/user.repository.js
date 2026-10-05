import { eq, and, ne } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../schema/users.js';
import { photos } from '../schema/photos.js';
import bcrypt from 'bcryptjs';

// ── Helpers ────────────────────────────────────────────────────────────
const stripSensitive = (user) => {
  if (!user) return null;
  const { password, refreshToken, ...safe } = user;
  return safe;
};

const calculateAge = (birthdate) => {
  if (!birthdate) return null;
  const today = new Date();
  const dob = new Date(birthdate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

// ── Repository ─────────────────────────────────────────────────────────
export const userRepository = {

  // Find by ID (with optional photos)
  async findById(id, { withPhotos = false, withSensitive = false } = {}) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!result.length) return null;

    let user = result[0];

    if (withPhotos) {
      const userPhotos = await db
        .select()
        .from(photos)
        .where(eq(photos.userId, id))
        .orderBy(photos.order);
      user = { ...user, photos: userPhotos };
    }

    user.age = calculateAge(user.birthdate);
    return withSensitive ? user : stripSensitive(user);
  },

  // Find by email
  async findByEmail(email, { withSensitive = false } = {}) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!result.length) return null;
    return withSensitive ? result[0] : stripSensitive(result[0]);
  },

  // Find by Google ID
  async findByGoogleId(googleId) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId))
      .limit(1);

    return result[0] ?? null;
  },

  // Find by username
  async findByUsername(username, excludeId = null) {
    const conditions = [eq(users.username, username.toLowerCase())];
    if (excludeId) conditions.push(ne(users.id, excludeId));

    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...conditions))
      .limit(1);

    return result[0] ?? null;
  },

  // Create user — handles password hashing
  async create(data) {
    let hashedPassword = null;
    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 12);
    }

    const result = await db
      .insert(users)
      .values({
        ...data,
        email: data.email.toLowerCase(),
        password: hashedPassword,
      })
      .returning();

    return stripSensitive(result[0]);
  },

  // Update user (whitelist approach — data passed in must already be safe)
  async update(id, data) {
    const result = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return stripSensitive(result[0]);
  },

  // Update refresh token
  async updateRefreshToken(id, refreshToken) {
    await db
      .update(users)
      .set({ refreshToken, updatedAt: new Date() })
      .where(eq(users.id, id));
  },

  // Get refresh token (sensitive)
  async getRefreshToken(id) {
    const result = await db
      .select({ refreshToken: users.refreshToken })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0]?.refreshToken ?? null;
  },

  // Compare password
  async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },
};