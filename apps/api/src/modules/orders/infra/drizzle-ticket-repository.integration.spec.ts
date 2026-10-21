import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  events,
  orderItems,
  seatRows,
  seats,
  sectors,
  tickets,
  user,
} from '../../../db/schema.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { generateTicketCode } from '../domain/ticket-entity.js';
import { DrizzleOrderRepository } from './drizzle-order-repository.js';
import { DrizzleTicketRepository } from './drizzle-ticket-repository.js';

const EVENT_SLUG = 'o-fantasma-da-opera';

describe('ingressos (postgres integration)', () => {
  let testDb: Db;
  let orderRepository: DrizzleOrderRepository;
  let repository: DrizzleTicketRepository;
  let eventId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    orderRepository = new DrizzleOrderRepository(testDb);
    repository = new DrizzleTicketRepository(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await testDb
      .insert(user)
      .values({ id: 'user-a', name: 'User A', email: 'user-a@example.com' });
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

  const createOrder = async (input: {
    seatLabels: string[];
    providerRef: string;
  }) => {
    const found = await Promise.all(
      input.seatLabels.map(async (seatLabel) => ({
        seat: await findSeat(seatLabel),
        seatLabel,
      })),
    );
    const order = await orderRepository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      buyerEmail: 'comprador@example.com',
      subtotalCents: 12000 * found.length,
      serviceFeeCents: 1200 * found.length,
      totalCents: 13200 * found.length,
      items: found.map(({ seat, seatLabel }) => ({
        seatId: seat.seatId,
        rowId: seat.rowId,
        sectorSlug: 'plateia',
        sectorName: 'Plateia',
        rowLabel: 'A',
        seatLabel,
        ticketType: 'inteira',
        priceCents: 12000,
      })),
    });
    await orderRepository.setProviderRef({
      orderId: order.id,
      providerRef: input.providerRef,
    });
    return order;
  };

  it('encontra os ingressos de um pedido com código e data de emissão', async () => {
    const order = await createOrder({
      seatLabels: ['6', '7'],
      providerRef: 'pi_tickets',
    });
    const items = await testDb
      .select({ id: orderItems.id, seatId: orderItems.seatId })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    await testDb.insert(tickets).values(
      items.map((item) => ({
        orderId: order.id,
        orderItemId: item.id,
        seatId: item.seatId,
        code: generateTicketCode(),
      })),
    );

    const found = await repository.findByOrderId(order.id);

    expect(found).toHaveLength(2);
    expect(found.map((ticket) => ticket.orderId)).toEqual([order.id, order.id]);
    expect(new Set(found.map((ticket) => ticket.orderItemId))).toEqual(
      new Set(items.map((item) => item.id)),
    );
    expect(new Set(found.map((ticket) => ticket.seatId))).toEqual(
      new Set(items.map((item) => item.seatId)),
    );
    expect(found.every((ticket) => ticket.code.length > 0)).toBe(true);
    expect(new Set(found.map((ticket) => ticket.code)).size).toBe(2);
    for (const ticket of found) {
      expect(ticket.createdAt).toBeInstanceOf(Date);
      expect(ticket.createdAt.getTime()).not.toBeNaN();
    }
  });

  it('devolve vazio quando o pedido não tem ingressos', async () => {
    const order = await createOrder({
      seatLabels: ['6'],
      providerRef: 'pi_without_tickets',
    });

    expect(await repository.findByOrderId(order.id)).toEqual([]);
  });
});
