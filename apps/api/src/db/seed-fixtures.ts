import { sql } from 'drizzle-orm';

import type { Db } from './client.js';
import {
  artistFixtures,
  categoryFixtures,
  eventArtistFixtures,
  eventFixtures,
  seatMapFixtures,
  sectorFixtures,
  venueFixtures,
} from './fixtures.js';
import {
  artists,
  categories,
  eventArtists,
  events,
  orderItems,
  orders,
  paymentEvents,
  seatRows,
  seats,
  sectors,
  venues,
} from './schema.js';

export async function seedFixtures(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(paymentEvents);
    await tx.delete(orderItems);
    await tx.delete(orders);
    await tx.delete(seats);
    await tx.delete(seatRows);
    await tx.delete(sectors);
    await tx.delete(eventArtists);
    await tx.delete(events);
    await tx.delete(artists);
    await tx.delete(venues);
    await tx.delete(categories);

    const insertedCategories = await tx
      .insert(categories)
      .values(categoryFixtures)
      .returning();
    const categoryIds = new Map(
      insertedCategories.map((row) => [row.slug, row.id]),
    );

    const insertedVenues = await tx
      .insert(venues)
      .values(venueFixtures)
      .returning();
    const venueIds = new Map(insertedVenues.map((row) => [row.slug, row.id]));
    const venueBySlug = new Map(venueFixtures.map((row) => [row.slug, row]));

    const eventIds = new Map<string, string>();
    for (const fixture of eventFixtures) {
      const categoryId = categoryIds.get(fixture.categorySlug);
      const venueId = venueIds.get(fixture.venueSlug);
      const venue = venueBySlug.get(fixture.venueSlug);
      if (!categoryId || !venueId || !venue) {
        throw new Error(
          `Missing category or venue for event "${fixture.slug}"`,
        );
      }
      const [insertedEvent] = await tx
        .insert(events)
        .values({
          slug: fixture.slug,
          title: fixture.title,
          description: fixture.description,
          categoryId,
          venueId,
          startsAt: new Date(fixture.startsAt),
          priceFromCents: fixture.priceFromCents,
          imageUrl: fixture.imageUrl,
          badgeLabel: fixture.badgeLabel,
          featured: fixture.featured,
          isHot: fixture.isHot,
          searchVector: sql`setweight(to_tsvector('portuguese', unaccent(${fixture.title})), 'A')
            || setweight(to_tsvector('portuguese', unaccent(${fixture.description})), 'B')
            || setweight(to_tsvector('portuguese', unaccent(${venue.name} || ' ' || ${venue.city})), 'C')`,
        })
        .returning({ id: events.id });
      eventIds.set(fixture.slug, insertedEvent.id);
    }

    const insertedArtists = await tx
      .insert(artists)
      .values(artistFixtures)
      .returning();
    const artistIds = new Map(insertedArtists.map((row) => [row.slug, row.id]));

    const eventArtistValues = eventArtistFixtures.map((fixture) => {
      const eventId = eventIds.get(fixture.eventSlug);
      const artistId = artistIds.get(fixture.artistSlug);
      if (!eventId || !artistId) {
        throw new Error(
          `Missing event or artist for link "${fixture.eventSlug}"→"${fixture.artistSlug}"`,
        );
      }
      return { eventId, artistId };
    });
    await tx.insert(eventArtists).values(eventArtistValues);

    const sectorValues = sectorFixtures.map((fixture) => {
      const eventId = eventIds.get(fixture.eventSlug);
      if (!eventId) {
        throw new Error(`Missing event for sector "${fixture.slug}"`);
      }
      return {
        eventId,
        slug: fixture.slug,
        name: fixture.name,
        priceFromCents: fixture.priceFromCents,
      };
    });
    const insertedSectors = await tx
      .insert(sectors)
      .values(sectorValues)
      .returning();
    const sectorIds = new Map(
      insertedSectors.map((row) => [`${row.eventId}:${row.slug}`, row.id]),
    );

    for (const fixture of seatMapFixtures) {
      const eventId = eventIds.get(fixture.eventSlug);
      const sectorId = eventId
        ? sectorIds.get(`${eventId}:${fixture.sectorSlug}`)
        : undefined;
      if (!sectorId) {
        throw new Error(
          `Missing sector for seat map "${fixture.eventSlug}"→"${fixture.sectorSlug}"`,
        );
      }
      for (const mark of fixture.marks ?? []) {
        const [rowLabel = '', seatNumber = ''] = mark.seat.split('-');
        const rowIndex = rowLabel.charCodeAt(0) - 65;
        const number = Number(seatNumber);
        if (
          rowIndex < 0 ||
          rowIndex >= fixture.rows ||
          number < 1 ||
          number > fixture.seatsPerRow
        ) {
          throw new Error(
            `Invalid seat mark "${mark.seat}" for "${fixture.eventSlug}"→"${fixture.sectorSlug}"`,
          );
        }
      }
      const marks = new Map(
        (fixture.marks ?? []).map((mark) => [mark.seat, mark.status]),
      );
      const insertedRows = await tx
        .insert(seatRows)
        .values(
          Array.from({ length: fixture.rows }, (_, index) => ({
            sectorId,
            label: String.fromCharCode(65 + index),
            position: index,
          })),
        )
        .returning();
      const seatValues = insertedRows.flatMap((row) =>
        Array.from({ length: fixture.seatsPerRow }, (_, index) => {
          const label = String(index + 1);
          return {
            rowId: row.id,
            label,
            position: index,
            status:
              marks.get(`${row.label}-${label}`) ?? ('available' as const),
          };
        }),
      );
      await tx.insert(seats).values(seatValues);
    }
  });
}
