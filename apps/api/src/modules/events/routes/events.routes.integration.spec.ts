import {
  eventDetailResponseSchema,
  listCategoriesResponseSchema,
  listEventsResponseSchema,
} from '@ticketvibe/shared';
import { sql } from 'drizzle-orm';
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
    app = buildApp({
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

  it('stores a search vector for every seeded event', async () => {
    const { rows } = await testDb.$client.query(
      'select count(*)::int as missing from events where search_vector is null',
    );

    expect(rows[0].missing).toBe(0);
  });

  it('finds an event by accent-insensitive title term', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=opera',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
    ]);
  });

  it('finds events by venue name', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=teatro',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'pequeno-principe-musical',
      'a-hora-e-a-vez',
    ]);
  });

  it('matches all terms (AND) and returns nothing when a term is absent', async () => {
    const both = await app.inject({
      method: 'GET',
      url: '/events?q=fantasma%20opera',
    });
    const none = await app.inject({
      method: 'GET',
      url: '/events?q=fantasma%20cyberpunk',
    });

    expect(
      listEventsResponseSchema
        .parse(both.json())
        .events.map((event) => event.slug),
    ).toEqual(['o-fantasma-da-opera']);
    expect(listEventsResponseSchema.parse(none.json()).events).toEqual([]);
  });

  it('filters by category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?category=festivais',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'cyberpunk-electronic-festival',
      'festival-de-verao',
    ]);
  });

  it('filters by state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?state=RJ',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'sertaneja-rio',
      'festival-de-verao',
    ]);
  });

  it('filters by date range (inclusive, UTC days)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?from=2026-11-01&to=2026-11-30',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'corrida-de-rua-sp',
      'pequeno-principe-musical',
      'neon-lights-world-tour',
      'sertaneja-rio',
    ]);
  });

  it('combines query and category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=stand&category=comedy',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'melhor-de-standup-grand-finale',
    ]);
  });

  it('returns nothing for an unknown term', async () => {
    const response = await app.inject({ method: 'GET', url: '/events?q=zzz' });

    expect(listEventsResponseSchema.parse(response.json()).events).toEqual([]);
  });
});

describe('GET /categories (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
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

  it('lists the seven seeded categories ordered by name', async () => {
    const response = await app.inject({ method: 'GET', url: '/categories' });

    expect(response.statusCode).toBe(200);
    const body = listCategoriesResponseSchema.parse(response.json());
    expect(body.categories.map((category) => category.slug)).toEqual([
      'comedy',
      'danca',
      'esportes',
      'festivais',
      'infantil',
      'shows',
      'teatro',
    ]);
  });
});

describe('GET /events/:slug (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
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

  it('returns the event with sectors ordered by price from the database', async () => {
    const { rows } = await testDb.$client.query<{ id: string }>(
      'select id from events where slug = $1',
      ['o-fantasma-da-opera'],
    );
    await testDb.$client.query(
      'insert into sectors (event_id, slug, name, price_from_cents) values ($1, $2, $3, $4)',
      [rows[0].id, 'antecamara', 'Antecâmara', 12000],
    );
    await testDb.$client.query('analyze sectors');

    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera',
    });

    expect(response.statusCode).toBe(200);
    const body = eventDetailResponseSchema.parse(response.json());
    expect(body.event.slug).toBe('o-fantasma-da-opera');
    expect(body.event.priceFromCents).toBe(12000);
    expect(body.event.sectors).toEqual([
      { slug: 'antecamara', name: 'Antecâmara', priceFromCents: 12000 },
      { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 },
      { slug: 'balcao', name: 'Balcão', priceFromCents: 19000 },
    ]);
    expect(body.event.artists).toEqual([
      { slug: 'andrew-lloyd-webber', name: 'Andrew Lloyd Webber' },
    ]);
    expect(body.event.venue.slug).toBe('teatro-renault');
  });

  it('returns 404 for an unknown slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});

describe('GET /events/suggest (integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
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

  it('ranks FTS matches and limits events to five', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/events/suggest?q=${encodeURIComponent('São Paulo')}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(5);
    expect(body.locations).toEqual([{ city: 'São Paulo', state: 'SP' }]);
  });

  it('ranks content matches above venue-only matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=teatro',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events.map((event: { slug: string }) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'a-hora-e-a-vez',
      'pequeno-principe-musical',
    ]);
  });

  it('matches city text in venue content for event titles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=fantasma',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events.map((event: { slug: string }) => event.slug)).toEqual([
      'o-fantasma-da-opera',
    ]);
    expect(body.locations).toEqual([]);
  });

  it('suggests locations only for venues that still have events', async () => {
    await testDb.execute(
      sql`DELETE FROM sectors WHERE event_id IN (SELECT id FROM events WHERE venue_id = (SELECT id FROM venues WHERE name = 'Vivo Rio'))`,
    );
    await testDb.execute(
      sql`DELETE FROM events WHERE venue_id = (SELECT id FROM venues WHERE name = 'Vivo Rio')`,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=rio',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.locations).toEqual([]);
    expect(body.events).toEqual([]);
  });

  it('returns empty results for an unknown term', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=zzzzzzzz',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ events: [], locations: [] });
  });

  it('returns 400 invalid_query for a missing query', async () => {
    const res = await app.inject({ method: 'GET', url: '/events/suggest' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_query');
  });
});
