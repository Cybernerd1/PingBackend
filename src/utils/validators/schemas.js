import { z } from 'zod';

// ── Auth schemas ────────────────────────────────────────────────────────

export const signupSchema = z.object({
  username: z
    .string({ required_error: 'username is required' })
    .min(3, 'username must be at least 3 characters')
    .max(100),
  preferred_challenge: z.enum(['EMAIL_OTP', 'SMS_OTP'], {
    required_error: 'preferred_challenge is required',
    invalid_type_error: 'preferred_challenge must be EMAIL_OTP or SMS_OTP',
  }),
});

export const verifyOtpSchema = z.object({
  username: z.string({ required_error: 'username is required' }),
  otp: z.string().optional(),
  challenge_name: z.string().optional(),
  session: z.string({ required_error: 'session (Firebase ID token) is required' }),
});

export const resendOtpSchema = z.object({
  username: z.string({ required_error: 'username is required' }),
});

export const loginSchema = z.object({
  username: z.string({ required_error: 'username is required' }),
  preferred_challenge: z.enum(['EMAIL_OTP', 'SMS_OTP'], {
    required_error: 'preferred_challenge is required',
  }),
});

export const verifyLoginOtpSchema = z.object({
  username: z.string({ required_error: 'username is required' }),
  session: z.string({ required_error: 'session is required' }),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string({ required_error: 'refresh_token is required' }),
});

export const googleCallbackSchema = z.object({
  id_token: z.string({ required_error: 'id_token is required' }),
});

// ── Interaction schemas ─────────────────────────────────────────────────

export const recordInteractionSchema = z.object({
  user_id: z.string({ required_error: 'user_id is required' }).uuid('user_id must be a valid UUID'),
  action: z.enum(['like', 'dislike'], {
    required_error: 'action is required',
    invalid_type_error: 'action must be "like" or "dislike"',
  }),
});

// ── Report schema ───────────────────────────────────────────────────────

export const reportUserSchema = z.object({
  reason: z.enum(
    ['spam', 'inappropriate_content', 'harassment', 'fake_profile', 'underage', 'hate_speech', 'other'],
    {
      required_error: 'reason is required',
      invalid_type_error: 'Invalid reason value',
    }
  ),
  details: z.string().max(1000).optional(),
});

// ── Profile schemas ─────────────────────────────────────────────────────

export const createProfileSchema = z.object({
  full_name: z.string({ required_error: 'full_name is required' }).min(1).max(100),
  birthdate: z.string({ required_error: 'birthdate is required' }).regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'birthdate must be YYYY-MM-DD format'
  ),
  gender: z.enum(['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'], {
    required_error: 'gender is required',
  }),
  bio: z.string().max(300).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
});

// ── Preferences schemas ─────────────────────────────────────────────────

export const savePreferencesSchema = z.object({
  interested_in: z
    .array(z.enum(['male', 'female', 'non-binary', 'everyone']))
    .min(1, 'interested_in must have at least 1 value'),
  min_age: z.number().int().min(18, 'min_age must be at least 18'),
  max_age: z.number().int().max(100, 'max_age must be at most 100'),
  max_distance_km: z.number().int().min(1, 'max_distance_km must be at least 1'),
}).refine((d) => d.min_age <= d.max_age, {
  message: 'min_age must not exceed max_age',
  path: ['min_age'],
});

// ── Privacy schemas ─────────────────────────────────────────────────────

export const privacySettingsSchema = z.object({
  show_distance: z.boolean().optional(),
  show_age: z.boolean().optional(),
  show_online_status: z.boolean().optional(),
  profile_visible_in_discover: z.boolean().optional(),
});

// ── Location schemas ────────────────────────────────────────────────────

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
