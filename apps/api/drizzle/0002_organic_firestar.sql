CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"price_from_cents" integer NOT NULL,
	CONSTRAINT "sectors_event_id_slug_unique" UNIQUE("event_id","slug")
);
--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;