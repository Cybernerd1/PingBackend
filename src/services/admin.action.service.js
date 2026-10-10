/**
 * Admin action service — the mutation core behind the admin endpoints.
 *
 * Every action runs in ONE transaction: the state change, the session
 * revocations, and the audit row all commit together or not at all.
 * Socket disconnects and FCM token wipes happen after commit (best-effort,
 * non-transactional by nature).
 *
 * Deliberate policy: banned users are NEVER notified. A harassment ban in
 * particular must be silent from the target's perspective.
 */
import { db } from '../config/database.js';
import { users } from '../db/schema/users.js';
import { eq, and } from 'drizzle-orm';
import { adminRepository } from '../db/repositories/admin.repository.js';
import { writeAuditLog } from '../middleware/auditLog.middleware.js';
import { disconnectUser } from '../socket/index.js';

/**
 * Ban a user. Idempotent — banning an already-banned user is a no-op that
 * still lands in the audit log (marked as such).
 */
export const banUser = async ({ userId, reason, adminId, ip }) => {
  const result = await db.transaction(async (tx) => {
    // Conditional update: only flips when not already banned → idempotency
    const updated = await tx.update(users)
      .set({
        isBanned: true,
        bannedAt: new Date(),
        bannedReason: reason,
      })
      .where(and(eq(users.id, userId), eq(users.isBanned, false)))
      .returning({ id: users.id });

    const alreadyBanned = updated.length === 0;

    if (!alreadyBanned) {
      // Kill every live session: refresh_tokens table (both audiences)
      // plus the legacy single-session users.refresh_token column
      await adminRepository.revokeAllRefreshTokens(tx, userId);
      await adminRepository.clearLegacyRefreshToken(tx, userId);
    }

    await writeAuditLog(tx, {
      adminId,
      action: 'ban_user',
      targetType: 'user',
      targetId: userId,
      metadata: alreadyBanned ? { idempotent_no_op: true, reason } : { reason },
      ip,
    });

    return { alreadyBanned };
  });

  if (!result.alreadyBanned) {
    await adminRepository.deleteDeviceTokens(userId).catch(() => {});
    disconnectUser(userId);
  }
  return result;
};

/** Lift a ban. Idempotent, keeps audit trail (banned_at/banned_reason cleared). */
export const unbanUser = async ({ userId, adminId, ip }) => {
  return db.transaction(async (tx) => {
    const updated = await tx.update(users)
      .set({ isBanned: false, bannedAt: null, bannedReason: null })
      .where(and(eq(users.id, userId), eq(users.isBanned, true)))
      .returning({ id: users.id });

    const wasBanned = updated.length > 0;

    await writeAuditLog(tx, {
      adminId,
      action: 'unban_user',
      targetType: 'user',
      targetId: userId,
      metadata: wasBanned ? {} : { idempotent_no_op: true },
      ip,
    });

    return { wasBanned };
  });
};

/**
 * Soft-delete a user (admin-initiated). Marks both flags the app checks,
 * stamps deleted_at for the purge job, revokes sessions, wipes FCM tokens,
 * disconnects sockets. Admin accounts cannot be soft-deleted here.
 */
export const softDeleteUser = async ({ userId, reason, adminId, ip }) => {
  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select({ role: users.role, isDemo: users.isDemo })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target) return { notFound: true };
    if (target.role === 'admin') return { forbidden: true };
    if (target.isDemo) return { forbidden: true };

    const updated = await tx.update(users)
      .set({
        isDeleted: true,
        isAccountDeleted: true,
        deletedAt: new Date(),
        refreshToken: null,
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    await adminRepository.revokeAllRefreshTokens(tx, userId);

    await writeAuditLog(tx, {
      adminId,
      action: 'soft_delete_user',
      targetType: 'user',
      targetId: userId,
      metadata: { reason: reason ?? null },
      ip,
    });

    return { deleted: true };
  });

  if (result.deleted) {
    await adminRepository.deleteDeviceTokens(userId).catch(() => {});
    disconnectUser(userId);
  }
  return result;
};
