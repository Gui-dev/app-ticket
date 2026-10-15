CREATE TABLE "seat_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "seat_rows_sector_id_label_unique" UNIQUE("sector_id","label")
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	CONSTRAINT "seats_row_id_label_unique" UNIQUE("row_id","label")
);
--> statement-breakpoint
ALTER TABLE "seat_rows" ADD CONSTRAINT "seat_rows_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_row_id_seat_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."seat_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seat_rows_sector_id_idx" ON "seat_rows" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "seats_row_id_idx" ON "seats" USING btree ("row_id");