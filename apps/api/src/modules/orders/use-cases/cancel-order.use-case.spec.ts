import { describe, expect, it, vi } from 'vitest';

import type { EventEntity } from '../../events/domain/event-entity.js';
import type { EventsRepository } from '../../events/domain/events-repository.js';
import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { CancelOrderUseCase } from './cancel-order.use-case.js';

const NOW = new Date('2026-10-17T20:00:00.000Z');
const ORDER_ID = 'order-1';

function paidOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: ORDER_ID,
    userId: 'user-a',
    eventId: 'ev1',
    eventSlug: 'o-fantasma-da-opera',
    status: 'paid',
    paymentMethod: 'card',
    provider: 'fake',
    providerRef: 'pi_1',
    buyerEmail: 'comprador@example.com',
    subtotalCents: 9000,
    serviceFeeCents: 900,
    totalCents: 9900,
    refundCents: null,
    createdAt: new Date('2026-10-17T12:00:00.000Z'),
    paidAt: new Date('2026-10-17T12:05:00.000Z'),
    items: [],
    ...overrides,
  };
}

function eventEntity(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    id: 'ev1',
    slug: 'o-fantasma-da-opera',
    title: 'O Fantasma da Ópera',
    description: 'Um clássico.',
    categorySlug: 'teatro',
    categoryName: 'Teatro',
    venueSlug: 'teatro-municipal',
    venueName: 'Teatro Municipal',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-18T20:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    cancellationWindowHours: 24,
    refundPercent: 70,
    ...overrides,
  };
}

interface HarnessOptions {
  order?: OrderRecord | null;
  event?: EventEntity | null;
  events?: EventEntity[];
  cancelPaidOrder?: Awaited<ReturnType<SeatCaptureGateway['cancelPaidOrder']>>;
  refundError?: Error;
}

function createHarness(options: HarnessOptions = {}) {
  const order = options.order === undefined ? paidOrder() : options.order;
  const findById = vi.fn(async () => order);
  const orderRepository = { findById } as unknown as OrderRepository;

  const events = options.events ?? [options.event ?? eventEntity()];
  const findBySlugs = vi.fn(async () => (options.event === null ? [] : events));
  const eventsRepository = { findBySlugs } as unknown as EventsRepository;

  const cancelPaidOrder = vi.fn(
    async () => options.cancelPaidOrder ?? { kind: 'refunded' as const },
  );
  const seatGateway = {
    cancelPaidOrder,
  } as unknown as SeatCaptureGateway;

  const refund = options.refundError
    ? vi.fn(async () => {
        throw options.refundError;
      })
    : vi.fn(async () => undefined);
  const paymentProvider = {
    providerName: 'fake',
    refund,
  } as unknown as PaymentProvider;

  const useCase = new CancelOrderUseCase(
    orderRepository,
    eventsRepository,
    seatGateway,
    paymentProvider,
    () => NOW,
  );

  return {
    useCase,
    findById,
    findBySlugs,
    cancelPaidOrder,
    refund,
  };
}

describe('CancelOrderUseCase', () => {
  it('cancela o pedido pago com o reembolso parcial da política', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'ok', refundCents: 6930 });
    expect(harness.refund).toHaveBeenCalledWith('pi_1', 6930);
    expect(harness.cancelPaidOrder).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      refundCents: 6930,
    });
  });

  it('devolve janela fechada e não reembolsa', async () => {
    const harness = createHarness({
      event: eventEntity({ startsAt: new Date('2026-10-18T16:00:00.000Z') }),
    });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'refund_window_closed' });
    expect(harness.refund).not.toHaveBeenCalled();
    expect(harness.cancelPaidOrder).not.toHaveBeenCalled();
  });

  it('devolve reembolso não permitido quando a porcentagem é zero', async () => {
    const harness = createHarness({
      event: eventEntity({ refundPercent: 0 }),
    });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'refund_not_allowed' });
    expect(harness.refund).not.toHaveBeenCalled();
    expect(harness.cancelPaidOrder).not.toHaveBeenCalled();
  });

  it('devolve pedido não cancelável quando não está pago', async () => {
    const harness = createHarness({ order: paidOrder({ status: 'pending' }) });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'order_not_cancellable' });
    expect(harness.findBySlugs).not.toHaveBeenCalled();
    expect(harness.refund).not.toHaveBeenCalled();
  });

  it('devolve pedido não cancelável quando a corrida perde a marcação', async () => {
    const harness = createHarness({
      cancelPaidOrder: { kind: 'not_paid' as const },
    });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'order_not_cancellable' });
  });

  it('devolve pedido não encontrado para id desconhecido', async () => {
    const harness = createHarness({ order: null });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'order_not_found' });
    expect(harness.refund).not.toHaveBeenCalled();
  });

  it('devolve pedido não encontrado para o pedido de outro usuário', async () => {
    const harness = createHarness({ order: paidOrder({ userId: 'user-b' }) });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'order_not_found' });
  });

  it('devolve reembolso indisponível quando o provider falha e não marca o pedido', async () => {
    const harness = createHarness({ refundError: new Error('boom') });

    const result = await harness.useCase.execute({
      orderId: ORDER_ID,
      userId: 'user-a',
    });

    expect(result).toEqual({ kind: 'refund_provider_error' });
    expect(harness.cancelPaidOrder).not.toHaveBeenCalled();
  });
});
