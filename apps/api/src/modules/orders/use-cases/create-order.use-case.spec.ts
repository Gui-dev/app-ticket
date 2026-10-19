import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { SeatmapRepository } from '../../seatmaps/domain/seatmap-repository.js';
import type {
  GetCartResult,
  GetCartUseCase,
} from '../../seatmaps/use-cases/get-cart.use-case.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type {
  CreateOrderInput,
  OrderRepository,
} from '../domain/order-repository.js';
import { CreateOrderUseCase } from './create-order.use-case.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const RENEWED_AT = new Date('2026-10-18T12:10:00.000Z');
const EVENT_SLUG = 'o-fantasma-da-opera';
const HOLD_EXPIRES_AT = new Date('2026-10-18T12:10:00.000Z');

const twoSeatCart: GetCartResult = {
  kind: 'cart',
  cart: {
    eventSlug: EVENT_SLUG,
    items: [
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
        priceCents: 6000,
        expiresAt: HOLD_EXPIRES_AT,
      },
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '7',
        ticketType: 'inteira',
        priceCents: 12000,
        expiresAt: HOLD_EXPIRES_AT,
      },
    ],
    expiresAt: HOLD_EXPIRES_AT,
    totalCents: 18000,
  },
};

const emptyCart: GetCartResult = {
  kind: 'cart',
  cart: { eventSlug: EVENT_SLUG, items: [], expiresAt: null, totalCents: 0 },
};

const seatCoords: Record<
  string,
  { seatId: string; rowId: string; eventId: string }
> = {
  'plateia:A:6': { seatId: 'seat-6', rowId: 'row-A', eventId: 'ev1' },
  'plateia:A:7': { seatId: 'seat-7', rowId: 'row-A', eventId: 'ev1' },
};

const baseInput = {
  userId: 'u1',
  eventSlug: EVENT_SLUG,
  paymentMethod: 'card' as const,
  buyerEmail: 'b@x.com',
};

function existingOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order-existing',
    userId: 'u1',
    eventId: 'ev1',
    eventSlug: EVENT_SLUG,
    status: 'pending',
    paymentMethod: 'card',
    provider: 'stripe',
    providerRef: 'pi_existing',
    subtotalCents: 18000,
    serviceFeeCents: 1800,
    totalCents: 19800,
    createdAt: new Date('2026-10-18T11:00:00.000Z'),
    paidAt: null,
    items: [],
    ...overrides,
  };
}

interface HarnessOptions {
  cart?: GetCartResult;
  existingOrder?: OrderRecord | null;
  seats?: typeof seatCoords;
  createPayment?: () => Promise<{
    providerRef: string;
    clientSecret: string | null;
  }>;
}

function createHarness(options: HarnessOptions = {}) {
  const getCartExecute = vi.fn(async () => options.cart ?? twoSeatCart);
  const getCart = { execute: getCartExecute } as unknown as GetCartUseCase;

  const seats = options.seats ?? seatCoords;
  const findSeatByCoords = vi.fn(
    async (input: {
      eventSlug: string;
      sectorSlug: string;
      rowLabel: string;
      seatLabel: string;
    }) => {
      const coords =
        seats[`${input.sectorSlug}:${input.rowLabel}:${input.seatLabel}`];
      if (!coords) return { found: false as const, scope: 'seat' as const };
      return {
        found: true as const,
        seat: {
          ...coords,
          status: 'reserved' as const,
          sectorSlug: input.sectorSlug,
          sectorName: 'Plateia',
          priceFromCents: 12000,
          rowLabel: input.rowLabel,
          seatLabel: input.seatLabel,
        },
      };
    },
  );
  const renewSeatHold = vi.fn(async () => true);
  const seatmapRepository = {
    findSeatByCoords,
    renewSeatHold,
  } as unknown as SeatmapRepository;

  const renew = vi.fn(async () => true);
  const holdRepository = { renew } as unknown as HoldRepository;

  const findPendingByUserEvent = vi.fn(
    async () => options.existingOrder ?? null,
  );
  const create = vi.fn(
    async (input: CreateOrderInput): Promise<OrderRecord> => ({
      id: 'order-1',
      userId: input.userId,
      eventId: input.eventId,
      eventSlug: EVENT_SLUG,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      provider: input.provider,
      providerRef: null,
      subtotalCents: input.subtotalCents,
      serviceFeeCents: input.serviceFeeCents,
      totalCents: input.totalCents,
      createdAt: NOW,
      paidAt: null,
      items: input.items,
    }),
  );
  const setProviderRef = vi.fn(async () => undefined);
  const markFailed = vi.fn(async () => undefined);
  const orderRepository = {
    findPendingByUserEvent,
    create,
    setProviderRef,
    markFailed,
  } as unknown as OrderRepository;

  const createPayment = options.createPayment
    ? vi.fn(options.createPayment)
    : vi.fn(async () => ({ providerRef: 'pi_1', clientSecret: 'cs_1' }));
  const paymentProvider = {
    providerName: 'stripe',
    createPayment,
  } as unknown as PaymentProvider;

  const useCase = new CreateOrderUseCase(
    getCart,
    seatmapRepository,
    holdRepository,
    orderRepository,
    paymentProvider,
    () => NOW,
  );

  return {
    useCase,
    getCartExecute,
    findSeatByCoords,
    renewSeatHold,
    renew,
    findPendingByUserEvent,
    create,
    setProviderRef,
    markFailed,
    createPayment,
  };
}

