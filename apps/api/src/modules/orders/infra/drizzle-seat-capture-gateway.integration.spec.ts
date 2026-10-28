import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  events,
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
import { InMemorySeatAvailabilityBroker } from '../../seatmaps/infra/in-memory-seat-availability-broker.js';
import { DrizzleOrderRepository } from '../infra/drizzle-order-repository.js';
import { DrizzleSeatCaptureGateway } from '../infra/drizzle-seat-capture-gateway.js';

const EVENT_SLUG = 'o-fantasma-da-opera';

describe('cancelamento do pedido pago (postgres integration)', () => {
  let testDb: Db;
  let redis: RedisClient;
  let orderRepository: DrizzleOrderRepository;
  let gateway: DrizzleSeatCaptureGateway;
  let broker: InMemorySeatAvailabilityBroker;
  let eventId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await flushTestRedis();
    await testDb
      .insert(user)
      .values([{ id: 'user-a', name: 'User A', email: 'user-a@example.com' }]);
    const [event] = await testDb
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, EVENT_SLUG));
    eventId = event.id;

    orderRepository = new DrizzleOrderRepository(testDb);
    broker = new InMemorySeatAvailabilityBroker();
    gateway = new DrizzleSeatCaptureGateway(testDb, broker);
  });

  afterAll(async () => {
    await resetDatabase(testDb);
    await redis.quit();
    await testDb.$client.end();
  });

  const findSeat = async (seatLabel: string) => {
    const [seat] = await testDb
      .select({ seatId: seats.id, rowId: seats.rowId })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .where(
        and(
          eq(sectors.eventId, eventId),
          eq(sectors.slug, 'plateia'),
          eq(seatRows.label, 'A'),
          eq(seats.label, seatLabel),
        ),
      );
    if (!seat) throw new Error(`assento A-${seatLabel} não encontrado`);
    return seat;
  };

  const occupy = async (seatId: string) => {
    await testDb
      .update(seats)
      .set({ status: 'occupied', holdUserId: null, holdExpiresAt: null })
      .where(eq(seats.id, seatId));
  };

  const createOrder = async (input: {
    seatId: string;
    rowId: string;
    seatLabel: string;
  }) => {
    const order = await orderRepository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      buyerEmail: 'comprador@example.com',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [
        {
          seatId: input.seatId,
          rowId: input.rowId,
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: input.seatLabel,
          ticketType: 'inteira',
          priceCents: 12000,
        },
      ],
    });
    await orderRepository.setProviderRef({
      orderId: order.id,
      providerRef: 'pi_cancel',
    });
    return order;
  };

  const markPaid = async (orderId: string) => {
    await testDb
      .update(orders)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(orders.id, orderId));
  };

  const readSeat = async (seatId: string) => {
    const [seat] = await testDb
      .select()
      .from(seats)
      .where(eq(seats.id, seatId));
    return seat;
  };

  it('reembolsa o pedido pago e libera os assentos com deltas', async () => {
    const seat = await findSeat('6');
    const order = await createOrder({
      seatId: seat.seatId,
      rowId: seat.rowId,
      seatLabel: '6',
    });
    await occupy(seat.seatId);
    await markPaid(order.id);

    const result = await gateway.cancelPaidOrder({
      orderId: order.id,
      refundCents: 13200,
    });

    expect(result).toEqual({ kind: 'refunded' });
    const refunded = await orderRepository.findById(order.id);
    expect(refunded).toMatchObject({
      status: 'refunded',
      refundCents: 13200,
    });
    expect(await readSeat(seat.seatId)).toMatchObject({
      status: 'available',
      holdUserId: null,
    });
    expect(broker.published).toEqual([
      {
        eventSlug: EVENT_SLUG,
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        status: 'available',
      },
    ]);
  });

  it('recusa o cancelamento de um pedido não pago', async () => {
    const seat = await findSeat('7');
    const order = await createOrder({
      seatId: seat.seatId,
      rowId: seat.rowId,
      seatLabel: '7',
    });

    const result = await gateway.cancelPaidOrder({
      orderId: order.id,
      refundCents: 13200,
    });

    expect(result).toEqual({ kind: 'not_paid' });
    expect((await orderRepository.findById(order.id))?.refundCents).toBeNull();
    expect(broker.published).toEqual([]);
  });

  it('devolve not_paid para um pedido inexistente', async () => {
    const result = await gateway.cancelPaidOrder({
      orderId: '00000000-0000-4000-8000-000000000000',
      refundCents: 1000,
    });
    expect(result).toEqual({ kind: 'not_paid' });
    expect(broker.published).toEqual([]);
  });
});
