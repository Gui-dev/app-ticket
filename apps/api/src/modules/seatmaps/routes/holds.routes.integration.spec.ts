import { holdResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  flushTestRedis,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import { InMemorySeatAvailabilityBroker } from '../../seatmaps/infra/in-memory-seat-availability-broker.js';
import { DrizzleSeatmapRepository } from '../infra/drizzle-seatmap-repository.js';
import { RedisCartRepository } from '../infra/redis-cart-repository.js';
import { RedisHoldRepository } from '../infra/redis-hold-repository.js';

describe('hold routes (postgres + redis integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;
  let redis: RedisClient;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    return { userId, role: 'buyer' };
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();

    app = buildApp({
      seatmapRepository: new DrizzleSeatmapRepository(
        testDb,
        new InMemorySeatAvailabilityBroker(),
      ),
      holdRepository: new RedisHoldRepository(redis),
      cartRepository: new RedisCartRepository(redis),
      getSession,
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await flushTestRedis();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
    await testDb.$client.end();
  });

  const holdPayload = {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
  };

  it('holds a seat and reflects it on the seatmap', async () => {
    const holdResponse = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(holdResponse.statusCode).toBe(201);
    const body = holdResponseSchema.parse(holdResponse.json());
    expect(body.hold).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
    });

    const renew = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(renew.statusCode).toBe(200);

    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(map.statusCode).toBe(200);
    const seatmapBody = map.json();
    expect(seatmapBody.holds).toHaveLength(1);
    const plateia = seatmapBody.seatmap.sectors.find(
      (sector: { slug: string }) => sector.slug === 'plateia',
    );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('occupied');

    const otherBuyer = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
      headers: { 'x-test-user-id': 'user-b' },
    });
    expect(otherBuyer.json().holds).toHaveLength(0);
  });

  it('lets exactly one of two concurrent buyers win the seat', async () => {
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/events/o-fantasma-da-opera/holds',
        headers: { 'x-test-user-id': 'user-a' },
        payload: holdPayload,
      }),
      app.inject({
        method: 'POST',
        url: '/events/o-fantasma-da-opera/holds',
        headers: { 'x-test-user-id': 'user-b' },
        payload: holdPayload,
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = first.statusCode === 201 ? first : second;
    const winnerBody = holdResponseSchema.parse(winner.json());
    expect(winnerBody.hold.seatLabel).toBe('6');

    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
    });
    const plateia = map
      .json()
      .seatmap.sectors.find(
        (sector: { slug: string }) => sector.slug === 'plateia',
      );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('occupied');
  });

  it('requires a session (401)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: holdPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('reports 404 kinds and seat_unavailable', async () => {
    const missingSeat = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '99' },
    });
    expect(missingSeat.statusCode).toBe(404);

    const missingEvent = await app.inject({
      method: 'POST',
      url: '/events/nao-existe/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(missingEvent.statusCode).toBe(404);

    const occupied = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { sectorSlug: 'plateia', rowLabel: 'B', seatLabel: '7' },
    });
    expect(occupied.statusCode).toBe(409);
    expect(occupied.json()).toEqual({ error: 'seat_unavailable' });
  });

  it('releases a hold back to available', async () => {
    await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    const release = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds/release',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(release.statusCode).toBe(200);

    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(map.json().holds).toHaveLength(0);
    const plateia = map
      .json()
      .seatmap.sectors.find(
        (sector: { slug: string }) => sector.slug === 'plateia',
      );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('available');
  });

  it('frees an expired hold at read time', async () => {
    await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    await testDb.execute(
      (await import('drizzle-orm')).sql`
        update seats set hold_expires_at = now() - interval '1 second'
        where hold_user_id = 'user-a'
      `,
    );
    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
    });
    const plateia = map
      .json()
      .seatmap.sectors.find(
        (sector: { slug: string }) => sector.slug === 'plateia',
      );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('available');
    expect(map.json().holds).toHaveLength(0);
  });

  it('caps the cart at 8 seats with 409 cart_limit', async () => {
    const labels = ['1', '3', '4', '5', '6', '8', '9', '10'];
    for (const seatLabel of labels) {
      const response = await app.inject({
        method: 'POST',
        url: '/events/o-fantasma-da-opera/holds',
        headers: { 'x-test-user-id': 'user-a' },
        payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel },
      });
      expect(response.statusCode).toBe(201);
    }
    const overflow = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '11' },
    });
    expect(overflow.statusCode).toBe(409);
    expect(overflow.json()).toEqual({ error: 'cart_limit' });
  });
});
