import {
  bestSeatResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
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
import { DrizzleSeatmapRepository } from '../infra/drizzle-seatmap-repository.js';

describe('seatmap routes (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    app = buildApp({ seatmapRepository: new DrizzleSeatmapRepository(testDb) });
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

  it('returns the seatmap with rows and seat statuses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
    });

    expect(response.statusCode).toBe(200);
    const body = seatmapResponseSchema.parse(response.json());
    expect(body.seatmap.eventSlug).toBe('o-fantasma-da-opera');
    expect(body.seatmap.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);

    const plateia = body.seatmap.sectors[0];
    expect(plateia.priceFromCents).toBe(12000);
    expect(plateia.rows.map((row) => row.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
    ]);
    expect(plateia.rows[0].seats).toHaveLength(12);
    expect(
      plateia.rows[1].seats.find((seat) => seat.label === '7')?.status,
    ).toBe('occupied');
    expect(
      plateia.rows[7].seats.find((seat) => seat.label === '12')?.status,
    ).toBe('unavailable');
    const available = plateia.rows
      .flatMap((row) => row.seats)
      .filter((seat) => seat.status === 'available');
    expect(available).toHaveLength(91);
  });

  it('returns an empty seatmap for events without numbered sectors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/corrida-de-rua-sp/seatmap',
    });

    expect(response.statusCode).toBe(200);
    const body = seatmapResponseSchema.parse(response.json());
    expect(body.seatmap).toEqual({
      eventSlug: 'corrida-de-rua-sp',
      sectors: [],
    });
  });

  it('returns 404 for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/seatmap',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('returns the most central free seat of the first row', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body).toEqual({
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        priceFromCents: 12000,
      },
    });
  });

  it('skips occupied seats when picking the best seat', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat?sector=balcao',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body.seat.seatLabel).toBe('6');
  });

  it('returns 400 when the sector param is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_query');
  });

  it('returns 404 sector_not_found for an unknown sector', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat?sector=camarote',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'sector_not_found' });
  });

  it('returns 404 event_not_found for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('returns 404 no_available_seat for sectors without rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/corrida-de-rua-sp/best-seat?sector=km5',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'no_available_seat' });
  });
});
