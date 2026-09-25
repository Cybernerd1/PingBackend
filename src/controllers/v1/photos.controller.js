/**
 * Photos controller — v1
 *
 * GET    /api/v1/users/photos                  → getPhotos
 * POST   /api/v1/users/photos                  → uploadPhotos
 * DELETE /api/v1/users/photos                  → deletePhoto
 * PUT    /api/v1/users/photos/profile-picture  → setProfilePicture
 */

import { photoRepository } from '../../db/repositories/photo.repository.js';
import { cloudinary } from '../../config/cloudinary.js';
import * as R from '../../utils/response.js';

const MAX_PHOTOS = 6;

// ── GET /api/v1/users/photos ─────────────────────────────────────────
export const getPhotos = async (req, res, next) => {
  try {
    const photos = await photoRepository.findByUserId(req.user.id);
    return R.success(
      res,
      {
        photos: photos.map((p) => ({
          photo_id: p.id,
          photo_url: p.url,
          is_profile_picture: p.order === 0,
          order: p.order,
        })),
      },
      'Photos fetched'
    );
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/users/photos ─────────────────────────────────────────
export const uploadPhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0)
      return R.validationError(res, 'At least 1 photo is required');

    const existing = await photoRepository.findByUserId(req.user.id);
    if (existing.length + req.files.length > MAX_PHOTOS)
      return R.validationError(
        res,
        `Cannot exceed ${MAX_PHOTOS} photos. You already have ${existing.length}.`
      );

    const startOrder = existing.length;
    const photoData = req.files.map((file, i) => ({
      url: file.path,
      publicId: file.filename,
      order: startOrder + i,
    }));

    const saved = await photoRepository.insertMany(req.user.id, photoData);

    return R.success(
      res,
      { photos: saved.map((p) => ({ photo_id: p.id, photo_url: p.url })) },
      'Photos uploaded'
    );
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/v1/users/photos ───────────────────────────────────────
export const deletePhoto = async (req, res, next) => {
  try {
    const { photo_id } = req.body;
    if (!photo_id) return R.validationError(res, 'photo_id is required');

    const photo = await photoRepository.findById(photo_id, req.user.id);
    if (!photo) return R.notFound(res, 'Photo not found');

    // Delete from Cloudinary
    if (photo.publicId) {
      await cloudinary.uploader.destroy(photo.publicId);
    }

    await photoRepository.deleteById(photo_id, req.user.id);
    await photoRepository.reindexOrders(req.user.id);

    return R.success(res, { deleted: true }, 'Photo deleted');
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/v1/users/photos/profile-picture ─────────────────────────
export const setProfilePicture = async (req, res, next) => {
  try {
    const { photo_id } = req.body;
    if (!photo_id) return R.validationError(res, 'photo_id is required');

    const photo = await photoRepository.findById(photo_id, req.user.id);
    if (!photo) return R.notFound(res, 'Photo not found');

    // Set order=0 for selected photo, shift all others
    await photoRepository.setProfilePicture(photo_id, req.user.id);

    return R.success(res, { photo_id }, 'Profile picture updated');
  } catch (err) {
    next(err);
  }
};
