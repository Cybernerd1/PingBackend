-- Migration: Phase 2 & 3 Schema Updates
-- Generated for: Ping API v1
-- Date: 2026-09-25
--
-- Changes from Phase 1 baseline:
--   1. Create swipes table (if not exists)
--   2. Create matches table (if not exists)  
--   3. Add message_type, media_url, is_read to messages table
--   4. Add match_id, status_code, updated_at to conversations table
--   5. Add new enums: message_type, chat_status

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "swipe_direction" AS ENUM ('like', 'dislike');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "message_type" AS ENUM ('text', 'image', 'voice');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "message_status" AS ENUM ('sent', 'delivered', 'read');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "chat_status" AS ENUM ('active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Swipes ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "swipes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "swiper_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "swiped_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "direction" "swipe_direction" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "unique_swipe" UNIQUE ("swiper_id", "swiped_id")
);

CREATE INDEX IF NOT EXISTS "swipes_swiper_idx" ON "swipes" ("swiper_id");
CREATE INDEX IF NOT EXISTS "swipes_swiped_idx" ON "swipes" ("swiped_id");

-- ── Matches ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "matches" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_a_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_b_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "unique_match" UNIQUE ("user_a_id", "user_b_id")
);

CREATE INDEX IF NOT EXISTS "matches_user_a_idx" ON "matches" ("user_a_id");
CREATE INDEX IF NOT EXISTS "matches_user_b_idx" ON "matches" ("user_b_id");

-- ── Conversations: Add match_id + status_code + updated_at ────────────────

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "match_id" UUID REFERENCES "matches"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "status_code" "chat_status" NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "conversations_match_id_idx" ON "conversations" ("match_id");

-- ── Messages: Add message_type + media_url + is_read ──────────────────────

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "message_type" "message_type" NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS "media_url" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "is_read" BOOLEAN NOT NULL DEFAULT false;

-- Change content to allow empty string (for media-only messages)
ALTER TABLE "messages"
  ALTER COLUMN "content" SET DEFAULT '';
