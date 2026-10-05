import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { registerDeviceToken, removeDeviceToken } from '../services/push.service.js';
import * as R from '../utils/response.js';

const router = Router();
router.use(protect);

/**
 * @swagger
 * /v1/users/devices:
 *   post:
 *     summary: Register an FCM device token
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Unregister an FCM device token
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    if (!token || typeof token !== 'string') return R.validationError(res, 'token is required');
    await registerDeviceToken(req.user.id, token, platform);
    return R.success(res, { registered: true }, 'Device registered');
  } catch (e) {
    next(e);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    if (req.body?.token) await removeDeviceToken(req.body.token);
    return R.success(res, { registered: false }, 'Device removed');
  } catch (e) {
    next(e);
  }
});

export default router;
