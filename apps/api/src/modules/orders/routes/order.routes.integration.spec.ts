import { createOrderResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { orderItems, orders, user } from '../../../db/schema.js';
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
import { FakePaymentProvider } from '../../payments/infra/fake-payment-provider.js';
import { DrizzleSeatmapRepository } from '../../seatmaps/infra/drizzle-seatmap-repository.js';
import { RedisCartRepository } from '../../seatmaps/infra/redis-cart-repository.js';
import { RedisHoldRepository } from '../../seatmaps/infra/redis-hold-repository.js';
import { DrizzleOrderRepository } from '../infra/drizzle-order-repository.js';

const EVENT_SLUG = 'o-fantasma-da-opera';

describe('order routes (postgres + redis integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;
  let redis: RedisClient;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    return { userId };
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();

    app = buildApp({
      seatmapRepository: new DrizzleSeatmapRepository(testDb),
      holdRepository: new RedisHoldRepository(redis),
      cartRepository: new RedisCartRepository(redis),
      orderRepository: new DrizzleOrderRepository(testDb),
      paymentProvider: new FakePaymentProvider('whsec_test'),
      getSession,
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await flushTestRedis();
    await testDb.insert(user).values([
      { id: 'user-a', name: 'User A', email: 'user-a@example.com' },
      { id: 'user-b', name: 'User B', email: 'user-b@example.com' },
    ]);
  });

  afterAll(async () => {
    await resetDatabase(testDb);
    await app.close();
    await redis.quit();
    await testDb.$client.end();
  });

  const hold = async (seatLabel: string, userId = 'user-a') => {
    const response = await app.inject({
      method: 'POST',
      url: `/events/${EVENT_SLUG}/holds`,
      headers: { 'x-test-user-id': userId },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel },
    });
    expect(response.statusCode).toBe(201);
  };

  const setTicketType = async (
    seatLabel: string,
    ticketType: 'inteira' | 'meia',
  ) => {
    const response = await app.inject({
      method: 'PUT',
      url: `/events/${EVENT_SLUG}/cart/items`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel,
        ticketType,
      },
    });
    expect(response.statusCode).toBe(200);
  };

  const createOrder = async () =>
    app.inject({
      method: 'POST',
      url: `/events/${EVENT_SLUG}/orders`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'card' },
    });

  const holdTwoSeats = async () => {
    await hold('6');
    await hold('7');
    await setTicketType('6', 'meia');
  };

  it('cria o pedido com os totais corretos e persiste os itens', async () => {
    await holdTwoSeats();

    const response = await createOrder();

    expect(response.statusCode).toBe(201);
    const body = createOrderResponseSchema.parse(response.json());
    expect(body.order).toMatchObject({
      eventSlug: EVENT_SLUG,
      status: 'pending',
      paymentMethod: 'card',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      paidAt: null,
    });
    expect(body.payment.provider).toBe('fake');
    expect(body.payment.providerRef).toEqual(expect.any(String));

    const orderRows = await testDb.select().from(orders);
    expect(orderRows).toHaveLength(1);
    expect(orderRows[0]).toMatchObject({
      id: body.order.id,
      userId: 'user-a',
      provider: 'fake',
      providerRef: body.payment.providerRef,
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
    });

    const itemRows = await testDb.select().from(orderItems);
    expect(itemRows).toHaveLength(2);
    expect(
      itemRows.map((item) => [
        item.seatLabel,
        item.ticketType,
        item.priceCents,
      ]),
    ).toEqual([
      ['6', 'meia', 6000],
      ['7', 'inteira', 12000],
    ]);
  });

  it('reaproveita o pedido pendente no POST duplicado', async () => {
    await holdTwoSeats();

    const first = await createOrder();
    const second = await createOrder();

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstBody = createOrderResponseSchema.parse(first.json());
    const secondBody = createOrderResponseSchema.parse(second.json());
    expect(secondBody.order.id).toBe(firstBody.order.id);
    expect(secondBody.order.totalCents).toBe(19800);

    const orderRows = await testDb.select().from(orders);
    expect(orderRows).toHaveLength(1);
    expect(orderRows[0]?.id).toBe(firstBody.order.id);

    const itemRows = await testDb.select().from(orderItems);
    expect(itemRows).toHaveLength(2);
  });
});
