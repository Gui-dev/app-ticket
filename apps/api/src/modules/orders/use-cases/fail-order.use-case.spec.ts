import { describe, expect, it, vi } from 'vitest';

import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { FailOrderUseCase } from './fail-order.use-case.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const EVENT_SLUG = 'o-fantasma-da-opera';
const SEAT_KEYS = [
  holdSeatKey('ev1', 'row-A', 'seat-6'),
  holdSeatKey('ev1', 'row-A', 'seat-7'),
];

function pendingOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order-1',
    userId: 'u1',
    eventId: 'ev1',
    eventSlug: EVENT_SLUG,
    status: 'pending',
    paymentMethod: 'card',
    provider: 'fake',
    providerRef: 'pi_1',
    buyerEmail: 'comprador@example.com',
    subtotalCents: 12000,
    serviceFeeCents: 1200,
    totalCents: 13200,
    refundCents: null,
    transferStatus: 'none',
    transferRef: null,
    createdAt: new Date('2026-10-18T11:50:00.000Z'),
    paidAt: null,
    items: [],
    ...overrides,
  };
}

function createHarness(options: { order?: OrderRecord | null } = {}) {
  const order = options.order === undefined ? pendingOrder() : options.order;
  const findByProviderRef = vi.fn(async () => order);
  const markFailed = vi.fn(async () => undefined);
  const markExpired = vi.fn(async () => undefined);
  const orderRepository = {
    findByProviderRef,
    markFailed,
    markExpired,
  } as unknown as OrderRepository;

  const releaseOrderSeats = vi.fn(async () => ({ seatKeys: SEAT_KEYS }));
  const seatCaptureGateway = {
    releaseOrderSeats,
  } as unknown as SeatCaptureGateway;

  const release = vi.fn(async () => true);
  const holdRepository = { release } as unknown as HoldRepository;

  const clear = vi.fn(async () => undefined);
  const cartRepository = { clear } as unknown as CartRepository;

  const useCase = new FailOrderUseCase(
    orderRepository,
    seatCaptureGateway,
    holdRepository,
    cartRepository,
    () => NOW,
  );

  return {
    useCase,
    findByProviderRef,
    markFailed,
    markExpired,
    releaseOrderSeats,
    release,
    clear,
  };
}

describe('FailOrderUseCase', () => {
  it('marca o pedido como failed, libera os assentos e esvazia o carrinho', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      terminal: 'failed',
    });

    expect(result).toEqual({ kind: 'terminal', status: 'failed' });
    expect(harness.findByProviderRef).toHaveBeenCalledWith('pi_1');
    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.markExpired).not.toHaveBeenCalled();
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.release).toHaveBeenCalledTimes(2);
    expect(harness.release).toHaveBeenCalledWith(SEAT_KEYS[0], 'u1');
    expect(harness.release).toHaveBeenCalledWith(SEAT_KEYS[1], 'u1');
    expect(harness.clear).toHaveBeenCalledWith({
      userId: 'u1',
      eventSlug: EVENT_SLUG,
    });
  });

  it('marca o pedido como expired', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      terminal: 'expired',
    });

    expect(result).toEqual({ kind: 'terminal', status: 'expired' });
    expect(harness.markExpired).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.markFailed).not.toHaveBeenCalled();
  });

  it('ignora um pedido terminal', async () => {
    const harness = createHarness({ order: pendingOrder({ status: 'paid' }) });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      terminal: 'failed',
    });

    expect(result).toEqual({ kind: 'ignored' });
    expect(harness.markFailed).not.toHaveBeenCalled();
    expect(harness.releaseOrderSeats).not.toHaveBeenCalled();
    expect(harness.clear).not.toHaveBeenCalled();
  });

  it('ignora um pedido inexistente', async () => {
    const harness = createHarness({ order: null });

    const result = await harness.useCase.execute({
      providerRef: 'pi_x',
      terminal: 'expired',
    });

    expect(result).toEqual({ kind: 'ignored' });
    expect(harness.markExpired).not.toHaveBeenCalled();
    expect(harness.releaseOrderSeats).not.toHaveBeenCalled();
  });
});
