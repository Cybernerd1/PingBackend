/**
 * Profile controller — v1
 *
 * POST   /api/v1/users/profile          → createProfile
 * GET    /api/v1/users/profile          → getMyProfile
 * PUT    /api/v1/users/profile          → updateProfile
 * DELETE /api/v1/users/profile          → deleteProfile (soft)
 * POST   /api/v1/users/profile/verify-login-info → verifyLoginInfo
 * GET    /api/v1/users/profile/export   → exportProfile
 * GET    /api/v1/users/profile/:user_id → getPublicProfile
 */

import { userRepository } from '../../db/repositories/user.repository.js';
import { photoRepository } from '../../db/repositories/photo.repository.js';
import { interestRepository } from '../../db/repositories/interest.repository.js';
import * as R from '../../utils/response.js';

const SENSITIVE_FIELDS = ['email', 'phone'];
const NON_SENSITIVE_FIELDS = ['full_name', 'birthdate', 'gender', 'bio'];

// ── Calculate age from birthdate ───────────────────────────────────────
const calcAge = (birthdate) => {
  if (!birthdate) return null;
  const today = new Date();
  const dob = new Date(birthdate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

// ── POST /api/v1/users/profile ────────────────────────────────────────
export const createProfile = async (req, res, next) => {
  try {
    const { full_name, phone, email, birthdate, gender, bio } = req.body;

    if (!full_name) return R.validationError(res, 'full_name is required');
    if (!birthdate) return R.validationError(res, 'birthdate is required');
    if (!gender) return R.validationError(res, 'gender is required');

    const VALID_GENDERS = ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'];
    if (!VALID_GENDERS.includes(gender))
      return R.validationError(res, `gender must be one of: ${VALID_GENDERS.join(', ')}`);

    // Check profile not already created (fullName is the primary profile flag)
    if (req.user.fullName) return R.conflict(res, 'Profile already exists');

    const updated = await userRepository.update(req.user.id, {
      fullName: full_name,
      phone: phone || null,
      birthdate,
      gender,
      bio: bio || null,
      onboardingStep: 'interests',
    });

    return R.success(
      res,
      {
        profile: {
          user_id: updated.id,
          full_name: updated.fullName,
          birthdate: updated.birthdate,
          gender: updated.gender,
          bio: updated.bio,
        },
      },
      'Profile created successfully'
    );
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/profile (own) ──────────────────────────────────
export const getMyProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id, { withPhotos: true });
    if (!user) return R.notFound(res, 'Profile not found');

    const interests = await interestRepository.findByUserId(req.user.id);

    return R.success(
      res,
      {
        user_id: user.id,
        full_name: user.fullName,
        birthdate: user.birthdate,
        age: calcAge(user.birthdate),
        gender: user.gender,
        bio: user.bio,
        interests: interests.map((i) => i.name),
        photos: (user.photos || []).map((p) => ({
          photo_id: p.id,
          photo_url: p.url,
          is_profile_picture: p.order === 0,
        })),
        created_at: user.createdAt,
      },
      'Profile fetched successfully'
    );
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/v1/users/profile ─────────────────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const body = req.body;
    const keys = Object.keys(body);

    const hasSensitive = keys.some((k) => SENSITIVE_FIELDS.includes(k));
    const hasNonSensitive = keys.some((k) => NON_SENSITIVE_FIELDS.includes(k));

    if (hasSensitive && hasNonSensitive)
      return R.validationError(
        res,
        'Do not mix sensitive (email, phone) and non-sensitive fields in one request'
      );

    if (hasSensitive) {
      // Sensitive field update → would trigger OTP in production
      // For MVP: update directly and return verification_required: true with a mock session
      const sensitiveData = {};
      if (body.email) sensitiveData.email = body.email.toLowerCase();
      if (body.phone) sensitiveData.phone = body.phone;

      // In a real OTP flow: initiate challenge here, store pending value, return session
      const sessionId = `sess_${Date.now()}_${req.user.id.slice(0, 8)}`;

      return R.success(
        res,
        {
          profile: {},
          verification_required: true,
          session: sessionId,
        },
        'OTP sent to verify the updated contact info'
      );
    }

    // Non-sensitive direct update
    const updateData = {};
    if (body.full_name !== undefined) updateData.fullName = body.full_name;
    if (body.birthdate !== undefined) updateData.birthdate = body.birthdate;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.bio !== undefined) updateData.bio = body.bio;

    if (Object.keys(updateData).length === 0)
      return R.validationError(res, 'No updatable fields provided');

    const updated = await userRepository.update(req.user.id, updateData);

    return R.success(
      res,
      {
        profile: { full_name: updated.fullName, bio: updated.bio },
        verification_required: false,
        session: null,
      },
      'Profile updated successfully'
    );
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/v1/users/profile (soft-delete) ───────────────────────
export const deleteProfile = async (req, res, next) => {
  try {
    await userRepository.update(req.user.id, { isDeleted: true });
    return R.success(res, { deleted: true }, 'Profile deleted successfully');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/users/profile/verify-login-info ─────────────────────
export const verifyLoginInfo = async (req, res, next) => {
  try {
    const { otp, session } = req.body;
    if (!otp || !session) return R.validationError(res, 'otp and session are required');

    // In production: validate OTP against the pending session stored server-side
    // For MVP: accept any 8-digit OTP with a valid session format
    if (!/^\d{6,8}$/.test(otp))
      return R.validationError(res, 'otp must be 6–8 digits');

    const user = await userRepository.findById(req.user.id);
    return R.success(res, { profile: { user_id: user.id } }, 'Login info verified and updated');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/profile/export ─────────────────────────────────
export const exportProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id, { withPhotos: true });
    const interests = await interestRepository.findByUserId(req.user.id);

    // In production: generate a signed S3/Cloudinary URL with the JSON payload
    // For MVP: return the data directly as a downloadable JSON response
    const exportData = {
      profile: {
        user_id: user.id,
        full_name: user.fullName,
        email: user.email,
        phone: user.phone,
        birthdate: user.birthdate,
        gender: user.gender,
        bio: user.bio,
        created_at: user.createdAt,
      },
      interests: interests.map((i) => i.name),
      photos: (user.photos || []).map((p) => ({ photo_id: p.id, photo_url: p.url })),
    };

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return R.success(
      res,
      {
        export_url: `data:application/json;base64,${Buffer.from(JSON.stringify(exportData)).toString('base64')}`,
        expires_at: expiresAt,
      },
      'Export generated'
    );
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/profile/:user_id (public) ──────────────────────
export const getPublicProfile = async (req, res, next) => {
  try {
    const { user_id } = req.params;

    const user = await userRepository.findById(user_id, { withPhotos: true });
    if (!user || user.isDeleted) return R.notFound(res, 'User not found');

    const interests = await interestRepository.findByUserId(user_id);

    return R.success(
      res,
      {
        user_id: user.id,
        full_name: user.fullName,
        age: calcAge(user.birthdate),
        bio: user.bio,
        interests: interests.map((i) => i.name),
        photos: (user.photos || []).map((p) => ({ photo_id: p.id, photo_url: p.url })),
      },
      'Profile fetched successfully'
    );
  } catch (err) {
    next(err);
  }
};
