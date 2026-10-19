import { describe, expect, it, vi } from 'vitest';

import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type {
  ConfirmPaidResult,
  SeatCaptureGateway,
} from '../domain/seat-capture-gateway.js';
import { ConfirmOrderPaymentUseCase } from './confirm-order-payment.use-case.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const EVENT_SLUG = 'o-fantasma-da-opera';
const SEAT_KEY = holdSeatKey('ev1', 'row-A', 'seat-6');

function pendingOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order-1',
    userId: 'u1',
    eventId: 'ev1',
    eventSlug: EVENT_SLUG,
    status: 'pending',
    paymentMethod: 'boleto',
    provider: 'fake',
    providerRef: 'pi_1',
    subtotalCents: 12000,
    serviceFeeCents: 1200,
    totalCents: 13200,
    createdAt: new Date('2026-10-18T11:50:00.000Z'),
    paidAt: null,
    items: [],
    ...overrides,
  };
}

interface HarnessOptions {
  order?: OrderRecord | null;
  capture?: ConfirmPaidResult;
  seatKeys?: string[];
}

function createHarness(options: HarnessOptions = {}) {
  const order = options.order === undefined ? pendingOrder() : options.order;
  const findByProviderRef = vi.fn(async () => order);
  const markFailed = vi.fn(async () => undefined);
  const orderRepository = {
    findByProviderRef,
    markFailed,
  } as unknown as OrderRepository;

  const captureResult = options.capture ?? { kind: 'paid' as const };
  const confirmOrderPayment = vi.fn(async () => captureResult);
  const releaseOrderSeats = vi.fn(async () => ({
    seatKeys: options.seatKeys ?? [SEAT_KEY],
  }));
  const seatCaptureGateway = {
    confirmOrderPayment,
    releaseOrderSeats,
  } as unknown as SeatCaptureGateway;

  const refund = vi.fn(async () => undefined);
  const paymentProvider = { refund } as unknown as PaymentProvider;

  const release = vi.fn(async () => true);
  const holdRepository = { release } as unknown as HoldRepository;

  const clear = vi.fn(async () => undefined);
  const cartRepository = { clear } as unknown as CartRepository;

  const useCase = new ConfirmOrderPaymentUseCase(
    orderRepository,
    seatCaptureGateway,
    paymentProvider,
    holdRepository,
    cartRepository,
    () => NOW,
  );

  return {
    useCase,
    findByProviderRef,
    markFailed,
    confirmOrderPayment,
    releaseOrderSeats,
    refund,
    release,
    clear,
  };
}

describe('ConfirmOrderPaymentUseCase', () => {
  it('confirma o pedido pago e não reembolsa nem libera assentos', async () => {
    const harness = createHarness({ capture: { kind: 'paid' } });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: 13200,
    });

    expect(result).toEqual({ kind: 'paid' });
    expect(harness.findByProviderRef).toHaveBeenCalledWith('pi_1');
    expect(harness.confirmOrderPayment).toHaveBeenCalledWith({
      providerRef: 'pi_1',
      now: NOW,
    });
    expect(harness.refund).not.toHaveBeenCalled();
    expect(harness.releaseOrderSeats).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.clear).not.toHaveBeenCalled();
  });

  it('confirma mesmo quando o evento não traz o valor', async () => {
    const harness = createHarness({ capture: { kind: 'paid' } });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: null,
    });

    expect(result).toEqual({ kind: 'paid' });
  });

  it('ignora uma referência de pagamento desconhecida', async () => {
    const harness = createHarness({ order: null });

    const result = await harness.useCase.execute({
      providerRef: 'pi_x',
      amountCents: 13200,
    });

    expect(result).toEqual({ kind: 'ignored' });
    expect(harness.confirmOrderPayment).not.toHaveBeenCalled();
    expect(harness.refund).not.toHaveBeenCalled();
  });

  it('não rebaixa um pedido já pago', async () => {
    const harness = createHarness({ order: pendingOrder({ status: 'paid' }) });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: 13200,
    });

    expect(result).toEqual({ kind: 'already', status: 'paid' });
    expect(harness.confirmOrderPayment).not.toHaveBeenCalled();
    expect(harness.refund).not.toHaveBeenCalled();
    expect(harness.releaseOrderSeats).not.toHaveBeenCalled();
    expect(harness.clear).not.toHaveBeenCalled();
  });

  it('reembolsa e libera os assentos quando a captura perde a corrida', async () => {
    const harness = createHarness({
      capture: { kind: 'seats_lost' },
      seatKeys: [SEAT_KEY],
    });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: 13200,
    });

    expect(result).toEqual({ kind: 'refunded' });
    expect(harness.refund).toHaveBeenCalledWith('pi_1');
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.release).toHaveBeenCalledWith(SEAT_KEY, 'u1');
    expect(harness.clear).toHaveBeenCalledWith({
      userId: 'u1',
      eventSlug: EVENT_SLUG,
    });
  });

  it('reembolsa em divergência de valor sem capturar', async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: 100,
    });

    expect(result).toEqual({ kind: 'amount_mismatch' });
    expect(harness.markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.refund).toHaveBeenCalledWith('pi_1');
    expect(harness.releaseOrderSeats).toHaveBeenCalledWith({
      orderId: 'order-1',
      now: NOW,
    });
    expect(harness.release).toHaveBeenCalledWith(SEAT_KEY, 'u1');
    expect(harness.clear).toHaveBeenCalledWith({
      userId: 'u1',
      eventSlug: EVENT_SLUG,
    });
    expect(harness.confirmOrderPayment).not.toHaveBeenCalled();
  });

  it('ignora quando o gateway não encontra o pedido', async () => {
    const harness = createHarness({ capture: { kind: 'order_not_found' } });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: 13200,
    });

    expect(result).toEqual({ kind: 'ignored' });
    expect(harness.refund).not.toHaveBeenCalled();
  });

  it('propaga o status já definido pelo gateway', async () => {
    const harness = createHarness({
      capture: { kind: 'already', status: 'failed' },
    });

    const result = await harness.useCase.execute({
      providerRef: 'pi_1',
      amountCents: 13200,
    });

    expect(result).toEqual({ kind: 'already', status: 'failed' });
    expect(harness.refund).not.toHaveBeenCalled();
  });
});
