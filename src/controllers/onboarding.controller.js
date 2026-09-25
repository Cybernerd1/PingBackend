import { validationResult } from 'express-validator';
import { userRepository } from '../db/repositories/user.repository.js';
import { photoRepository } from '../db/repositories/photo.repository.js';
import { cloudinary } from '../config/cloudinary.js';

// ─── Step 1: Save Profile ─────────────────────────────────────────────
export const saveProfile = async (req, res, next) => {
  try {
    console.log('[saveProfile] ── REQUEST ───────────────────────────────');
    console.log('[saveProfile] userId:', req.user?.id);
    console.log('[saveProfile] body:', JSON.stringify(req.body, null, 2));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errs = errors.array().map((e) => ({ field: e.path, message: e.msg }));
      console.warn('[saveProfile] Validation failed:', JSON.stringify(errs));
      return res.status(400).json({ success: false, errors: errs });
    }

    const { name, username, dateOfBirth, gender, interestedIn, about } = req.body;

    // Check username availability
    const taken = await userRepository.findByUsername(username, req.user.id);
    if (taken) {
      console.warn('[saveProfile] Username taken:', username);
      return res.status(409).json({
        success: false,
        message: 'Username is already taken',
      });
    }

    // Save profile → advance onboarding step to 'photos'
    const user = await userRepository.update(req.user.id, {
      name,
      username: username.toLowerCase(),
      dateOfBirth,
      gender,
      interestedIn: Array.isArray(interestedIn) ? interestedIn : [interestedIn],
      about,
      onboardingStep: 'photos',
      // Keep onboardingCompleted: false until photos are uploaded
    });

    console.log('[saveProfile] ── SUCCESS ───────────────────────────────');
    console.log('[saveProfile] updated user:', JSON.stringify({
      id: user?.id,
      username: user?.username,
      onboardingCompleted: user?.onboardingCompleted,
      onboardingStep: user?.onboardingStep,
    }, null, 2));

    res.status(200).json({
      success: true,
      message: 'Profile saved successfully',
      data: { user },
    });
  } catch (error) {
    console.error('[saveProfile] ERROR:', error.message);
    next(error);
  }
};

// ─── Check Username ───────────────────────────────────────────────────
export const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters',
      });
    }

    const exists = await userRepository.findByUsername(username, req.user.id);

    res.status(200).json({
      success: true,
      data: { available: !exists },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Step 2: Upload Photos ────────────────────────────────────────────
/**
 * Accepts 1–4 files via multipart/form-data field "photos".
 * photos[0] is treated as the profile/avatar photo.
 * Marks onboarding complete after successful upload.
 */
export const uploadPhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least 1 photo.',
      });
    }

    if (req.files.length > 4) {
      return res.status(400).json({
        success: false,
        message: 'You can upload at most 4 photos (1 profile + 3 additional).',
      });
    }

    const photoData = req.files.map((file) => ({
      url: file.path,
      publicId: file.filename,
    }));

    const savedPhotos = await photoRepository.replaceAll(req.user.id, photoData);

    const user = await userRepository.update(req.user.id, {
      onboardingStep: 'completed',
      onboardingCompleted: true,
    });

    res.status(200).json({
      success: true,
      message: 'Photos uploaded successfully',
      data: { user: { ...user, photos: savedPhotos } },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Reorder Photos ───────────────────────────────────────────────────
export const reorderPhotos = async (req, res, next) => {
  try {
    const { photoOrders } = req.body;

    if (!Array.isArray(photoOrders)) {
      return res.status(400).json({ success: false, message: 'Invalid data' });
    }

    await Promise.all(
      photoOrders.map(({ id, order }) => photoRepository.updateOrder(id, order))
    );

    const updatedPhotos = await photoRepository.findByUserId(req.user.id);

    res.status(200).json({
      success: true,
      data: { photos: updatedPhotos },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Delete Photo ─────────────────────────────────────────────────────
export const deletePhoto = async (req, res, next) => {
  try {
    const { publicId } = req.params;

    const photo = await photoRepository.findByPublicId(publicId, req.user.id);
    if (!photo) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Delete from DB and re-index
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