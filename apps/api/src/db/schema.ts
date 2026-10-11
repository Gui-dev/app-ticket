import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const venues = pgTable('venues', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    startsAt: timestamp('starts_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    priceFromCents: integer('price_from_cents').notNull(),
    imageUrl: text('image_url'),
    badgeLabel: text('badge_label'),
    featured: boolean('featured').notNull().default(false),
    isHot: boolean('is_hot').notNull().default(false),
    searchVector: tsvector('search_vector'),
  },
  (table) => [
    index('events_search_vector_idx').using('gin', table.searchVector),
  ],
);

export const sectors = pgTable(
  'sectors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    priceFromCents: integer('price_from_cents').notNull(),
  },
  (table) => [
    unique('sectors_event_id_slug_unique').on(table.eventId, table.slug),
  ],
);
