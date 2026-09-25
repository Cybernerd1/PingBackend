/**
 * Preferences controller — v1
 *
 * POST /api/v1/users/preferences → savePreferences
 * GET  /api/v1/users/preferences → getPreferences
 * PUT  /api/v1/users/preferences → updatePreferences
 */

import { preferencesRepository } from '../../db/repositories/preferences.repository.js';
import * as R from '../../utils/response.js';

const VALID_GENDERS = ['male', 'female', 'non-binary', 'everyone'];

// ── POST /api/v1/users/preferences ───────────────────────────────────
export const savePreferences = async (req, res, next) => {
  try {
    const { interested_in, min_age, max_age, max_distance_km } = req.body;

    if (!Array.isArray(interested_in) || interested_in.length === 0)
      return R.validationError(res, 'interested_in must be a non-empty array');

    const invalidGender = interested_in.find((g) => !VALID_GENDERS.includes(g));
    if (invalidGender)
      return R.validationError(res, `Invalid gender value: ${invalidGender}. Must be one of: ${VALID_GENDERS.join(', ')}`);

    if (min_age < 18) return R.validationError(res, 'min_age must be at least 18');
    if (max_age > 100) return R.validationError(res, 'max_age must be at most 100');
    if (min_age > max_age) return R.validationError(res, 'min_age must not exceed max_age');

    // Check if prefs already exist → conflict
    const existing = await preferencesRepository.findByUserId(req.user.id);
    if (existing) return R.conflict(res, 'Preferences already exist — use PUT to update');

    const prefs = await preferencesRepository.create({
      userId: req.user.id,
      interestedIn: interested_in,
      minAge: min_age ?? 18,
      maxAge: max_age ?? 45,
      maxDistanceKm: max_distance_km ?? 50,
    });

    return R.success(res, { preferences: prefs }, 'Preferences saved');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/preferences ────────────────────────────────────
export const getPreferences = async (req, res, next) => {
  try {
    const prefs = await preferencesRepository.findByUserId(req.user.id);
    if (!prefs) return R.notFound(res, 'No preferences found — create them first with POST');

    return R.success(
      res,
      {
        interested_in: prefs.interestedIn,
        min_age: prefs.minAge,
        max_age: prefs.maxAge,
        max_distance_km: prefs.maxDistanceKm,
      },
      'Preferences fetched'
    );
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/v1/users/preferences ────────────────────────────────────
export const updatePreferences = async (req, res, next) => {
  try {
    const { interested_in, min_age, max_age, max_distance_km } = req.body;

    const updateData = {};

    if (interested_in !== undefined) {
      if (!Array.isArray(interested_in) || interested_in.length === 0)
        return R.validationError(res, 'interested_in must be a non-empty array');
      const invalidGender = interested_in.find((g) => !VALID_GENDERS.includes(g));
      if (invalidGender)
        return R.validationError(res, `Invalid gender: ${invalidGender}`);
      updateData.interestedIn = interested_in;
    }

    if (min_age !== undefined) {
      if (min_age < 18) return R.validationError(res, 'min_age must be at least 18');
      updateData.minAge = min_age;
    }

    if (max_age !== undefined) {
      if (max_age > 100) return R.validationError(res, 'max_age must be at most 100');
      updateData.maxAge = max_age;
    }

    if (max_distance_km !== undefined) {
      if (max_distance_km < 1) return R.validationError(res, 'max_distance_km must be at least 1');
      updateData.maxDistanceKm = max_distance_km;
    }

    if (Object.keys(updateData).length === 0)
      return R.validationError(res, 'No updatable fields provided');

    // Upsert — create if not exists
    let prefs = await preferencesRepository.findByUserId(req.user.id);
    if (!prefs) {
      prefs = await preferencesRepository.create({ userId: req.user.id, ...updateData });
    } else {
      prefs = await preferencesRepository.update(req.user.id, updateData);
    }

    return R.success(
      res,
      {
        interested_in: prefs.interestedIn,
        min_age: prefs.minAge,
        max_age: prefs.maxAge,
        max_distance_km: prefs.maxDistanceKm,
      },
      'Preferences updated'
    );
  } catch (err) {
    next(err);
  }
};
