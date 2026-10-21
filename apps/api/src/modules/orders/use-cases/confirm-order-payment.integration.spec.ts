import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import { events, seatRows, seats, sectors, user } from '../../../db/schema.js';
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
import { FakePaymentProvider } from '../../payments/infra/fake-payment-provider.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import { DrizzleSeatmapRepository } from '../../seatmaps/infra/drizzle-seatmap-repository.js';
import { RedisCartRepository } from '../../seatmaps/infra/redis-cart-repository.js';
import { RedisHoldRepository } from '../../seatmaps/infra/redis-hold-repository.js';
import { HoldSeatUseCase } from '../../seatmaps/use-cases/hold-seat.use-case.js';
import { DrizzleOrderRepository } from '../infra/drizzle-order-repository.js';
import { DrizzleSeatCaptureGateway } from '../infra/drizzle-seat-capture-gateway.js';
import { ConfirmOrderPaymentUseCase } from './confirm-order-payment.use-case.js';

const EVENT_SLUG = 'o-fantasma-da-opera';
const NOW = new Date('2026-10-18T12:00:00.000Z');

describe('confirmação do pagamento (postgres + redis integration)', () => {
  let testDb: Db;
  let redis: RedisClient;
  let orderRepository: DrizzleOrderRepository;
  let gateway: DrizzleSeatCaptureGateway;
  let holdRepository: RedisHoldRepository;
  let cartRepository: RedisCartRepository;
  let payments: FakePaymentProvider;
  let holdSeat: HoldSeatUseCase;
  let confirmOrderPayment: ConfirmOrderPaymentUseCase;
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
    await testDb.insert(user).values([
      { id: 'user-a', name: 'User A', email: 'user-a@example.com' },
      { id: 'user-b', name: 'User B', email: 'user-b@example.com' },
    ]);
    const [event] = await testDb
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, EVENT_SLUG));
    eventId = event.id;

    orderRepository = new DrizzleOrderRepository(testDb);
    gateway = new DrizzleSeatCaptureGateway(testDb);
    holdRepository = new RedisHoldRepository(redis);
    cartRepository = new RedisCartRepository(redis);
    payments = new FakePaymentProvider('whsec_test');
    holdSeat = new HoldSeatUseCase(
      new DrizzleSeatmapRepository(testDb),
      holdRepository,
      cartRepository,
      () => NOW,
    );
    confirmOrderPayment = new ConfirmOrderPaymentUseCase(
      orderRepository,
      gateway,
      payments,
      holdRepository,
      cartRepository,
      () => NOW,
    );
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

  const readSeat = async (seatId: string) => {
    const [seat] = await testDb
      .select()
      .from(seats)
      .where(eq(seats.id, seatId));
    return seat;
  };

  const readTickets = async (orderId: string) => {
    const result = await testDb.execute<{
      order_item_id: string;
      seat_id: string;
      code: string;
    }>(sql`
      select order_item_id, seat_id, code
      from tickets
      where order_id = ${orderId}
      order by seat_id
    `);
    return result.rows;
  };

  const reserve = async (seatId: string) => {
    await testDb
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: 'user-a',
        holdExpiresAt: new Date(NOW.getTime() + 60_000),
      })
      .where(eq(seats.id, seatId));
  };

  const hold = async (seatLabel: string, userId: string) => {
    const result = await holdSeat.execute({
      userId,
      eventSlug: EVENT_SLUG,
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel,
    });
    expect(result.kind).toBe('held');
  };

  const createOrder = async (input: {
    userId: string;
    seat: { seatId: string; rowId: string };
    seatLabel: string;
    providerRef: string;
  }) => {
    const created = await orderRepository.create({
      userId: input.userId,
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      buyerEmail: 'comprador@example.com',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [
        {
          seatId: input.seat.seatId,
          rowId: input.seat.rowId,
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
      orderId: created.id,
      providerRef: input.providerRef,
    });
    return created;
  };

  it('confirma o pagamento quando ele vence a expiração', async () => {
    const seat = await findSeat('6');
    await hold('6', 'user-a');
    const order = await createOrder({
      userId: 'user-a',
      seat,
      seatLabel: '6',
      providerRef: 'pi_ok',
    });

    const result = await confirmOrderPayment.execute({
      providerRef: 'pi_ok',
      amountCents: order.totalCents,
    });

    expect(result).toEqual({ kind: 'paid', orderId: order.id });
    expect(await readSeat(seat.seatId)).toMatchObject({
      status: 'occupied',
      holdUserId: null,
      holdExpiresAt: null,
    });
    const paid = await orderRepository.findById(order.id);
    expect(paid).toMatchObject({ status: 'paid' });
    expect(paid?.paidAt).toEqual(NOW);
    expect(payments.refundedRefs).toEqual([]);

    expect(await expireExpiredHolds(testDb)).toBe(0);
    expect(await readSeat(seat.seatId)).toMatchObject({ status: 'occupied' });
  });

  it('reembolsa e falha o pedido quando a expiração vence a corrida', async () => {
    const seat = await findSeat('6');
    await hold('6', 'user-a');
    const order = await createOrder({
      userId: 'user-a',
      seat,
      seatLabel: '6',
      providerRef: 'pi_late',
    });

    await testDb.execute(
      sql`update seats set hold_expires_at = now() - interval '1 second' where id = ${seat.seatId}`,
    );
    expect(await expireExpiredHolds(testDb)).toBe(1);

    const result = await confirmOrderPayment.execute({
      providerRef: 'pi_late',
      amountCents: order.totalCents,
    });

    expect(result).toEqual({ kind: 'refunded' });
    expect(payments.refundedRefs).toEqual(['pi_late']);
    expect(await readSeat(seat.seatId)).toMatchObject({
      status: 'available',
      holdUserId: null,
    });
    expect((await orderRepository.findById(order.id))?.status).toBe('failed');
  });

  it('nunca captura um assento reservado por outro usuário', async () => {
    const seat = await findSeat('7');
    await hold('7', 'user-b');
    await cartRepository.setType({
      userId: 'user-a',
      eventSlug: EVENT_SLUG,
      itemKey: 'plateia:A:7',
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    const order = await createOrder({
      userId: 'user-a',
      seat,
      seatLabel: '7',
      providerRef: 'pi_foreign',
    });

    const result = await confirmOrderPayment.execute({
      providerRef: 'pi_foreign',
      amountCents: order.totalCents,
    });

    expect(result).toEqual({ kind: 'refunded' });
    expect(payments.refundedRefs).toEqual(['pi_foreign']);
    expect(await readSeat(seat.seatId)).toMatchObject({
      status: 'reserved',
      holdUserId: 'user-b',
    });
    expect((await orderRepository.findById(order.id))?.status).toBe('failed');
    expect(await redis.exists(`cart:user-a:${EVENT_SLUG}`)).toBe(0);
    expect(await redis.get(holdSeatKey(eventId, seat.rowId, seat.seatId))).toBe(
      'user-b',
    );
  });

  it('emite um ingresso por item na captura e não duplica na reentrega', async () => {
    const seat6 = await findSeat('6');
    const seat7 = await findSeat('7');
    await reserve(seat6.seatId);
    await reserve(seat7.seatId);
    const order = await orderRepository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      buyerEmail: 'comprador@example.com',
      subtotalCents: 24000,
      serviceFeeCents: 2400,
      totalCents: 26400,
      items: [
        {
          seatId: seat6.seatId,
          rowId: seat6.rowId,
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'inteira',
          priceCents: 12000,
        },
        {
          seatId: seat7.seatId,
          rowId: seat7.rowId,
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: '7',
          ticketType: 'inteira',
          priceCents: 12000,
        },
      ],
    });
    await orderRepository.setProviderRef({
      orderId: order.id,
      providerRef: 'pi_tickets',
    });

    const result = await confirmOrderPayment.execute({
      providerRef: 'pi_tickets',
      amountCents: order.totalCents,
    });

    expect(result).toEqual({ kind: 'paid', orderId: order.id });
    const tickets = await readTickets(order.id);
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((ticket) => ticket.order_item_id)).size).toBe(2);
    expect(new Set(tickets.map((ticket) => ticket.seat_id)).size).toBe(2);
    expect(tickets.map((ticket) => ticket.seat_id).sort()).toEqual(
      [seat6.seatId, seat7.seatId].sort(),
    );
    expect(tickets.every((ticket) => ticket.code.length > 0)).toBe(true);
    expect(new Set(tickets.map((ticket) => ticket.code)).size).toBe(2);

    const redelivered = await confirmOrderPayment.execute({
      providerRef: 'pi_tickets',
      amountCents: order.totalCents,
    });

    expect(redelivered).toEqual({
      kind: 'already',
      status: 'paid',
      orderId: order.id,
    });
    const afterRedelivery = await readTickets(order.id);
    expect(afterRedelivery).toHaveLength(2);
    expect(afterRedelivery.map((ticket) => ticket.code).sort()).toEqual(
      tickets.map((ticket) => ticket.code).sort(),
    );
  });
});
