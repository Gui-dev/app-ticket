ALTER TABLE "events" ADD COLUMN "cancellation_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "refund_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_cents" integer;