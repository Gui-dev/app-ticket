import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from './client.js';
import { artists, eventArtists } from './schema.js';
import { seedFixtures } from './seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from './test-helpers.js';

describe('seedFixtures (postgres integration)', () => {
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  it('seeds artists linked to their events', async () => {
    const artistRows = await testDb.select().from(artists);
    expect(artistRows.map((row) => row.slug).sort()).toEqual([
      'andrew-lloyd-webber',
      'comédiantes-afiados',
    ]);

    const linkRows = await testDb
      .select({
        artistSlug: artists.slug,
        eventSlug:
          sql`(select slug from events where events.id = ${eventArtists.eventId})`.as(
            'event_slug',
          ),
      })
      .from(eventArtists)
      .innerJoin(artists, sql`${eventArtists.artistId} = ${artists.id}`);

    const links = linkRows.map((row) => `${row.artistSlug}:${row.eventSlug}`);
    expect(links.sort()).toEqual([
      'andrew-lloyd-webber:o-fantasma-da-opera',
      'comédiantes-afiados:melhor-de-standup-grand-finale',
      'comédiantes-afiados:standup-noite-de-verdades',
    ]);
  });
});
