import type { Db } from './client.js';
import { categoryFixtures, eventFixtures, venueFixtures } from './fixtures.js';
import { categories, events, venues } from './schema.js';

export async function seedFixtures(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
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

    for (const fixture of eventFixtures) {
      const categoryId = categoryIds.get(fixture.categorySlug);
      const venueId = venueIds.get(fixture.venueSlug);
      if (!categoryId || !venueId) {
        throw new Error(
          `Missing category or venue for event "${fixture.slug}"`,
        );
      }
      await tx.insert(events).values({
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
      });
    }
  });
}
