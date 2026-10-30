import { describe, expect, it, vi } from 'vitest';

import type { EventEntity } from '../../events/domain/event-entity.js';
import type { OrderRecord } from '../../orders/domain/order-entity.js';
import type { OrderRepository } from '../../orders/domain/order-repository.js';
import type { PaymentProvider } from '../domain/payment-provider.js';
import type { StripeAccountStore } from '../domain/stripe-account-store.js';
import { TransferOrganizerShareUseCase } from './transfer-organizer-share.use-case.js';

const ORDER_ID = '550e8400-e29b-41d4-a716-446655440000';
const EVENT_SLUG = 'show-do-organizador';
const ORGANIZER_ID = 'user-a';
const ACCOUNT_ID = 'acct_fake_user-a';

function paidOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: ORDER_ID,
    userId: 'buyer-1',
    eventId: 'ev1',
    eventSlug: EVENT_SLUG,
    status: 'paid',
    paymentMethod: 'card',
    provider: 'fake',
    providerRef: 'pi_fake_1',
    buyerEmail: 'comprador@example.com',
    subtotalCents: 12000,
    serviceFeeCents: 1200,
    totalCents: 13200,
    refundCents: null,
    transferStatus: 'none',
    transferRef: null,
    createdAt: new Date('2026-10-18T12:00:00.000Z'),
    paidAt: new Date('2026-10-18T12:05:00.000Z'),
    items: [],
    ...overrides,
  };
}

interface HarnessOptions {
  order?: OrderRecord | null;
  event?: EventEntity | null;
  stripeAccountId?: string | null;
  transferError?: Error;
}

function createHarness(options: HarnessOptions = {}) {
  const order = options.order === undefined ? paidOrder() : options.order;
  const findById = vi.fn(async () => order);
  const setTransfer = vi.fn(async () => undefined);
  const orderRepository = {
    findById,
    setTransfer,
  } as unknown as OrderRepository;

  const event =
    options.event === undefined
      ? ({
          id: 'ev1',
          slug: EVENT_SLUG,
          title: 'Show do Organizador',
          description: 'Descrição longa o suficiente para o show testado.',
          categorySlug: 'shows',
          categoryName: 'Shows',
          venueSlug: 'arena-sp',
          venueName: 'Arena SP',
          venueCity: 'São Paulo',
          venueState: 'SP',
          startsAt: new Date('2026-12-01T20:00:00.000Z'),
          priceFromCents: 12000,
          imageUrl: null,
          badgeLabel: null,
          featured: false,
          isHot: false,
          organizerId: ORGANIZER_ID,
        } satisfies EventEntity)
      : options.event;
  const findBySlugs = vi.fn(async () => (event ? [event] : []));

  const transfer = vi.fn(async () => {
    if (options.transferError) throw options.transferError;
    return { transferRef: 'tr_fake_1' };
  });
  const paymentProvider = { transfer } as unknown as PaymentProvider;

  const getByUserId = vi.fn(async () =>
    options.stripeAccountId === null || options.stripeAccountId === undefined
      ? null
      : { stripeAccountId: options.stripeAccountId },
  );
  const stripeAccountStore = { getByUserId } as unknown as StripeAccountStore;

  const useCase = new TransferOrganizerShareUseCase(
    orderRepository,
    {
      findBySlugs,
    } as never,
    paymentProvider,
    stripeAccountStore,
  );

  return { useCase, findById, setTransfer, findBySlugs, transfer, getByUserId };
}

describe('TransferOrganizerShareUseCase', () => {
  it('faz o repasse do líquido do pedido pago para a conta conectada', async () => {
    const harness = createHarness({
      stripeAccountId: ACCOUNT_ID,
    });

    await expect(harness.useCase.execute({ orderId: ORDER_ID })).resolves.toBe(
      'transferred',
    );

    expect(harness.transfer).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      amountCents: 12000,
      destination: ACCOUNT_ID,
    });
    expect(harness.setTransfer).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      status: 'succeeded',
      transferRef: 'tr_fake_1',
    });
  });

  it('ignora eventos da plataforma sem alterar o status do repasse', async () => {
    const harness = createHarness({
      event: null,
    });

    await expect(harness.useCase.execute({ orderId: ORDER_ID })).resolves.toBe(
      'skipped',
    );

    expect(harness.transfer).not.toHaveBeenCalled();
    expect(harness.setTransfer).not.toHaveBeenCalled();
  });

  it('marca skipped quando o organizador não tem conta conectada', async () => {
    const harness = createHarness({ stripeAccountId: null });

    await expect(harness.useCase.execute({ orderId: ORDER_ID })).resolves.toBe(
      'skipped',
    );

    expect(harness.transfer).not.toHaveBeenCalled();
    expect(harness.setTransfer).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      status: 'skipped',
    });
  });

  it('não repassa pedido que deixou de estar pago e preserva o status', async () => {
    const harness = createHarness({
      order: paidOrder({ status: 'refunded' }),
      stripeAccountId: ACCOUNT_ID,
    });

    await expect(harness.useCase.execute({ orderId: ORDER_ID })).resolves.toBe(
      'skipped',
    );

    expect(harness.transfer).not.toHaveBeenCalled();
    expect(harness.setTransfer).not.toHaveBeenCalled();
  });

  it('marca failed quando o provedor falha e o pedido segue pago', async () => {
    const harness = createHarness({
      stripeAccountId: ACCOUNT_ID,
      transferError: new Error('Stripe indisponível'),
    });

    await expect(harness.useCase.execute({ orderId: ORDER_ID })).resolves.toBe(
      'failed',
    );

    expect(harness.setTransfer).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      status: 'failed',
    });
  });

  it('retorna transferred sem chamar o provedor quando o repasse já foi concluído', async () => {
    const harness = createHarness({
      order: paidOrder({ transferStatus: 'succeeded' }),
      stripeAccountId: ACCOUNT_ID,
    });

    await expect(harness.useCase.execute({ orderId: ORDER_ID })).resolves.toBe(
      'transferred',
    );

    expect(harness.transfer).not.toHaveBeenCalled();
    expect(harness.setTransfer).not.toHaveBeenCalled();
  });
});
