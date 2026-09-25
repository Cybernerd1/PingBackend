import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { privacySettings } from '../schema/privacy.js';

export const privacyRepository = {

  async findByUserId(userId) {
    const rows = await db
      .select()
      .from(privacySettings)
      .where(eq(privacySettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(data) {
    const rows = await db.insert(privacySettings).values(data).returning();
    return rows[0];
  },

  async update(userId, data) {
    const rows = await db
      .update(privacySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(privacySettings.userId, userId))
      .returning();
    return rows[0];
  },
};
