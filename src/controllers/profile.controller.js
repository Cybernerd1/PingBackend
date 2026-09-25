import { userRepository } from '../db/repositories/user.repository.js';
import { photoRepository } from '../db/repositories/photo.repository.js';
import { cloudinary } from '../config/cloudinary.js';

// ─── GET /api/profile/me ──────────────────────────────────────────────
/**
 * Returns the current user's full profile including photos.
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const photos = await photoRepository.findByUserId(req.user.id);

    res.status(200).json({
      success: true,
      data: { user: { ...user, photos } },
    });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/profile ───────────────────────────────────────────────
/**
 * Update editable profile fields: name, about, gender, interestedIn.
 * Username is intentionally excluded post-onboarding.
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, about, gender, interestedIn } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (about !== undefined) updates.about = about.trim() || null;
    if (gender !== undefined) updates.gender = gender;
    if (interestedIn !== undefined) {
      updates.interestedIn = Array.isArray(interestedIn) ? interestedIn : [interestedIn];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const user = await userRepository.update(req.user.id, updates);
    const photos = await photoRepository.findByUserId(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: { ...user, photos } },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/profile/photos ─────────────────────────────────────────
/**
 * Add or replace photos for an already-onboarded user.
 * Replaces all existing photos.
 * Accepts 1–4 images.
 */
export const updatePhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Please upload at least 1 photo.' });
    }

    if (req.files.length > 4) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 4 photos allowed (1 profile + 3 additional).',
      });
    }

    // Delete old Cloudinary assets before replacing
    const existingPhotos = await photoRepository.findByUserId(req.user.id);
    await Promise.allSettled(
      existingPhotos.map((p) => cloudinary.uploader.destroy(p.publicId))
    );

    const photoData = req.files.map((file) => ({
      url: file.path,
      publicId: file.filename,
    }));

    const savedPhotos = await photoRepository.replaceAll(req.user.id, photoData);

    res.status(200).json({
      success: true,
      message: 'Photos updated successfully',
      data: { photos: savedPhotos },
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/profile/photos/:publicId ─────────────────────────────
/**
 * Remove a single photo. Minimum 1 photo must remain.
 */
export const deleteProfilePhoto = async (req, res, next) => {
  try {
    const { publicId } = req.params;

    const photoCount = await photoRepository.countByUserId(req.user.id);
    if (photoCount <= 1) {
      return res.status(400).json({
        success: false,
        message: 'You must keep at least 1 photo.',
      });
    }

    const photo = await photoRepository.findByPublicId(publicId, req.user.id);
    if (!photo) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    await cloudinary.uploader.destroy(publicId);
    await photoRepository.deleteByPublicId(publicId, req.user.id);
    await photoRepository.reindexOrders(req.user.id);

    const updatedPhotos = await photoRepository.findByUserId(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Photo deleted',
      data: { photos: updatedPhotos },
    });
  } catch (error) {
    next(error);
  }
};
