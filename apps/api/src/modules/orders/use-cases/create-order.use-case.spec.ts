import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
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
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
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

const oneSeatCart: GetCartResult = {
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
    ],
    expiresAt: HOLD_EXPIRES_AT,
    totalCents: 6000,
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

const cartItems = [
  {
    seatId: 'seat-6',
    rowId: 'row-A',
    sectorSlug: 'plateia',
    sectorName: 'Plateia',
    rowLabel: 'A',
    seatLabel: '6',
    ticketType: 'meia' as const,
    priceCents: 6000,
  },
  {
    seatId: 'seat-7',
    rowId: 'row-A',
    sectorSlug: 'plateia',
    sectorName: 'Plateia',
    rowLabel: 'A',
    seatLabel: '7',
    ticketType: 'inteira' as const,
    priceCents: 12000,
  },
];

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
    buyerEmail: 'comprador@example.com',
    subtotalCents: 18000,
    serviceFeeCents: 1800,
    totalCents: 19800,
    createdAt: new Date('2026-10-18T11:00:00.000Z'),
    paidAt: null,
    items: cartItems.map((item) => ({ ...item })),
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
  retrieveClientSecret?: (providerRef: string) => Promise<string | null>;
  create?: (input: CreateOrderInput) => Promise<OrderRecord>;
  renewResult?: boolean;
  renewSeatHoldResult?: boolean;
  concurrentOrder?: OrderRecord | null;
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
  const renewSeatHold = vi.fn(async () => options.renewSeatHoldResult ?? true);
  const seatmapRepository = {
    findSeatByCoords,
    renewSeatHold,
  } as unknown as SeatmapRepository;

  const renew = vi.fn(async () => options.renewResult ?? true);
  const release = vi.fn(async () => true);
  const holdRepository = { renew, release } as unknown as HoldRepository;

  const releaseOrderSeats = vi.fn(async () => ({
    seatKeys: [holdSeatKey('ev1', 'row-A', 'seat-6')],
  }));
  const seatCaptureGateway = {
    releaseOrderSeats,
  } as unknown as SeatCaptureGateway;

  const clear = vi.fn(async () => undefined);
  const cartRepository = { clear } as unknown as CartRepository;

  let pendingCalls = 0;
  const findPendingByUserEvent = vi.fn(async () => {
    pendingCalls += 1;
    if (options.concurrentOrder && pendingCalls > 1) {
      return options.concurrentOrder;
    }
    return options.existingOrder ?? null;
  });
  const create = vi.fn(
    options.create ??
      (async (input: CreateOrderInput): Promise<OrderRecord> => ({
        id: 'order-1',
        userId: input.userId,
        eventId: input.eventId,
        eventSlug: EVENT_SLUG,
        status: 'pending',
        paymentMethod: input.paymentMethod,
        provider: input.provider,
        providerRef: null,
        buyerEmail: input.buyerEmail,
        subtotalCents: input.subtotalCents,
        serviceFeeCents: input.serviceFeeCents,
        totalCents: input.totalCents,
        createdAt: NOW,
        paidAt: null,
        items: input.items,
      })),
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
  const retrieveClientSecret = options.retrieveClientSecret
    ? vi.fn(options.retrieveClientSecret)
    : vi.fn(async () => 'cs_existing');
  const cancelPayment = vi.fn(async () => undefined);
  const paymentProvider = {
    providerName: 'stripe',
    createPayment,
    retrieveClientSecret,
    cancelPayment,
  } as unknown as PaymentProvider;

  const useCase = new CreateOrderUseCase(
    getCart,
    seatmapRepository,
    holdRepository,
    orderRepository,
    paymentProvider,
    seatCaptureGateway,
    cartRepository,
    () => NOW,
  );

  return {
    useCase,
    getCartExecute,
    findSeatByCoords,
    renewSeatHold,
    renew,
    release,
    releaseOrderSeats,
    clear,
    findPendingByUserEvent,
    create,
    setProviderRef,
    markFailed,
    createPayment,
    retrieveClientSecret,
    cancelPayment,
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
      buyerEmail: 'b@x.com',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      items: [
        {
          seatId: 'seat-6',
          rowId: 'row-A',
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
          priceCents: 6000,
        },
        {
          seatId: 'seat-7',
          rowId: 'row-A',
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
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

  it('guarda o e-mail do comprador e o nome do setor no pedido', async () => {
    const harness = createHarness({ cart: oneSeatCart });

    await harness.useCase.execute({
      ...baseInput,
      buyerEmail: 'comprador@example.com',
    });

    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerEmail: 'comprador@example.com',
        items: [
          expect.objectContaining({
            seatLabel: '6',
            sectorName: 'Plateia',
          }),
        ],
      }),
    );
  });

  it('reutiliza o pedido pendente existente em vez de criar outro', async () => {
    const harness = createHarness({ existingOrder: existingOrder() });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(harness.renew).not.toHaveBeenCalled();
    expect(harness.renewSeatHold).not.toHaveBeenCalled();
    expect(harness.markFailed).not.toHaveBeenCalled();
    expect(harness.retrieveClientSecret).toHaveBeenCalledWith('pi_existing');
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-existing');
    expect(result.order.providerRef).toBe('pi_existing');
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_existing',
      clientSecret: 'cs_existing',
    });
  });

  it('aposenta o pedido pendente e cobra o total atual quando o carrinho muda', async () => {
    const harness = createHarness({
      existingOrder: existingOrder({
        id: 'order-stale',
        items: [
          {
            seatId: 'seat-6',
            rowId: 'row-A',
            sectorSlug: 'plateia',
            sectorName: 'Plateia',
            rowLabel: 'A',
            seatLabel: '6',
            ticketType: 'inteira',
            priceCents: 12000,
          },
        ],
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-stale',
      now: NOW,
    });
    expect(harness.create).toHaveBeenCalledOnce();
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalCents: 18000,
        serviceFeeCents: 1800,
        totalCents: 19800,
      }),
    );
    expect(harness.createPayment).toHaveBeenCalledWith({
      orderId: 'order-1',
      amountCents: 19800,
      method: 'card',
      description: 'Pedido order-1',
      buyerEmail: 'b@x.com',
    });
    expect(harness.setProviderRef).toHaveBeenCalledWith({
      orderId: 'order-1',
      providerRef: 'pi_1',
    });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-1');
    expect(result.order.totalCents).toBe(19800);
  });

  it('aposenta o pedido pendente quando o carrinho ganha um assento novo', async () => {
    const harness = createHarness({
      existingOrder: existingOrder({
        id: 'order-stale',
        items: [cartItems[0]].map((item) => ({ ...item })),
        subtotalCents: 6000,
        serviceFeeCents: 600,
        totalCents: 6600,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-stale',
      now: NOW,
    });
    expect(harness.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 19800 }),
    );
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-1');
    expect(result.order.totalCents).toBe(19800);
  });

  it('cancela o pagamento do pedido aposentado quando o carrinho muda', async () => {
    const harness = createHarness({
      existingOrder: existingOrder({
        id: 'order-stale',
        items: [
          {
            seatId: 'seat-6',
            rowId: 'row-A',
            sectorSlug: 'plateia',
            sectorName: 'Plateia',
            rowLabel: 'A',
            seatLabel: '6',
            ticketType: 'inteira',
            priceCents: 12000,
          },
        ],
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-stale',
      now: NOW,
    });
    expect(harness.cancelPayment).toHaveBeenCalledWith('pi_existing');
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-1');
  });

  it('não cancela pagamento quando o pedido aposentado não tem providerRef', async () => {
    const harness = createHarness({
      existingOrder: existingOrder({
        id: 'order-pending',
        providerRef: null,
        items: [
          {
            seatId: 'seat-6',
            rowId: 'row-A',
            sectorSlug: 'plateia',
            sectorName: 'Plateia',
            rowLabel: 'A',
            seatLabel: '6',
            ticketType: 'inteira',
            priceCents: 12000,
          },
        ],
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-pending',
      now: NOW,
    });
    expect(harness.cancelPayment).not.toHaveBeenCalled();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-1');
  });

  it('devolve client secret nulo quando o provedor não recupera o segredo', async () => {
    const harness = createHarness({
      existingOrder: existingOrder(),
      retrieveClientSecret: async () => null,
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_existing',
      clientSecret: null,
    });
  });

  it('devolve client secret nulo quando o provedor falha na recuperação', async () => {
    const harness = createHarness({
      existingOrder: existingOrder(),
      retrieveClientSecret: async () => {
        throw new Error('stripe indisponível');
      },
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_existing',
      clientSecret: null,
    });
  });

  it('abandona o pedido pendente sem providerRef e cria um novo com o total atual', async () => {
    const harness = createHarness({
      existingOrder: existingOrder({
        id: 'order-pending',
        providerRef: null,
        subtotalCents: 9000,
        serviceFeeCents: 900,
        totalCents: 9900,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-pending',
      now: NOW,
    });
    expect(harness.create).toHaveBeenCalledOnce();
    expect(harness.createPayment).toHaveBeenCalledWith({
      orderId: 'order-1',
      amountCents: 19800,
      method: 'card',
      description: 'Pedido order-1',
      buyerEmail: 'b@x.com',
    });
    expect(harness.setProviderRef).toHaveBeenCalledWith({
      orderId: 'order-1',
      providerRef: 'pi_1',
    });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-1');
    expect(result.order.totalCents).toBe(19800);
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

  it('devolve o pedido pendente de uma requisição concorrente sem criar outro pagamento', async () => {
    const harness = createHarness({
      create: async () => {
        throw new Error('unique_violation');
      },
      concurrentOrder: existingOrder({ id: 'order-concurrent' }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.findPendingByUserEvent).toHaveBeenCalledTimes(2);
    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(harness.setProviderRef).not.toHaveBeenCalled();
    expect(harness.markFailed).not.toHaveBeenCalled();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-concurrent');
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_existing',
      clientSecret: 'cs_existing',
    });
  });

  it('devolve o pedido concorrente sem pagamento quando ele ainda não tem providerRef', async () => {
    const harness = createHarness({
      create: async () => {
        throw new Error('unique_violation');
      },
      concurrentOrder: existingOrder({
        id: 'order-concurrent',
        providerRef: null,
      }),
    });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(harness.retrieveClientSecret).not.toHaveBeenCalled();
    expect(harness.markFailed).not.toHaveBeenCalled();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.order.id).toBe('order-concurrent');
    expect(result.payment).toEqual({
      provider: 'stripe',
      providerRef: null,
      clientSecret: null,
    });
  });

  it('repropaga o erro quando o pedido concorrente não bate com o carrinho', async () => {
    const harness = createHarness({
      create: async () => {
        throw new Error('unique_violation');
      },
      concurrentOrder: existingOrder({
        id: 'order-concurrent',
        items: [
          {
            seatId: 'seat-7',
            rowId: 'row-A',
            sectorSlug: 'plateia',
            sectorName: 'Plateia',
            rowLabel: 'A',
            seatLabel: '7',
            ticketType: 'inteira',
            priceCents: 12000,
          },
        ],
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
      }),
    });

    await expect(harness.useCase.execute(baseInput)).rejects.toThrow(
      'unique_violation',
    );
    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(harness.retrieveClientSecret).not.toHaveBeenCalled();
    expect(harness.markFailed).not.toHaveBeenCalled();
  });

  it('repropaga o erro de criação quando não existe pedido pendente concorrente', async () => {
    const harness = createHarness({
      create: async () => {
        throw new Error('db_indisponivel');
      },
    });

    await expect(harness.useCase.execute(baseInput)).rejects.toThrow(
      'db_indisponivel',
    );
    expect(harness.createPayment).not.toHaveBeenCalled();
  });

  it('não cobra quando o comprador não mantém mais a reserva do assento', async () => {
    const harness = createHarness({ renewResult: false });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(harness.setProviderRef).not.toHaveBeenCalled();
    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.clear).toHaveBeenCalledWith({
      userId: 'u1',
      eventSlug: EVENT_SLUG,
    });
    expect(result).toEqual({
      kind: 'seat_unavailable',
      seat: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
  });

  it('não cobra quando o espelho do assento não renova a reserva', async () => {
    const harness = createHarness({ renewSeatHoldResult: false });

    const result = await harness.useCase.execute(baseInput);

    expect(harness.createPayment).not.toHaveBeenCalled();
    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(result).toEqual({
      kind: 'seat_unavailable',
      seat: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
  });

  it('retorna seat_unavailable quando o assento não é encontrado', async () => {
    const harness = createHarness({
      seats: {
        'plateia:A:6': { seatId: 'seat-6', rowId: 'row-A', eventId: 'ev1' },
      },
    });

    const result = await harness.useCase.execute(baseInput);

    expect(result).toEqual({
      kind: 'seat_unavailable',
      seat: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '7' },
    });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.renew).not.toHaveBeenCalled();
    expect(harness.renewSeatHold).not.toHaveBeenCalled();
    expect(harness.createPayment).not.toHaveBeenCalled();
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
    expect(harness.renew).toHaveBeenCalledTimes(2);
    expect(harness.renewSeatHold).toHaveBeenCalledTimes(2);
    expect(harness.renew.mock.invocationCallOrder[0]).toBeLessThan(
      harness.createPayment.mock.invocationCallOrder[0],
    );
    expect(harness.renewSeatHold.mock.invocationCallOrder[0]).toBeLessThan(
      harness.createPayment.mock.invocationCallOrder[0],
    );
    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.setProviderRef).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'payment_failed' });
  });
});
