ALTER TABLE "tickets" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "validated_by" text;