import { describe, expect, it } from 'vitest';

import type { OrderRecord } from '../domain/order-entity.js';
import type { CreateOrderInput } from '../domain/order-repository.js';
import { InMemoryOrderRepository } from './in-memory-order-repository.js';

const START = new Date('2026-10-18T12:00:00.000Z');
const LATER = new Date('2026-10-18T12:05:00.000Z');

const item = {
  seatId: 'seat-1',
  rowId: 'row-1',
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: '6',
  ticketType: 'inteira',
  priceCents: 12000,
} as const;

const input = (
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput => ({
  userId: 'user-a',
  eventId: 'ev1',
  paymentMethod: 'card',
  provider: 'fake',
  subtotalCents: 12000,
  serviceFeeCents: 1200,
  totalCents: 13200,
  items: [{ ...item }],
  ...overrides,
});

const build = (
  options: { now?: Date; initialOrders?: OrderRecord[] } = {},
): InMemoryOrderRepository =>
  new InMemoryOrderRepository({
    eventSlugs: new Map([['ev1', 'o-fantasma-da-opera']]),
    now: () => options.now ?? START,
    initialOrders: options.initialOrders,
  });

describe('InMemoryOrderRepository', () => {
  it('cria o pedido pendente com os itens e o slug do evento', async () => {
    const order = await build().create(
      input({
        items: [
          { ...item },
          {
            ...item,
            seatId: 'seat-2',
            seatLabel: '7',
            ticketType: 'meia',
            priceCents: 6000,
          },
        ],
      }),
    );

    expect(order).toMatchObject({
      userId: 'user-a',
      eventId: 'ev1',
      eventSlug: 'o-fantasma-da-opera',
      status: 'pending',
      paymentMethod: 'card',
      provider: 'fake',
      providerRef: null,
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      createdAt: START,
      paidAt: null,
    });
    expect(order.id).toEqual(expect.any(String));
    expect(order.items).toHaveLength(2);
    expect(order.items[1]).toMatchObject({
      seatLabel: '7',
      ticketType: 'meia',
      priceCents: 6000,
    });
  });

  it('usa slug vazio quando o evento não está no mapa', async () => {
    const order = await build().create(input({ eventId: 'ev-desconhecido' }));

    expect(order.eventSlug).toBe('');
  });

  it('encontra o pedido por id e devolve nulo quando não existe', async () => {
    const repository = build();
    const created = await repository.create(input());

    expect(await repository.findById(created.id)).toMatchObject({
      id: created.id,
      status: 'pending',
    });
    expect(await repository.findById('inexistente')).toBeNull();
    expect(await repository.findByProviderRef('pi-inexistente')).toBeNull();
  });

  it('encontra apenas o pendente do mesmo usuário e evento', async () => {
    const repository = build();
    const created = await repository.create(input());

    expect(
      await repository.findPendingByUserEvent({
        userId: 'user-a',
        eventId: 'ev1',
      }),
    ).toMatchObject({ id: created.id });
    expect(
      await repository.findPendingByUserEvent({
        userId: 'user-b',
        eventId: 'ev1',
      }),
    ).toBeNull();
    expect(
      await repository.findPendingByUserEvent({
        userId: 'user-a',
        eventId: 'ev2',
      }),
    ).toBeNull();
  });

  it('não encontra pendente depois que o pedido deixa de ser pendente', async () => {
    const repository = build();
    const created = await repository.create(input());
    await repository.markFailed({ orderId: created.id, now: LATER });

    expect(
      await repository.findPendingByUserEvent({
        userId: 'user-a',
        eventId: 'ev1',
      }),
    ).toBeNull();
  });

  it('encontra o pedido pela referência do provedor após setProviderRef', async () => {
    const repository = build();
    const created = await repository.create(input());
    await repository.setProviderRef({
      orderId: created.id,
      providerRef: 'pi_123',
    });

    expect(await repository.findByProviderRef('pi_123')).toMatchObject({
      id: created.id,
      providerRef: 'pi_123',
    });
  });

  it('marca o pedido como failed e como expired', async () => {
    const repository = build();
    const failed = await repository.create(input());
    const expired = await repository.create(input({ userId: 'user-b' }));

    await repository.markFailed({ orderId: failed.id, now: LATER });
    await repository.markExpired({ orderId: expired.id, now: LATER });
    await repository.markExpired({ orderId: failed.id, now: LATER });

    expect((await repository.findById(failed.id))?.status).toBe('failed');
    expect((await repository.findById(expired.id))?.status).toBe('expired');
  });

  it('não rebaixa um pedido pago', async () => {
    const paid: OrderRecord = {
      id: 'order-pago',
      userId: 'user-a',
      eventId: 'ev1',
      eventSlug: 'o-fantasma-da-opera',
      status: 'paid',
      paymentMethod: 'card',
      provider: 'fake',
      providerRef: 'pi_pago',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      createdAt: START,
      paidAt: START,
      items: [{ ...item }],
    };
    const repository = build({ initialOrders: [paid] });

    await repository.markFailed({ orderId: paid.id, now: LATER });
    await repository.markExpired({ orderId: paid.id, now: LATER });

    expect((await repository.findById(paid.id))?.status).toBe('paid');
  });

  it('lista apenas pendentes criados antes do limite', async () => {
    const repository = build();
    const created = await repository.create(input());
    const other = await repository.create(input({ userId: 'user-b' }));
    await repository.markExpired({ orderId: other.id, now: LATER });

    expect(
      await repository.listStalePending({
        now: LATER,
        olderThan: new Date(START.getTime() + 1000),
      }),
    ).toEqual([{ orderId: created.id, userId: 'user-a', eventId: 'ev1' }]);
    expect(
      await repository.listStalePending({
        now: LATER,
        olderThan: new Date(START.getTime() - 1000),
      }),
    ).toEqual([]);
  });
});
