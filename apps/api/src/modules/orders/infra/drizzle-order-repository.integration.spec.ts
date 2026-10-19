import type { TicketType } from '@ticketvibe/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  events,
  orders,
  paymentEvents,
  seatRows,
  seats,
  sectors,
  user,
} from '../../../db/schema.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type { OrderItemRecord } from '../domain/order-entity.js';
import { DrizzleOrderRepository } from './drizzle-order-repository.js';
import { DrizzlePaymentEventRepository } from './drizzle-payment-event-repository.js';
import { DrizzleSeatCaptureGateway } from './drizzle-seat-capture-gateway.js';

const EVENT_SLUG = 'o-fantasma-da-opera';
const NO_SUCH_ID = '00000000-0000-0000-0000-000000000000';

const item = (
  seat: { seatId: string; rowId: string },
  seatLabel: string,
  ticketType: TicketType,
  priceCents: number,
): OrderItemRecord => ({
  seatId: seat.seatId,
  rowId: seat.rowId,
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel,
  ticketType,
  priceCents,
});

describe('ordens (postgres integration)', () => {
  let testDb: Db;
  let repository: DrizzleOrderRepository;
  let gateway: DrizzleSeatCaptureGateway;
  let paymentEventRepository: DrizzlePaymentEventRepository;
  let eventId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    repository = new DrizzleOrderRepository(testDb);
    gateway = new DrizzleSeatCaptureGateway(testDb);
    paymentEventRepository = new DrizzlePaymentEventRepository(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await testDb.insert(user).values([
      { id: 'user-a', name: 'User A', email: 'user-a@example.com' },
      { id: 'user-b', name: 'User B', email: 'user-b@example.com' },
    ]);
    const [event] = await testDb
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, EVENT_SLUG));
    eventId = event.id;
  });

  afterAll(async () => {
    await resetDatabase(testDb);
    await testDb.$client.end();
  });

  const findSeat = async (seatLabel: string) => {
    const [seat] = await testDb
      .select({ seatId: seats.id, rowId: seatRows.id })
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

  const reserve = async (
    seatId: string,
    userId: string,
    expiresAt: Date,
  ): Promise<void> => {
    await testDb
      .update(seats)
      .set({ status: 'reserved', holdUserId: userId, holdExpiresAt: expiresAt })
      .where(eq(seats.id, seatId));
  };

  const readSeat = async (seatId: string) => {
    const [seat] = await testDb
      .select()
      .from(seats)
      .where(eq(seats.id, seatId));
    return seat;
  };

  it('cria o pedido e o relê com evento, itens e pendência', async () => {
    const seat6 = await findSeat('6');
    const seat7 = await findSeat('7');
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      items: [
        item(seat6, '6', 'inteira', 12000),
        item(seat7, '7', 'meia', 6000),
      ],
    });

    expect(created).toMatchObject({
      userId: 'user-a',
      eventId,
      eventSlug: EVENT_SLUG,
      status: 'pending',
      paymentMethod: 'card',
      provider: 'fake',
      providerRef: null,
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      paidAt: null,
    });
    expect(created.id).toEqual(expect.any(String));

    const found = await repository.findById(created.id);
    expect(found).toEqual(created);
    expect(found?.items.map((foundItem) => foundItem.seatLabel).sort()).toEqual(
      ['6', '7'],
    );
    expect(found?.items[0]).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatId: seat6.seatId,
      rowId: seat6.rowId,
      ticketType: 'inteira',
      priceCents: 12000,
    });

    const pending = await repository.findPendingByUserEvent({
      userId: 'user-a',
      eventId,
    });
    expect(pending?.id).toBe(created.id);
    expect(
      await repository.findPendingByUserEvent({ userId: 'user-b', eventId }),
    ).toBeNull();
    expect(await repository.findById(NO_SUCH_ID)).toBeNull();
    expect(await repository.findByProviderRef('pi_inexistente')).toBeNull();
  });

  it('guarda e encontra a referência do provedor', async () => {
    const seat6 = await findSeat('6');
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'boleto',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });

    await repository.setProviderRef({
      orderId: created.id,
      providerRef: 'pi_123',
    });

    expect(await repository.findByProviderRef('pi_123')).toMatchObject({
      id: created.id,
      paymentMethod: 'boleto',
      providerRef: 'pi_123',
    });
  });

  it('confirma o pagamento, ocupa os assentos e grava paid_at', async () => {
    const seat6 = await findSeat('6');
    const seat7 = await findSeat('7');
    const now = new Date('2026-10-18T12:00:00.000Z');
    await reserve(seat6.seatId, 'user-a', new Date('2026-10-18T12:05:00.000Z'));
    await reserve(seat7.seatId, 'user-a', new Date('2026-10-18T12:05:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      items: [
        item(seat6, '6', 'inteira', 12000),
        item(seat7, '7', 'meia', 6000),
      ],
    });
    await repository.setProviderRef({
      orderId: created.id,
      providerRef: 'pi_ok',
    });

    const result = await gateway.confirmOrderPayment({
      providerRef: 'pi_ok',
      now,
    });

    expect(result).toEqual({ kind: 'paid' });
    expect(await readSeat(seat6.seatId)).toMatchObject({
      status: 'occupied',
      holdUserId: null,
      holdExpiresAt: null,
    });
    expect(await readSeat(seat7.seatId)).toMatchObject({
      status: 'occupied',
      holdUserId: null,
      holdExpiresAt: null,
    });
    const paid = await repository.findById(created.id);
    expect(paid).toMatchObject({ status: 'paid', providerRef: 'pi_ok' });
    expect(paid?.paidAt).toEqual(now);
    expect(
      await repository.findPendingByUserEvent({ userId: 'user-a', eventId }),
    ).toBeNull();
  });

  it('não confirma duas vezes o mesmo pedido', async () => {
    const seat6 = await findSeat('6');
    const now = new Date('2026-10-18T12:00:00.000Z');
    await reserve(seat6.seatId, 'user-a', new Date('2026-10-18T12:05:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    await repository.setProviderRef({
      orderId: created.id,
      providerRef: 'pi_ok',
    });
    await gateway.confirmOrderPayment({ providerRef: 'pi_ok', now });

    const again = await gateway.confirmOrderPayment({
      providerRef: 'pi_ok',
      now: new Date('2026-10-18T12:01:00.000Z'),
    });

    expect(again).toEqual({ kind: 'already', status: 'paid' });
    expect((await repository.findById(created.id))?.paidAt).toEqual(now);
  });

  it('devolve order_not_found para uma referência desconhecida', async () => {
    const result = await gateway.confirmOrderPayment({
      providerRef: 'pi_desconhecido',
      now: new Date('2026-10-18T12:00:00.000Z'),
    });

    expect(result).toEqual({ kind: 'order_not_found' });
  });

  it('marca failed e não toca nos assentos quando a reserva expirou', async () => {
    const seat6 = await findSeat('6');
    const now = new Date('2026-10-18T12:00:00.000Z');
    await reserve(seat6.seatId, 'user-a', new Date('2026-10-18T11:59:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    await repository.setProviderRef({
      orderId: created.id,
      providerRef: 'pi_expirado',
    });

    const result = await gateway.confirmOrderPayment({
      providerRef: 'pi_expirado',
      now,
    });

    expect(result).toEqual({ kind: 'seats_lost' });
    expect((await repository.findById(created.id))?.status).toBe('failed');
    expect(await readSeat(seat6.seatId)).toMatchObject({
      status: 'reserved',
      holdUserId: 'user-a',
    });
  });

  it('marca failed quando a reserva é de outro usuário', async () => {
    const seat6 = await findSeat('6');
    await reserve(seat6.seatId, 'user-b', new Date('2026-10-18T12:05:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    await repository.setProviderRef({
      orderId: created.id,
      providerRef: 'pi_estranho',
    });

    const result = await gateway.confirmOrderPayment({
      providerRef: 'pi_estranho',
      now: new Date('2026-10-18T12:00:00.000Z'),
    });

    expect(result).toEqual({ kind: 'seats_lost' });
    expect((await repository.findById(created.id))?.status).toBe('failed');
    expect(await readSeat(seat6.seatId)).toMatchObject({
      status: 'reserved',
      holdUserId: 'user-b',
    });
  });

  it('libera os assentos reservados pelo comprador e devolve as chaves', async () => {
    const seat6 = await findSeat('6');
    const seat7 = await findSeat('7');
    await reserve(seat6.seatId, 'user-a', new Date('2026-10-18T12:05:00.000Z'));
    await reserve(seat7.seatId, 'user-b', new Date('2026-10-18T12:05:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      items: [
        item(seat6, '6', 'inteira', 12000),
        item(seat7, '7', 'meia', 6000),
      ],
    });

    const released = await gateway.releaseOrderSeats({
      orderId: created.id,
      now: new Date('2026-10-18T12:00:00.000Z'),
    });

    expect(released).toEqual({
      seatKeys: [holdSeatKey(eventId, seat6.rowId, seat6.seatId)],
    });
    expect(await readSeat(seat6.seatId)).toMatchObject({
      status: 'available',
      holdUserId: null,
      holdExpiresAt: null,
    });
    expect(await readSeat(seat7.seatId)).toMatchObject({
      status: 'reserved',
      holdUserId: 'user-b',
    });
  });

  it('libera os assentos de um pedido expirado', async () => {
    const seat6 = await findSeat('6');
    const seat7 = await findSeat('7');
    const now = new Date('2026-10-18T12:00:00.000Z');
    await reserve(seat6.seatId, 'user-a', new Date('2026-10-18T11:59:00.000Z'));
    await reserve(seat7.seatId, 'user-a', new Date('2026-10-18T11:59:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      items: [
        item(seat6, '6', 'inteira', 12000),
        item(seat7, '7', 'meia', 6000),
      ],
    });
    await repository.markExpired({ orderId: created.id, now });

    const released = await gateway.releaseOrderSeats({
      orderId: created.id,
      now,
    });

    expect((await repository.findById(created.id))?.status).toBe('expired');
    expect(released).toEqual({
      seatKeys: [
        holdSeatKey(eventId, seat6.rowId, seat6.seatId),
        holdSeatKey(eventId, seat7.rowId, seat7.seatId),
      ],
    });
    expect(await readSeat(seat6.seatId)).toMatchObject({
      status: 'available',
      holdUserId: null,
      holdExpiresAt: null,
    });
    expect(await readSeat(seat7.seatId)).toMatchObject({
      status: 'available',
      holdUserId: null,
      holdExpiresAt: null,
    });
  });

  it('não toca nos assentos de um pedido pago', async () => {
    const seat6 = await findSeat('6');
    await reserve(seat6.seatId, 'user-a', new Date('2026-10-18T12:05:00.000Z'));
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    await testDb
      .update(orders)
      .set({ status: 'paid', paidAt: new Date('2026-10-18T12:00:00.000Z') })
      .where(eq(orders.id, created.id));

    expect(
      await gateway.releaseOrderSeats({
        orderId: created.id,
        now: new Date('2026-10-18T12:01:00.000Z'),
      }),
    ).toEqual({ seatKeys: [] });
    expect(await readSeat(seat6.seatId)).toMatchObject({
      status: 'reserved',
      holdUserId: 'user-a',
    });
  });

  it('não libera nada de um pedido inexistente', async () => {
    expect(
      await gateway.releaseOrderSeats({
        orderId: NO_SUCH_ID,
        now: new Date('2026-10-18T12:01:00.000Z'),
      }),
    ).toEqual({ seatKeys: [] });
  });

  it('marca failed e expired sem afetar outros pedidos', async () => {
    const seat6 = await findSeat('6');
    const failed = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    const expired = await repository.create({
      userId: 'user-b',
      eventId,
      paymentMethod: 'boleto',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    const now = new Date('2026-10-18T12:00:00.000Z');

    await repository.markFailed({ orderId: failed.id, now });
    await repository.markExpired({ orderId: expired.id, now });
    await repository.markExpired({ orderId: failed.id, now });

    expect((await repository.findById(failed.id))?.status).toBe('failed');
    expect((await repository.findById(expired.id))?.status).toBe('expired');
    expect(
      await repository.findPendingByUserEvent({ userId: 'user-a', eventId }),
    ).toBeNull();
  });

  it('não rebaixa um pedido pago em markFailed nem em markExpired', async () => {
    const seat6 = await findSeat('6');
    const created = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    const paidAt = new Date('2026-10-18T12:00:00.000Z');
    await testDb
      .update(orders)
      .set({ status: 'paid', paidAt })
      .where(eq(orders.id, created.id));
    const now = new Date('2026-10-18T12:01:00.000Z');

    await repository.markFailed({ orderId: created.id, now });
    await repository.markExpired({ orderId: created.id, now });

    expect(await repository.findById(created.id)).toMatchObject({
      status: 'paid',
      paidAt,
      providerRef: null,
    });
  });

  it('lista apenas pendentes anteriores ao limite', async () => {
    const seat6 = await findSeat('6');
    const pending = await repository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    const expired = await repository.create({
      userId: 'user-b',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [item(seat6, '6', 'inteira', 12000)],
    });
    await repository.markExpired({
      orderId: expired.id,
      now: new Date('2026-10-18T12:00:00.000Z'),
    });

    expect(
      await repository.listStalePending({
        now: new Date(),
        olderThan: new Date(Date.now() + 60_000),
      }),
    ).toEqual([{ orderId: pending.id, userId: 'user-a', eventId }]);
    expect(
      await repository.listStalePending({
        now: new Date(),
        olderThan: new Date(pending.createdAt.getTime() - 1000),
      }),
    ).toEqual([]);
  });

  it('grava o evento de pagamento apenas uma vez', async () => {
    const input = {
      providerEventId: 'evt_1',
      provider: 'fake',
      type: 'payment.succeeded',
    };

    expect(await paymentEventRepository.record(input)).toBe(true);
    expect(await paymentEventRepository.record(input)).toBe(false);

    const rows = await testDb.select().from(paymentEvents);
    expect(rows).toEqual([
      expect.objectContaining({
        providerEventId: 'evt_1',
        provider: 'fake',
        type: 'payment.succeeded',
      }),
    ]);
  });
});
