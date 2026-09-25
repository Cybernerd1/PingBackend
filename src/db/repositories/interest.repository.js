import { eq, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { interests, userInterests } from '../schema/interests.js';

export const interestRepository = {

  // All interests in the catalogue
  async findAll() {
    return db.select().from(interests).orderBy(interests.category, interests.name);
  },

  // Interests selected by a user
  async findByUserId(userId) {
    const rows = await db
      .select({ id: interests.id, name: interests.name, category: interests.category })
      .from(userInterests)
      .innerJoin(interests, eq(userInterests.interestId, interests.id))
      .where(eq(userInterests.userId, userId));
    return rows;
  },

  // Replace all interests for a user (atomic: delete old + insert new)
  async replaceUserInterests(userId, interestIds) {
    return await db.transaction(async (tx) => {
      // Remove all existing
      await tx.delete(userInterests).where(eq(userInterests.userId, userId));

      if (interestIds.length === 0) return [];

      // Insert new
      await tx.insert(userInterests).values(
        interestIds.map((interestId) => ({ userId, interestId }))
      );

      // Return the saved interest names
      return tx
        .select({ id: interests.id, name: interests.name, category: interests.category })
        .from(userInterests)
        .innerJoin(interests, eq(userInterests.interestId, interests.id))
        .where(eq(userInterests.userId, userId));
    });
  },

  // Seed: insert catalogue interests (idempotent — ignore conflicts)
  async seedInterests(catalogueItems) {
    for (const item of catalogueItems) {
      await db
        .insert(interests)
        .values(item)
        .onConflictDoNothing();
    }
  },
};
