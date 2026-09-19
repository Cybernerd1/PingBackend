import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { photos } from '../schema/photos.js';

export const photoRepository = {

  async findByUserId(userId) {
    return await db
      .select()
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(photos.order);
  },

  async findByPublicId(publicId, userId) {
    const result = await db
      .select()
      .from(photos)
      .where(and(eq(photos.publicId, publicId), eq(photos.userId, userId)))
      .limit(1);

    return result[0] ?? null;
  },

  async countByUserId(userId) {
    const result = await db
      .select({ count: photos.id })
      .from(photos)
      .where(eq(photos.userId, userId));

    return result.length;
  },

  // Insert many photos at once
  async insertMany(userId, photoData) {
    const values = photoData.map((p, index) => ({
      userId,
      url: p.url,
      publicId: p.publicId,
      order: index,
    }));

    return await db.insert(photos).values(values).returning();
  },

  // Replace all photos for a user
  async replaceAll(userId, photoData) {
    return await db.transaction(async (tx) => {
      // Delete existing
      await tx.delete(photos).where(eq(photos.userId, userId));

      // Insert new
      if (photoData.length === 0) return [];

      const values = photoData.map((p, index) => ({
        userId,
        url: p.url,
        publicId: p.publicId,
        order: index,
      }));

      return await tx.insert(photos).values(values).returning();
    });
  },

  async updateOrder(id, order) {
    await db
      .update(photos)
      .set({ order })
      .where(eq(photos.id, id));
  },

  async deleteByPublicId(publicId, userId) {
    const result = await db
      .delete(photos)
      .where(and(eq(photos.publicId, publicId), eq(photos.userId, userId)))
      .returning();

    return result[0] ?? null;
  },

  // Re-index orders after deletion
  async reindexOrders(userId) {
    const userPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(photos.order);

    await Promise.all(
      userPhotos.map((photo, index) =>
        db
          .update(photos)
          .set({ order: index })
          .where(eq(photos.id, photo.id))
      )
    );
  },
};