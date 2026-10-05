import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { photos } from '../schema/photos.js';

export const photoRepository = {

  async findByUserId(userId) {
    return db
      .select()
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(photos.order);
  },

  // Find by UUID id (spec uses photo_id)
  async findById(photoId, userId) {
    const result = await db
      .select()
      .from(photos)
      .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
      .limit(1);
    return result[0] ?? null;
  },

  // Legacy: find by Cloudinary publicId
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

  // Insert many photos (appends to existing, caller provides startOrder)
  async insertMany(userId, photoData) {
    const values = photoData.map((p) => ({
      userId,
      url: p.url,
      publicId: p.publicId,
      order: p.order ?? 0,
    }));
    return db.insert(photos).values(values).returning();
  },

  // Replace all photos for a user (used in legacy onboarding)
  async replaceAll(userId, photoData) {
    return db.transaction(async (tx) => {
      await tx.delete(photos).where(eq(photos.userId, userId));
      if (photoData.length === 0) return [];
      const values = photoData.map((p, index) => ({
        userId,
        url: p.url,
        publicId: p.publicId,
        order: index,
      }));
      return tx.insert(photos).values(values).returning();
    });
  },

  async updateOrder(id, order) {
    await db.update(photos).set({ order }).where(eq(photos.id, id));
  },

  // Delete by UUID photo_id (spec)
  async deleteById(photoId, userId) {
    const result = await db
      .delete(photos)
      .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
      .returning();
    return result[0] ?? null;
  },

  // Legacy: delete by Cloudinary publicId
  async deleteByPublicId(publicId, userId) {
    const result = await db
      .delete(photos)
      .where(and(eq(photos.publicId, publicId), eq(photos.userId, userId)))
      .returning();
    return result[0] ?? null;
  },

  // Set a photo as profile picture (order=0), push others up
  async setProfilePicture(photoId, userId) {
    return db.transaction(async (tx) => {
      // Get the target photo's current order
      const [target] = await tx
        .select()
        .from(photos)
        .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
        .limit(1);

      if (!target) return null;

      const targetOrder = target.order;

      // Shift all photos with order < targetOrder up by 1 (to fill the gap)
      await tx
        .update(photos)
        .set({ order: sql`${photos.order} + 1` })
        .where(and(eq(photos.userId, userId), sql`${photos.order} < ${targetOrder}`));

      // Set target photo to order 0
      await tx
        .update(photos)
        .set({ order: 0 })
        .where(eq(photos.id, photoId));
    });
  },

  // Re-index orders after deletion (compact 0..n-1)
  async reindexOrders(userId) {
    const userPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(photos.order);

    await Promise.all(
      userPhotos.map((photo, index) =>
        db.update(photos).set({ order: index }).where(eq(photos.id, photo.id))
      )
    );
  },
};