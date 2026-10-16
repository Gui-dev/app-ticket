ALTER TABLE "seats" ADD COLUMN "hold_user_id" text;--> statement-breakpoint
ALTER TABLE "seats" ADD COLUMN "hold_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_anonymous" boolean DEFAULT false;