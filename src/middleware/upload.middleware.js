import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from '../config/cloudinary.js';

// ─── Allowed MIME types ────────────────────────────────────────────────────
const IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const AUDIO_MIME = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac'];
const MEDIA_MIME = [...IMAGE_MIME, ...AUDIO_MIME];

// File filters
const imageFilter = (_req, file, cb) => {
  if (IMAGE_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(new Error('Only JPEG, PNG and WebP images are allowed.'), { statusCode: 400 }),
      false
    );
  }
};

const mediaFilter = (_req, file, cb) => {
  if (MEDIA_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(new Error('Only image (JPEG/PNG/WebP) and audio (MP3/OGG/AAC) files are allowed.'), { statusCode: 400 }),
      false
    );
  }
};

// ─── Cloudinary storage: user profile photos ─────────────────────────────
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'ping_user_photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
});

// ─── Cloudinary storage: profile avatar (face-cropped square) ────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'ping_avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face', quality: 'auto' }],
  },
});

// ─── Cloudinary storage: chat media (images + voice notes) ───────────────
const chatMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const isAudio = AUDIO_MIME.includes(file.mimetype);
    return {
      folder: 'ping_chat_media',
      resource_type: isAudio ? 'video' : 'image', // Cloudinary uses 'video' for audio
      allowed_formats: isAudio
        ? ['mp3', 'ogg', 'aac', 'm4a', 'webm']
        : ['jpg', 'jpeg', 'png', 'webp'],
      transformation: isAudio
        ? []
        : [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
    };
  },
});

const LIMITS = { fileSize: 20 * 1024 * 1024 }; // 20 MB max for voice notes

/** Multi-file upload (profile gallery) — up to 6 files */
export const upload = multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

/** Single-file upload (avatar only) */
export const uploadAvatar = multer({ storage: avatarStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

/** Single-file upload for chat media (image or voice note) */
export const uploadChatMedia = multer({ storage: chatMediaStorage, fileFilter: mediaFilter, limits: LIMITS });
