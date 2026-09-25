/**
 * Safety controller — v1
 *
 * POST   /api/v1/users/:userId/report   → reportUser
 * POST   /api/v1/users/:userId/block    → blockUser
 * DELETE /api/v1/users/:userId/block    → unblockUser
 * GET    /api/v1/users/blocked          → getBlockedUsers
 */

import { safetyRepository } from '../../db/repositories/safety.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';
import * as R from '../../utils/response.js';

const VALID_REASONS = [
  'spam',
  'inappropriate_content',
  'harassment',
  'fake_profile',
  'underage',
  'hate_speech',
  'other',
];

// ── POST /api/v1/users/:userId/report ─────────────────────────────────
export const reportUser = async (req, res, next) => {
  try {
    const reporterId = req.user.id;
    const { userId: reportedId } = req.params;
    const { reason, details } = req.body;

    if (reporterId === reportedId)
      return R.validationError(res, 'You cannot report yourself');

    if (!reason || !VALID_REASONS.includes(reason))
      return R.validationError(
        res,
        `reason must be one of: ${VALID_REASONS.join(', ')}`
      );

    // Verify the target user exists
    const target = await userRepository.findById(reportedId);
    if (!target) return R.notFound(res, 'User not found');

    const report = await safetyRepository.createReport(
      reporterId,
      reportedId,
      reason,
      details || null
    );

    return R.success(
      res,
      { report_id: report.id, reported_at: report.createdAt },
      'User reported successfully'
    );
  } catch (error) {
    next(error);
  }
};

// ── POST /api/v1/users/:userId/block ──────────────────────────────────
export const blockUser = async (req, res, next) => {
  try {
    const blockerId = req.user.id;
    const { userId: blockedId } = req.params;

    if (blockerId === blockedId)
      return R.validationError(res, 'You cannot block yourself');

    const target = await userRepository.findById(blockedId);
    if (!target) return R.notFound(res, 'User not found');

    await safetyRepository.blockUser(blockerId, blockedId);

    return R.success(
      res,
      { blocked_user_id: blockedId },
      'User blocked. Any active match and chat have been archived.'
    );
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/v1/users/:userId/block ────────────────────────────────
export const unblockUser = async (req, res, next) => {
  try {
    const blockerId = req.user.id;
    const { userId: blockedId } = req.params;

    const deleted = await safetyRepository.unblockUser(blockerId, blockedId);

    if (!deleted)
      return R.notFound(res, 'Block not found — this user is not in your blocked list');

    return R.success(
      res,
      { unblocked_user_id: blockedId },
      'User unblocked successfully'
    );
  } catch (error) {
    next(error);
  }
};

// ── GET /api/v1/users/blocked ─────────────────────────────────────────
export const getBlockedUsers = async (req, res, next) => {
  try {
    const blockerId = req.user.id;
    const rows = await safetyRepository.getBlockedUsers(blockerId);

    const blocked = rows.map((r) => ({
      user_id: r.blockedId,
      full_name: r.fullName || r.username || 'Ping User',
      profile_picture: r.googleAvatar || null,
      blocked_at: r.blockedAt,
    }));

    return R.success(res, { blocked }, 'Blocked users fetched');
  } catch (error) {
    next(error);
  }
};
