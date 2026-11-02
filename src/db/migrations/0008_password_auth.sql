ALTER TYPE "public"."onboarding_step" ADD VALUE 'create_password' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;