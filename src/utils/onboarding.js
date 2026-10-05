/**
 * Onboarding status sync.
 *
 * Discover only shows users with onboarding_completed = true, so this must be
 * recomputed whenever any of its inputs change (profile, interests, photos,
 * preferences). Call it after those writes — it is cheap (4 small queries).
 *
 * Complete = full_name + birthdate + gender + ≥3 interests + ≥1 photo + preferences row.
 */
import { eq, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users } from '../db/schema/users.js';
import { photos } from '../db/schema/photos.js';
import { userInterests } from '../db/schema/interests.js';
import { preferences } from '../db/schema/preferences.js';

export const MIN_INTERESTS = 3;
export const MIN_PHOTOS = 1;

export const computeOnboarding = async (userId) => {
  const [[user], [ic], [pc], [pref]] = await Promise.all([
    db
      .select({ fullName: users.fullName, birthdate: users.birthdate, gender: users.gender })
      .from(users)
      .where(eq(users.id, userId)),
    db.select({ n: count() }).from(userInterests).where(eq(userInterests.userId, userId)),
    db.select({ n: count() }).from(photos).where(eq(photos.userId, userId)),
    db.select({ id: preferences.id }).from(preferences).where(eq(preferences.userId, userId)),
  ]);

  if (!user) return { step: 'profile', completed: false };

  let step = 'completed';
  if (!user.fullName || !user.birthdate || !user.gender) step = 'profile';
  else if (Number(ic?.n ?? 0) < MIN_INTERESTS) step = 'interests';
  else if (Number(pc?.n ?? 0) < MIN_PHOTOS) step = 'photos';
  else if (!pref) step = 'preferences';

  return { step, completed: step === 'completed' };
};

/** Recompute and persist onboarding_step / onboarding_completed. Never throws. */
export const syncOnboardingStatus = async (userId) => {
  try {
    const status = await computeOnboarding(userId);
    await db
      .update(users)
      .set({ onboardingStep: status.step, onboardingCompleted: status.completed, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return status;
  } catch {
    return null;
  }
};
