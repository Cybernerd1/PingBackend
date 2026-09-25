import { Router } from 'express';
import {
  getAllInterests,
  saveUserInterests,
  updateUserInterests,
  getUserInterests,
} from '../../controllers/v1/interests.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

// ── Public router: mounted at /api/v1/interests ────────────────────────
export const interestsCatalogueRouter = Router();

/**
 * @swagger
 * /v1/interests:
 *   get:
 *     summary: Fetch all available interests (public)
 *     tags: [Interests]
 *     responses:
 *       200:
 *         description: Interests catalogue
 */
interestsCatalogueRouter.get('/', getAllInterests);

// ── Authenticated router: mounted at /api/v1/users/interests ──────────
export const userInterestsRouter = Router();

userInterestsRouter.use(protect);

/**
 * @swagger
 * /v1/users/interests:
 *   post:
 *     summary: Save user selected interests (min 3)
 *     tags: [Interests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [interest_ids]
 *             properties:
 *               interest_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 minItems: 3
 *     responses:
 *       200:
 *         description: Interests saved
 *       400:
 *         description: Fewer than 3 interests provided
 */
userInterestsRouter.post('/', saveUserInterests);

/**
 * @swagger
 * /v1/users/interests:
 *   put:
 *     summary: Update user selected interests (replaces entire set)
 *     tags: [Interests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [interest_ids]
 *             properties:
 *               interest_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 minItems: 3
 *     responses:
 *       200:
 *         description: Interests updated
 */
userInterestsRouter.put('/', updateUserInterests);

/**
 * @swagger
 * /v1/users/interests:
 *   get:
 *     summary: Get user's selected interests
 *     tags: [Interests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User interests
 */
userInterestsRouter.get('/', getUserInterests);
