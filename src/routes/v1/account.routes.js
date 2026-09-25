import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { deleteAccount } from '../../controllers/v1/account.controller.js';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Account
 *   description: Account management
 */

/**
 * @swagger
 * /v1/users/account:
 *   delete:
 *     summary: Permanently delete account (hard-delete)
 *     tags: [Account]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirm]
 *             properties:
 *               confirm:
 *                 type: string
 *                 format: uuid
 *                 description: Must equal your own user_id as confirmation
 *     responses:
 *       200:
 *         description: Account permanently deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     deleted:
 *                       type: boolean
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Missing or mismatched confirmation
 *       401:
 *         description: Unauthorized
 */
router.delete('/account', deleteAccount);

export default router;
