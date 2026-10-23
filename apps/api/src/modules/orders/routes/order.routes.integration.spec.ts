import {
  createOrderResponseSchema,
  orderListResponseSchema,
} from '@ticketvibe/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  events,
  orderItems,
  orders,
  seatRows,
  seats,
  sectors,
  user,
} from '../../../db/schema.js';
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
import { DrizzleEventsRepository } from '../../events/infra/drizzle-events-repository.js';
import { FakePaymentProvider } from '../../payments/infra/fake-payment-provider.js';
import { DrizzleSeatmapRepository } from '../../seatmaps/infra/drizzle-seatmap-repository.js';
import { InMemorySeatAvailabilityBroker } from '../../seatmaps/infra/in-memory-seat-availability-broker.js';
import { RedisCartRepository } from '../../seatmaps/infra/redis-cart-repository.js';
import { RedisHoldRepository } from '../../seatmaps/infra/redis-hold-repository.js';
import { DrizzleOrderRepository } from '../infra/drizzle-order-repository.js';
import { DrizzleSeatCaptureGateway } from '../infra/drizzle-seat-capture-gateway.js';
import { DrizzleTicketRepository } from '../infra/drizzle-ticket-repository.js';

const EVENT_SLUG = 'o-fantasma-da-opera';

describe('order routes (postgres + redis integration)', () => {
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
      eventsRepository: new DrizzleEventsRepository(testDb),
      orderRepository: new DrizzleOrderRepository(testDb),
      ticketRepository: new DrizzleTicketRepository(testDb),
      seatCaptureGateway: new DrizzleSeatCaptureGateway(
        testDb,
        new InMemorySeatAvailabilityBroker(),
      ),
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

  it('lista apenas os pedidos do usuário da sessão', async () => {
    const [event] = await testDb
      .select({ id: events.id, startsAt: events.startsAt })
      .from(events)
      .where(eq(events.slug, EVENT_SLUG));
    if (!event) throw new Error(`evento ${EVENT_SLUG} não encontrado`);

    const eventSeats = await testDb
      .select({ seatId: seats.id, rowId: seatRows.id, seatLabel: seats.label })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .where(
        and(
          eq(sectors.eventId, event.id),
          eq(sectors.slug, 'plateia'),
          eq(seatRows.label, 'A'),
        ),
      )
      .limit(2);
    if (eventSeats.length < 2) throw new Error('assentos insuficientes');

    const [newerOrder] = await testDb
      .insert(orders)
      .values({
        userId: 'user-a',
        eventId: event.id,
        status: 'expired',
        paymentMethod: 'card',
        provider: 'fake',
        subtotalCents: 18000,
        serviceFeeCents: 1800,
        totalCents: 19800,
        createdAt: new Date('2026-10-19T12:00:00.000Z'),
      })
      .returning({ id: orders.id });
    const [olderOrder] = await testDb
      .insert(orders)
      .values({
        userId: 'user-a',
        eventId: event.id,
        status: 'paid',
        paymentMethod: 'card',
        provider: 'fake',
        subtotalCents: 18000,
        serviceFeeCents: 1800,
        totalCents: 19800,
        paidAt: new Date('2026-10-18T12:05:00.000Z'),
        createdAt: new Date('2026-10-18T12:00:00.000Z'),
      })
      .returning({ id: orders.id });
    const [foreignOrder] = await testDb
      .insert(orders)
      .values({
        userId: 'user-b',
        eventId: event.id,
        paymentMethod: 'card',
        provider: 'fake',
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
        createdAt: new Date('2026-10-20T12:00:00.000Z'),
      })
      .returning({ id: orders.id });
    if (!newerOrder || !olderOrder || !foreignOrder) {
      throw new Error('pedidos não inseridos');
    }

    await testDb.insert(orderItems).values(
      eventSeats.map((seat, index) => {
        const ticketType: 'inteira' | 'meia' = index === 0 ? 'inteira' : 'meia';
        return {
          orderId: olderOrder.id,
          seatId: seat.seatId,
          rowId: seat.rowId,
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: seat.seatLabel,
          ticketType,
          priceCents: index === 0 ? 12000 : 6000,
        };
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/orders',
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    const body = orderListResponseSchema.parse(response.json());
    expect(body.orders.map((order) => order.id)).toEqual([
      newerOrder.id,
      olderOrder.id,
    ]);
    expect(body.orders[0]).toMatchObject({
      eventSlug: EVENT_SLUG,
      eventTitle: 'O Fantasma da Ópera',
      eventStartsAt: event.startsAt.toISOString(),
      status: 'expired',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      itemCount: 0,
      createdAt: '2026-10-19T12:00:00.000Z',
    });
    expect(body.orders[1]).toMatchObject({
      status: 'paid',
      itemCount: 2,
      createdAt: '2026-10-18T12:00:00.000Z',
    });
    expect(body.orders.map((order) => order.id)).not.toContain(foreignOrder.id);
  });
});
