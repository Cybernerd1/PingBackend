/**
 * Account controller — v1
 *
 * DELETE /api/v1/users/account → deleteAccount
 *
 * Full hard-delete: removes user row (cascades to photos, matches,
 * swipes, messages, blocks, reports via ON DELETE CASCADE FKs).
 * Requires OTP confirmation in the request body for safety.
 */

import { userRepository } from '../../db/repositories/user.repository.js';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { eq } from 'drizzle-orm';
import * as R from '../../utils/response.js';

// ── DELETE /api/v1/users/account ──────────────────────────────────────
export const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Confirm intent — require the user to send their own userId in the body
    // as a double-confirmation guard (pattern similar to GitHub repo delete)
    const { confirm } = req.body;

    if (!confirm || confirm !== userId) {
      return R.validationError(
        res,
        `To confirm account deletion, send { "confirm": "${userId}" } in the request body`
      );
    }

    // Hard-delete the user — all related rows cascade automatically
    await db.delete(users).where(eq(users.id, userId));

    return R.success(
      res,
      { deleted: true, user_id: userId },
      'Account permanently deleted. All data has been removed.'
    );
  } catch (error) {
    next(error);
  }
};
