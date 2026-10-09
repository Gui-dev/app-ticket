import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

export const events = pgTable('events', {
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
});
