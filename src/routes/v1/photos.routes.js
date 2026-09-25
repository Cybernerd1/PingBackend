import { Router } from 'express';
import {
  getPhotos,
  uploadPhotos,
  deletePhoto,
  setProfilePicture,
} from '../../controllers/v1/photos.controller.js';
import { protect } from '../../middleware/auth.middleware.js';
import { upload } from '../../middleware/upload.middleware.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * /v1/users/photos:
 *   get:
 *     summary: Fetch user's profile photos
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Photos list
 */
router.get('/', getPhotos);

/**
 * @swagger
 * /v1/users/photos:
 *   post:
 *     summary: Upload profile photo(s) (max 6 total)
 *     tags: [Photos]
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
 *         description: Photos uploaded
 *       400:
 *         description: Bad format/size or exceeds 6-photo limit
 */
router.post('/', upload.array('photos', 6), uploadPhotos);

/**
 * @swagger
 * /v1/users/photos:
 *   delete:
 *     summary: Delete a photo from gallery
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photo_id]
 *             properties:
 *               photo_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Photo deleted
 *       404:
 *         description: Photo not found
 */
router.delete('/', deletePhoto);

/**
 * @swagger
 * /v1/users/photos/profile-picture:
 *   put:
 *     summary: Set a photo as the main profile picture
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photo_id]
 *             properties:
 *               photo_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile picture updated
 *       404:
 *         description: Photo not found
 */
router.put('/profile-picture', setProfilePicture);

export default router;
