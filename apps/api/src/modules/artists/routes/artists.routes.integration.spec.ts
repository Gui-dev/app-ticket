import { artistDetailResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleCategoriesRepository } from '../../categories/infra/drizzle-categories-repository.js';
import { DrizzleEventsRepository } from '../../events/infra/drizzle-events-repository.js';
import { DrizzleArtistsRepository } from '../infra/drizzle-artists-repository.js';

describe('GET /artists/:slug (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
      artistsRepository: new DrizzleArtistsRepository(testDb),
      eventsRepository: new DrizzleEventsRepository(testDb),
      categoriesRepository: new DrizzleCategoriesRepository(testDb),
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
  });

  afterAll(async () => {
    await app.close();
    await testDb.$client.end();
  });

  it('returns the seeded artist with their events in date order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/artists/andrew-lloyd-webber',
    });

    expect(response.statusCode).toBe(200);
    const body = artistDetailResponseSchema.parse(response.json());
    expect(body.artist.name).toBe('Andrew Lloyd Webber');
    expect(body.artist.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
    ]);
    expect(body.artist.events[0]?.venue.slug).toBe('teatro-renault');
  });

  it('returns the multi-event artist with events in date order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/artists/comediantes-afiados',
    });

    expect(response.statusCode).toBe(200);
    const body = artistDetailResponseSchema.parse(response.json());
    expect(body.artist.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'melhor-de-standup-grand-finale',
    ]);
  });

  it('returns 404 for an artist that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/artists/desconhecido',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'artist_not_found' });
  });
});
