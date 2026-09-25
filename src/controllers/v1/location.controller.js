/**
 * Location controller — v1
 *
 * POST /api/v1/users/location/start → startLocationSharing
 * POST /api/v1/users/location/stop  → stopLocationSharing
 */

import { userRepository } from '../../db/repositories/user.repository.js';
import * as R from '../../utils/response.js';

// ── POST /api/v1/users/location/start ────────────────────────────────
export const startLocationSharing = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined)
      return R.validationError(res, 'latitude and longitude are required');

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90)
      return R.validationError(res, 'latitude must be between -90 and 90');

    if (isNaN(lng) || lng < -180 || lng > 180)
      return R.validationError(res, 'longitude must be between -180 and 180');

    await userRepository.update(req.user.id, {
      locationLat: lat,
      locationLng: lng,
      locationSharing: true,
    });

    return R.success(res, { sharing: true }, 'Location sharing started');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/users/location/stop ─────────────────────────────────
export const stopLocationSharing = async (req, res, next) => {
  try {
    await userRepository.update(req.user.id, { locationSharing: false });
    return R.success(res, { sharing: false }, 'Location sharing stopped');
  } catch (err) {
    next(err);
  }
};
