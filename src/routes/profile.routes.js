import { Router } from 'express';
import {
  getMyProfile,
  updateProfile,
  updatePhotos,
  deleteProfilePhoto,
} from '../controllers/profile.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: Authenticated user profile management
 */

/**
 * @swagger
 * /profile/me:
 *   get:
 *     summary: Get the current user's full profile (including photos)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile returned
 *       401:
 *         description: Unauthorized
 */
router.get('/me', getMyProfile);

/**
 * @swagger
 * /profile:
 *   patch:
 *     summary: Update editable profile fields (name, about, gender, interestedIn)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               about:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [man, woman, non-binary, other, prefer_not_to_say]
 *               interestedIn:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: No fields provided
 */
router.patch('/', updateProfile);

/**
 * @swagger
 * /profile/photos:
 *   post:
 *     summary: Upload/replace profile photos (1–4 images)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Photos updated
 *       400:
 *         description: Validation error
 */
router.post('/photos', upload.array('photos', 4), updatePhotos);

/**
 * @swagger
 * /profile/photos/{publicId}:
 *   delete:
 *     summary: Delete a single profile photo (min 1 must remain)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Photo deleted
 *       400:
 *         description: Cannot delete last photo
 *       404:
 *         description: Photo not found
 */
router.delete('/photos/:publicId', deleteProfilePhoto);

export default router;
