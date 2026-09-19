CREATE TYPE "public"."gender" AS ENUM('man', 'woman', 'non-binary', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."interested_in" AS ENUM('men', 'women', 'non-binary', 'everyone');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('profile', 'photos', 'completed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_id" varchar(255),
	"email" varchar(255) NOT NULL,
	"password" varchar(255),
	"refresh_token" text,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"name" varchar(50),
	"username" varchar(20),
	"date_of_birth" date,
	"gender" "gender",
	"about" varchar(500),
	"interested_in" text[],
	"google_avatar" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_step" "onboarding_step" DEFAULT 'profile' NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"public_id" varchar(255) NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;