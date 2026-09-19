import { Router } from 'express';
import {
  saveProfile,
  checkUsername,
  uploadPhotos,
  reorderPhotos,
  deletePhoto,
} from '../controllers/onboarding.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { validateProfile } from '../middleware/validators/onboarding.validators.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Onboarding
 *   description: User onboarding flow (profile + photos)
 */

/**
 * @swagger
 * /onboarding/profile:
 *   post:
 *     summary: Save user profile (Step 1 of onboarding)
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, username, dateOfBirth, gender, interestedIn]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 50
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1998-05-14'
 *               gender:
 *                 type: string
 *                 enum: [man, woman, non-binary, other, prefer_not_to_say]
 *               interestedIn:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *                       enum: [men, women, non-binary, everyone]
 *               about:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Profile saved, onboardingStep set to 'photos'
 *       400:
 *         description: Validation error or username taken
 *       401:
 *         description: Unauthorized
 */
router.post('/profile', validateProfile, saveProfile);

/**
 * @swagger
 * /onboarding/check-username/{username}:
 *   get:
 *     summary: Check if a username is available
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Availability result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 */
router.get('/check-username/:username', checkUsername);

/**
 * @swagger
 * /onboarding/photos:
 *   post:
 *     summary: Upload profile photos (Step 2 of onboarding, min 3 max 6)
 *     tags: [Onboarding]
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
 *                 minItems: 3
 *                 maxItems: 6
 *     responses:
 *       200:
 *         description: Photos uploaded, onboarding completed
 *       400:
 *         description: Less than 3 photos provided
 */
router.post('/photos', upload.array('photos', 6), uploadPhotos);

/**
 * @swagger
 * /onboarding/photos/reorder:
 *   put:
 *     summary: Reorder profile photos
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photoOrders]
 *             properties:
 *               photoOrders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Photos reordered
 */
router.put('/photos/reorder', reorderPhotos);

/**
 * @swagger
 * /onboarding/photos/{publicId}:
 *   delete:
 *     summary: Delete a profile photo (must keep at least 3)
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cloudinary public ID of the photo
 *     responses:
 *       200:
 *         description: Photo deleted
 *       400:
 *         description: Cannot delete — minimum 3 photos required
 *       404:
 *         description: Photo not found
 */
router.delete('/photos/:publicId', deletePhoto);

export default router;
