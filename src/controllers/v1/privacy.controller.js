/**
 * Privacy settings controller — v1
 *
 * POST /api/v1/users/privacy/settings → createPrivacySettings
 * GET  /api/v1/users/privacy/settings → getPrivacySettings
 * PUT  /api/v1/users/privacy/settings → updatePrivacySettings
 */

import { privacyRepository } from '../../db/repositories/privacy.repository.js';
import * as R from '../../utils/response.js';

const toResponse = (row) => ({
  show_distance: row.showDistance,
  show_age: row.showAge,
  show_online_status: row.showOnlineStatus,
  profile_visible_in_discover: row.profileVisibleInDiscover,
});

// ── POST /api/v1/users/privacy/settings ──────────────────────────────
export const createPrivacySettings = async (req, res, next) => {
  try {
    const existing = await privacyRepository.findByUserId(req.user.id);
    if (existing) return R.conflict(res, 'Privacy settings already exist — use PUT to update');

    const { show_distance, show_age, show_online_status, profile_visible_in_discover } = req.body;

    const row = await privacyRepository.create({
      userId: req.user.id,
      showDistance: show_distance ?? true,
      showAge: show_age ?? true,
      showOnlineStatus: show_online_status ?? false,
      profileVisibleInDiscover: profile_visible_in_discover ?? true,
    });

    return R.success(res, toResponse(row), 'Privacy settings created');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/privacy/settings ───────────────────────────────
export const getPrivacySettings = async (req, res, next) => {
  try {
    const row = await privacyRepository.findByUserId(req.user.id);
    if (!row) return R.notFound(res, 'Privacy settings not found');
    return R.success(res, toResponse(row), 'Privacy settings fetched');
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/v1/users/privacy/settings ───────────────────────────────
export const updatePrivacySettings = async (req, res, next) => {
  try {
    const { show_distance, show_age, show_online_status, profile_visible_in_discover } = req.body;

    const updateData = {};
    if (show_distance !== undefined) updateData.showDistance = show_distance;
    if (show_age !== undefined) updateData.showAge = show_age;
    if (show_online_status !== undefined) updateData.showOnlineStatus = show_online_status;
    if (profile_visible_in_discover !== undefined)
      updateData.profileVisibleInDiscover = profile_visible_in_discover;

    if (Object.keys(updateData).length === 0)
      return R.validationError(res, 'No updatable fields provided');

    // Upsert — create if not exists
    let row = await privacyRepository.findByUserId(req.user.id);
    if (!row) {
      row = await privacyRepository.create({ userId: req.user.id, ...updateData });
    } else {
      row = await privacyRepository.update(req.user.id, updateData);
    }

    return R.success(res, toResponse(row), 'Privacy settings updated');
  } catch (err) {
    next(err);
  }
};
