import { listEventsResponseSchema } from '@ticketvibe/shared';
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
import { DrizzleEventsRepository } from '../infra/drizzle-events-repository.js';

const ALL_EVENTS_BY_DATE = [
  'o-fantasma-da-opera',
  'derby-capital',
  'corpo-em-movimento',
  'standup-noite-de-verdades',
  'corrida-de-rua-sp',
  'pequeno-principe-musical',
  'neon-lights-world-tour',
  'sertaneja-rio',
  'cyberpunk-electronic-festival',
  'melhor-de-standup-grand-finale',
  'a-hora-e-a-vez',
  'festival-de-verao',
];

const FEATURED_EVENTS = [
  'o-fantasma-da-opera',
  'neon-lights-world-tour',
  'cyberpunk-electronic-festival',
];

const HOT_EVENTS = [
  'o-fantasma-da-opera',
  'derby-capital',
  'standup-noite-de-verdades',
  'neon-lights-world-tour',
  'sertaneja-rio',
  'cyberpunk-electronic-festival',
];

describe('GET /events (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({ eventsRepository: new DrizzleEventsRepository(testDb) });
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

  it('returns all 12 events sorted by start date', async () => {
    const response = await app.inject({ method: 'GET', url: '/events' });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual(ALL_EVENTS_BY_DATE);
  });

  it('returns only featured events for view=featured', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?view=featured',
    });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual(FEATURED_EVENTS);
  });

  it('returns only hot events for view=hot', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?view=hot',
    });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual(HOT_EVENTS);
  });

  it('keeps 12 events when fixtures are seeded again without reset', async () => {
    await seedFixtures(testDb);

    const response = await app.inject({ method: 'GET', url: '/events' });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual(ALL_EVENTS_BY_DATE);
  });
});
