-- pg_trgm powers the ILIKE '%term%' trigram indexes on users(full_name, email)
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."token_audience" AS ENUM('app', 'admin');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"audience" "token_audience" NOT NULL,
	"user_agent" varchar(500),
	"ip" varchar(45),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mfa_secret_encrypted" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "status" "report_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_admin_created_idx" ON "admin_audit_log" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "admin_audit_log" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "rt_user_audience_idx" ON "refresh_tokens" USING btree ("user_id","audience");--> statement-breakpoint
CREATE INDEX "rt_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_last_active_idx" ON "users" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "matches_created_at_idx" ON "matches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reported_idx" ON "reports" USING btree ("reported_id");