CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
UPDATE "events" e
SET "search_vector" = (
  setweight(to_tsvector('portuguese', unaccent(e."title")), 'A') ||
  setweight(to_tsvector('portuguese', unaccent(e."description")), 'B') ||
  setweight(to_tsvector('portuguese', unaccent(v."name" || ' ' || v."city")), 'C')
)
FROM "venues" v
WHERE v."id" = e."venue_id";--> statement-breakpoint
CREATE INDEX "events_search_vector_idx" ON "events" USING gin ("search_vector");