describe('CreateOrderUseCase', () => {
  it('soma os itens, cobra a taxa de 10% e cria um pedido pendente', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(baseInput);

    expect(harness.getCartExecute).toHaveBeenCalledWith(
      'u1',
      'o-fantasma-da-opera',
    );
    expect(harness.create).toHaveBeenCalledWith({
      userId: 'u1',
      eventId: 'ev1',
      paymentMethod: 'card',
      provider: 'stripe',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      items: [
        {
          seatId: 'seat-6',
          rowId: 'row-A',
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
          priceCents: 6000,
        },
        {
          seatId: 'seat-7',
          rowId: 'row-A',
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '7',
          ticketType: 'inteira',
          priceCents: 12000,
        },
      ],
    });
    expect(harness.createPayment).toHaveBeenCalledWith({
      orderId: 'order-1',
      amountCents: 19800,
      method: 'card',
      description: 'Pedido order-1',
      buyerEmail: 'b@x.com',
    });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.subtotalCents).toBe(18000);
    expect(result.order.serviceFeeCents).toBe(1800);
    expect(result.order.totalCents).toBe(19800);
    expect(result.order.status).toBe('pending');
    expect(result.order.paymentMethod).toBe('card');
    expect(result.order.providerRef).toBe('pi_1');
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'cs_1',
    });
  });

  it('reutiliza o pedido pendente existente em vez de criar outro', async () => {
    const harness = createHarness({ existingOrder: existingOrder() });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-existing');
    expect(result.order.providerRef).toBe('pi_existing');
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_existing',
      clientSecret: null,
    });
  });

  it('cria o pagamento para um pedido pendente sem providerRef', async () => {
    const harness = createHarness({
      existingOrder: existingOrder({
        id: 'order-pending',
        providerRef: null,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.createPayment).toHaveBeenCalledOnce();
    expect(harness.createPayment).toHaveBeenCalledWith({
      orderId: 'order-pending',
      amountCents: 19800,
      method: 'card',
      description: 'Pedido order-pending',
      buyerEmail: 'b@x.com',
    });
    expect(harness.setProviderRef).toHaveBeenCalledWith({
      orderId: 'order-pending',
      providerRef: 'pi_1',
    });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.providerRef).toBe('pi_1');
  });

  it('renova os holds no Redis e no espelho ao criar o pedido', async () => {
    const harness = createHarness();

    await harness.useCase.execute(baseInput);

    expect(harness.renew).toHaveBeenCalledWith(
      holdSeatKey('ev1', 'row-A', 'seat-6'),
      'u1',
      SEAT_HOLD_TTL_SECONDS,
    );
    expect(harness.renew).toHaveBeenCalledWith(
      holdSeatKey('ev1', 'row-A', 'seat-7'),
      'u1',
      SEAT_HOLD_TTL_SECONDS,
    );
    expect(harness.renewSeatHold).toHaveBeenCalledWith({
      seatId: 'seat-6',
      userId: 'u1',
      expiresAt: RENEWED_AT,
    });
    expect(harness.renewSeatHold).toHaveBeenCalledWith({
      seatId: 'seat-7',
      userId: 'u1',
      expiresAt: RENEWED_AT,
    });
    expect(harness.renewSeatHold).toHaveBeenCalledTimes(2);
    expect(harness.renew).toHaveBeenCalledTimes(2);
  });

  it('descarta o item cujo assento não é encontrado', async () => {
    const harness = createHarness({
      seats: {
        'plateia:A:6': { seatId: 'seat-6', rowId: 'row-A', eventId: 'ev1' },
      },
    });

    const result = await harness.useCase.execute(baseInput);

    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.items).toEqual([
      {
        seatId: 'seat-6',
        rowId: 'row-A',
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
        priceCents: 6000,
      },
    ]);
    expect(result.order.subtotalCents).toBe(6000);
    expect(result.order.serviceFeeCents).toBe(600);
    expect(result.order.totalCents).toBe(6600);
  });

  it('retorna empty_cart quando o usuário não tem assento reservado', async () => {
    const harness = createHarness({ cart: emptyCart });

    const result = await harness.useCase.execute(baseInput);

    expect(result).toEqual({ kind: 'empty_cart' });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.findSeatByCoords).not.toHaveBeenCalled();
  });

  it('retorna event_not_found quando o evento não existe', async () => {
    const harness = createHarness({ cart: { kind: 'event_not_found' } });

    const result = await harness.useCase.execute(baseInput);

    expect(result).toEqual({ kind: 'event_not_found' });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('marca o pedido como falho e retorna payment_failed quando o provedor lança', async () => {
    const harness = createHarness({
      createPayment: async () => {
        throw new Error('stripe indisponível');
      },
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.create).toHaveBeenCalledOnce();
    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.setProviderRef).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'payment_failed' });
  });
});
