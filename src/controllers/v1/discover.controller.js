/**
 * Discover controller — v1
 *
 * GET /api/v1/discover — returns filtered swipe-deck candidates
 *
 * Spec response shape:
 *   data.users = [{ user_id, full_name, age, bio, distance_km, interests, photos }]
 *
 * Filters (in order):
 *  1. Exclude self + soft-deleted + banned + account-deleted users
 *  2. Exclude already-swiped users
 *  3. Exclude active matches
 *  4. Gender preference filter
 *  5. Post-filter: age range + Haversine distance
 *
 * Query params:
 *  - limit  (default 20, max 50)
 */

import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { photos } from '../../db/schema/photos.js';
import { preferences } from '../../db/schema/preferences.js';
import { userInterests } from '../../db/schema/interests.js';
import { interests as interestsTable } from '../../db/schema/interests.js';
import { swipeRepository } from '../../db/repositories/swipe.repository.js';
import { matchRepository } from '../../db/repositories/match.repository.js';
import { eq, ne, and, not, inArray, or } from 'drizzle-orm';
import * as R from '../../utils/response.js';

// ── Haversine distance (km) ──────────────────────────────────────────────
const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Age from birthdate ────────────────────────────────────────────────────
const calcAge = (birthdate) => {
  if (!birthdate) return null;
  const today = new Date();
  const dob = new Date(birthdate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

// ── GET /api/v1/discover ──────────────────────────────────────────────────
export const getDiscoverStack = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // 1. Load current user's row + preferences
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, currentUserId));

    if (!currentUser) return R.notFound(res, 'User not found');

    const [prefs] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, currentUserId));

    // If discovery disabled, return empty deck
    if (prefs && prefs.discoveryEnabled === false) {
      return R.success(
        res,
        { users: [] },
        'Discovery is disabled in your preferences'
      );
    }

    // 2. Build exclusion list
    const [swipedIds, matchedIds] = await Promise.all([
      swipeRepository.getSwipedIds(currentUserId),
      matchRepository.getMatchedUserIds(currentUserId),
    ]);
    const excludeIds = [...new Set([currentUserId, ...swipedIds, ...matchedIds])];

    // 3. Base DB conditions
    const baseConditions = [
      ne(users.id, currentUserId),
      eq(users.onboardingCompleted, true),
      eq(users.isDeleted, false),
      eq(users.isBanned, false),
      eq(users.isAccountDeleted, false),
    ];

    if (excludeIds.length > 0) {
      baseConditions.push(not(inArray(users.id, excludeIds)));
    }

    // 4. Gender preference filter
    const interestedIn = prefs?.interestedIn ?? [];
    const hasGenderFilter =
      interestedIn.length > 0 && !interestedIn.includes('everyone');

    if (hasGenderFilter) {
      baseConditions.push(inArray(users.gender, interestedIn));
    }

    // 5. Overfetch candidates to allow post-filter by age/distance
    const overfetchLimit = limit * 5;
    const candidateRows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        birthdate: users.birthdate,
        gender: users.gender,
        bio: users.bio,
        googleAvatar: users.googleAvatar,
        locationLat: users.locationLat,
        locationLng: users.locationLng,
      })
      .from(users)
      .where(and(...baseConditions))
      .limit(overfetchLimit);

    if (candidateRows.length === 0) {
      return R.success(
        res,
        { users: [] },
        'No more candidates in your area'
      );
    }

    // 6. Post-filter: age range + distance
    const minAge = prefs?.minAge ?? 18;
    const maxAge = prefs?.maxAge ?? 99;
    const maxDistanceKm = prefs?.maxDistanceKm ?? 100;
    const hasLocation =
      currentUser.locationLat != null && currentUser.locationLng != null;

    const filtered = candidateRows
      .map((c) => {
        const age = calcAge(c.birthdate);
        const distanceKm =
          hasLocation && c.locationLat != null && c.locationLng != null
            ? haversine(
                currentUser.locationLat,
                currentUser.locationLng,
                c.locationLat,
                c.locationLng
              )
            : null;
        return { ...c, age, distanceKm };
      })
      .filter((c) => {
        if (c.age !== null && (c.age < minAge || c.age > maxAge)) return false;
        if (
          hasLocation &&
          c.distanceKm !== null &&
          c.distanceKm > maxDistanceKm
        )
          return false;
        return true;
      })
      .slice(0, limit);

    if (filtered.length === 0) {
      return R.success(res, { users: [] }, 'No candidates match your preferences');
    }

    const candidateIds = filtered.map((c) => c.id);

    // 7. Fetch photos for each candidate (order 0 = profile picture)
    const allPhotos =
      candidateIds.length > 0
        ? await db
            .select({
              userId: photos.userId,
              id: photos.id,
              url: photos.url,
              order: photos.order,
            })
            .from(photos)
            .where(inArray(photos.userId, candidateIds))
            .orderBy(photos.order)
        : [];

    const photosByUser = {};
    for (const ph of allPhotos) {
      if (!photosByUser[ph.userId]) photosByUser[ph.userId] = [];
      photosByUser[ph.userId].push({ photo_id: ph.id, photo_url: ph.url });
    }

    // 8. Fetch interests for each candidate
    const allInterests =
      candidateIds.length > 0
        ? await db
            .select({
              userId: userInterests.userId,
              name: interestsTable.name,
            })
            .from(userInterests)
            .innerJoin(
              interestsTable,
              eq(userInterests.interestId, interestsTable.id)
            )
            .where(inArray(userInterests.userId, candidateIds))
        : [];

    const interestsByUser = {};
    for (const row of allInterests) {
      if (!interestsByUser[row.userId]) interestsByUser[row.userId] = [];
      interestsByUser[row.userId].push(row.name);
    }

    // 9. Shape response — match spec field names exactly
    const usersPayload = filtered.map((c) => ({
      user_id: c.id,
      full_name: c.fullName || c.username || 'Ping User',
      age: c.age,
      bio: c.bio || null,
      distance_km:
        c.distanceKm !== null ? Math.round(c.distanceKm * 10) / 10 : null,
      interests: interestsByUser[c.id] || [],
      photos: photosByUser[c.id]?.length
        ? photosByUser[c.id]
        : c.googleAvatar
        ? [{ photo_id: null, photo_url: c.googleAvatar }]
        : [],
    }));

    return R.success(
      res,
      { users: usersPayload },
      'Nearby users fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};
