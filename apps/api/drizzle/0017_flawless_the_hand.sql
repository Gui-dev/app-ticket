ALTER TABLE "orders" ADD COLUMN "transfer_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transfer_ref" text;