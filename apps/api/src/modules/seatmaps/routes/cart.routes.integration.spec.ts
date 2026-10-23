import { cartSchema } from '@ticketvibe/shared';
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

describe('cart routes (postgres + redis integration)', () => {
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

  const hold = async (seatLabel: string, userId = 'user-a') => {
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': userId },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel },
    });
    expect(response.statusCode).toBe(201);
  };

  it('requires a session on GET cart (401)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/nao-existe/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('stores the ticket type and prices the cart', async () => {
    await hold('6');
    const put = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(put.statusCode).toBe(200);

    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(cart.statusCode).toBe(200);
    const body = cartSchema.parse(cart.json());
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
      priceCents: 6000,
    });
    expect(body.totalCents).toBe(6000);
    expect(body.expiresAt).not.toBeNull();
  });

  it('defaults the ticket type to inteira', async () => {
    await hold('6');
    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    const body = cartSchema.parse(cart.json());
    expect(body.items[0].ticketType).toBe('inteira');
    expect(body.items[0].priceCents).toBe(12000);
  });

  it('prices vip at double', async () => {
    await hold('6');
    await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'vip',
      },
    });
    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    const body = cartSchema.parse(cart.json());
    expect(body.items[0].priceCents).toBe(24000);
    expect(body.totalCents).toBe(24000);
  });

  it('rejects a type change without an owned hold', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'hold_not_found' });
  });

  it('empties the cart when the holds expire', async () => {
    await hold('6');
    await testDb.execute(
      (await import('drizzle-orm')).sql`
        update seats set hold_expires_at = now() - interval '1 second'
        where hold_user_id = 'user-a'
      `,
    );
    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(cart.statusCode).toBe(200);
    const body = cartSchema.parse(cart.json());
    expect(body.items).toHaveLength(0);
    expect(body.expiresAt).toBeNull();
  });

  it('keeps carts isolated per user', async () => {
    await hold('6', 'user-a');
    const other = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-b' },
    });
    const body = cartSchema.parse(other.json());
    expect(body.items).toHaveLength(0);
  });
});
