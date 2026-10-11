import { sql } from 'drizzle-orm';

import type { Db } from './client.js';
import {
  categoryFixtures,
  eventFixtures,
  sectorFixtures,
  venueFixtures,
} from './fixtures.js';
import { categories, events, sectors, venues } from './schema.js';

export async function seedFixtures(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sectors);
    await tx.delete(events);
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
    await tx.insert(sectors).values(sectorValues);
  });
}
