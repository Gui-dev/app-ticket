import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

export const artists = pgTable('artists', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
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

export const eventArtists = pgTable(
  'event_artists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id),
  },
  (table) => [
    unique('event_artists_event_id_artist_id_unique').on(
      table.eventId,
      table.artistId,
    ),
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

export const seatRows = pgTable(
  'seat_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id),
    label: text('label').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    unique('seat_rows_sector_id_label_unique').on(table.sectorId, table.label),
    index('seat_rows_sector_id_idx').on(table.sectorId),
  ],
);

export const seats = pgTable(
  'seats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rowId: uuid('row_id')
      .notNull()
      .references(() => seatRows.id),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    status: text('status')
      .$type<'available' | 'occupied' | 'unavailable' | 'reserved'>()
      .notNull()
      .default('available'),
    holdUserId: text('hold_user_id'),
    holdExpiresAt: timestamp('hold_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    unique('seats_row_id_label_unique').on(table.rowId, table.label),
    index('seats_row_id_idx').on(table.rowId),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    status: text('status')
      .$type<'pending' | 'paid' | 'failed' | 'expired'>()
      .notNull()
      .default('pending'),
    paymentMethod: text('payment_method').$type<'card' | 'boleto'>().notNull(),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    subtotalCents: integer('subtotal_cents').notNull(),
    serviceFeeCents: integer('service_fee_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('orders_provider_ref_unique').on(table.providerRef),
    uniqueIndex('orders_pending_user_event_unique')
      .on(table.userId, table.eventId)
      .where(sql`status = 'pending'`),
    index('orders_user_id_idx').on(table.userId),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id')
      .notNull()
      .references(() => seats.id),
    rowId: uuid('row_id')
      .notNull()
      .references(() => seatRows.id),
    sectorSlug: text('sector_slug').notNull(),
    rowLabel: text('row_label').notNull(),
    seatLabel: text('seat_label').notNull(),
    ticketType: text('ticket_type')
      .$type<'inteira' | 'meia' | 'vip'>()
      .notNull(),
    priceCents: integer('price_cents').notNull(),
  },
  (table) => [
    uniqueIndex('order_items_order_seat_unique').on(
      table.orderId,
      table.seatId,
    ),
  ],
);

export const paymentEvents = pgTable('payment_events', {
  providerEventId: text('provider_event_id').primaryKey(),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  isAnonymous: boolean('is_anonymous').default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
