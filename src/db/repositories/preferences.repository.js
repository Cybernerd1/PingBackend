import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { preferences } from '../schema/preferences.js';

export const preferencesRepository = {

  async findByUserId(userId) {
    const rows = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(data) {
    const rows = await db.insert(preferences).values(data).returning();
    return rows[0];
  },

  async update(userId, data) {
    const rows = await db
      .update(preferences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(preferences.userId, userId))
      .returning();
    return rows[0];
  },
};
