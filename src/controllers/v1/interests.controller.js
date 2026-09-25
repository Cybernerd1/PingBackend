/**
 * Interests controller — v1
 *
 * GET  /api/v1/interests        → getAllInterests (public)
 * POST /api/v1/users/interests  → saveUserInterests
 * PUT  /api/v1/users/interests  → updateUserInterests
 * GET  /api/v1/users/interests  → getUserInterests
 */

import { interestRepository } from '../../db/repositories/interest.repository.js';
import * as R from '../../utils/response.js';

// ── GET /api/v1/interests (public) ────────────────────────────────────
export const getAllInterests = async (req, res, next) => {
  try {
    const all = await interestRepository.findAll();
    return R.success(
      res,
      { interests: all.map((i) => ({ id: i.id, name: i.name, category: i.category })) },
      'Interests fetched successfully'
    );
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/users/interests ──────────────────────────────────────
export const saveUserInterests = async (req, res, next) => {
  try {
    const { interest_ids } = req.body;

    if (!Array.isArray(interest_ids) || interest_ids.length < 3)
      return R.validationError(res, 'interest_ids must be an array of at least 3 IDs');

    const saved = await interestRepository.replaceUserInterests(req.user.id, interest_ids);
    return R.success(res, { interests: saved.map((i) => i.name) }, 'Interests saved');
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/v1/users/interests ───────────────────────────────────────
export const updateUserInterests = async (req, res, next) => {
  try {
    const { interest_ids } = req.body;

    if (!Array.isArray(interest_ids) || interest_ids.length < 3)
      return R.validationError(res, 'interest_ids must be an array of at least 3 IDs');

    const updated = await interestRepository.replaceUserInterests(req.user.id, interest_ids);
    return R.success(res, { interests: updated.map((i) => i.name) }, 'Interests updated');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/interests ───────────────────────────────────────
export const getUserInterests = async (req, res, next) => {
  try {
    const interests = await interestRepository.findByUserId(req.user.id);
    return R.success(
      res,
      { interests: interests.map((i) => i.name) },
      'Interests fetched'
    );
  } catch (err) {
    next(err);
  }
};
