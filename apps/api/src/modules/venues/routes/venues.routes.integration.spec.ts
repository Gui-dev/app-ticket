import { venueDetailResponseSchema } from '@ticketvibe/shared';
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
import { DrizzleVenuesRepository } from '../infra/drizzle-venues-repository.js';

describe('GET /venues/:slug (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
      venuesRepository: new DrizzleVenuesRepository(testDb),
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

  it('returns the seeded venue with their events in date order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/venues/teatro-renault',
    });

    expect(response.statusCode).toBe(200);
    const body = venueDetailResponseSchema.parse(response.json());
    expect(body.venue).toMatchObject({
      name: 'Teatro Renault',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(body.venue.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'pequeno-principe-musical',
      'a-hora-e-a-vez',
    ]);
  });

  it('returns 404 for a venue that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/venues/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'venue_not_found' });
  });
});
