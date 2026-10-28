import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';
import { describe, expect, it, vi } from 'vitest';

import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type {
  OrderRepository,
  StaleOrderRef,
} from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { ExpirePendingOrdersUseCase } from './expire-pending-orders.use-case.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const OLDER_THAN = new Date(NOW.getTime() - SEAT_HOLD_TTL_SECONDS * 1000);
const EVENT_SLUG = 'o-fantasma-da-opera';
const SEAT_KEY_1 = holdSeatKey('ev1', 'row-A', 'seat-6');
const SEAT_KEY_2 = holdSeatKey('ev1', 'row-A', 'seat-7');

const STALE: StaleOrderRef[] = [
  { orderId: 'order-1', userId: 'u1', eventId: 'ev1' },
  { orderId: 'order-2', userId: 'u2', eventId: 'ev1' },
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
    createdAt: new Date('2026-10-18T11:40:00.000Z'),
    paidAt: null,
    items: [],
    ...overrides,
  };
}

interface HarnessOptions {
  stale?: StaleOrderRef[];
  seatKeys?: Record<string, string[]>;
}

function createHarness(options: HarnessOptions = {}) {
  const listStalePending = vi.fn(async () => options.stale ?? STALE);
  const markExpired = vi.fn(async () => undefined);
  const orders = new Map<string, OrderRecord>([
    ['order-1', pendingOrder({ id: 'order-1', userId: 'u1' })],
    ['order-2', pendingOrder({ id: 'order-2', userId: 'u2' })],
  ]);
  const findById = vi.fn(async (id: string) => orders.get(id) ?? null);
  const orderRepository = {
    listStalePending,
    markExpired,
    findById,
  } as unknown as OrderRepository;

  const seatKeys = options.seatKeys ?? {
    'order-1': [SEAT_KEY_1],
    'order-2': [SEAT_KEY_2],
  };
  const releaseOrderSeats = vi.fn(async ({ orderId }: { orderId: string }) => ({
    seatKeys: seatKeys[orderId] ?? [],
  }));
  const seatCaptureGateway = {
    releaseOrderSeats,
  } as unknown as SeatCaptureGateway;

  const release = vi.fn(async () => true);
  const holdRepository = { release } as unknown as HoldRepository;

  const clear = vi.fn(async () => undefined);
  const cartRepository = { clear } as unknown as CartRepository;

  const useCase = new ExpirePendingOrdersUseCase(
    orderRepository,
    seatCaptureGateway,
    holdRepository,
    cartRepository,
    () => NOW,
  );

  return {
    useCase,
    listStalePending,
    markExpired,
    releaseOrderSeats,
    release,
    clear,
  };
}

describe('ExpirePendingOrdersUseCase', () => {
  it('expira os pedidos antigos, libera os assentos e esvazia os carrinhos', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute();

    expect(result).toEqual({ expired: 2 });
    expect(harness.listStalePending).toHaveBeenCalledWith({
      now: NOW,
      olderThan: OLDER_THAN,
    });
    expect(harness.markExpired).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.markExpired).toHaveBeenCalledWith({
      orderId: 'order-2',
      now: NOW,
    });
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-2',
      now: NOW,
    });
    expect(harness.release).toHaveBeenCalledWith(SEAT_KEY_1, 'u1');
    expect(harness.release).toHaveBeenCalledWith(SEAT_KEY_2, 'u2');
    expect(harness.clear).toHaveBeenCalledWith({
      userId: 'u1',
      eventSlug: EVENT_SLUG,
    });
    expect(harness.clear).toHaveBeenCalledWith({
      userId: 'u2',
      eventSlug: EVENT_SLUG,
    });
  });

  it('não faz nada quando não há pendentes antigos', async () => {
    const harness = createHarness({ stale: [] });

    const result = await harness.useCase.execute();

    expect(result).toEqual({ expired: 0 });
    expect(harness.markExpired).not.toHaveBeenCalled();
    expect(harness.releaseOrderSeats).not.toHaveBeenCalled();
    expect(harness.clear).not.toHaveBeenCalled();
  });
});
