import { describe, expect, it, vi } from 'vitest';

import type { ConfirmOrderPaymentUseCase } from '../../orders/use-cases/confirm-order-payment.use-case.js';
import type { ExpirePendingOrdersUseCase } from '../../orders/use-cases/expire-pending-orders.use-case.js';
import type { FailOrderUseCase } from '../../orders/use-cases/fail-order.use-case.js';
import {
  createExpirePendingOrdersJob,
  createProcessPaymentEventJob,
  EXPIRE_ORDERS_EVERY_MS,
  EXPIRE_ORDERS_JOB_ID,
  PAYMENTS_QUEUE_NAME,
  type PaymentEventJobData,
  PROCESS_PAYMENT_EVENT_JOB,
} from './process-payment-event.js';

function createHarness() {
  const confirmExecute = vi.fn(async () => ({ kind: 'paid' as const }));
  const failExecute = vi.fn(async () => ({
    kind: 'terminal' as const,
    status: 'failed' as const,
  }));
  const expireExecute = vi.fn(async () => ({ expired: 3 }));

  const confirmOrderPayment = {
    execute: confirmExecute,
  } as unknown as ConfirmOrderPaymentUseCase;
  const failOrder = { execute: failExecute } as unknown as FailOrderUseCase;
  const expirePendingOrders = {
    execute: expireExecute,
  } as unknown as ExpirePendingOrdersUseCase;

  return {
    processPaymentEvent: createProcessPaymentEventJob({
      confirmOrderPayment,
      failOrder,
    }),
    expireJob: createExpirePendingOrdersJob({ expirePendingOrders }),
    confirmExecute,
    failExecute,
    expireExecute,
  };
}

const SUCCEEDED: PaymentEventJobData = {
  providerEventId: 'evt_1',
  type: 'succeeded',
  providerRef: 'pi_1',
  amountCents: 13200,
};

describe('process payment event job', () => {
  it('expõe o nome da fila e a cadência do agendador', () => {
    expect(PAYMENTS_QUEUE_NAME).toBe('payments');
    expect(PROCESS_PAYMENT_EVENT_JOB).toBe('process-payment-event');
    expect(EXPIRE_ORDERS_JOB_ID).toBe('expire-pending-orders');
    expect(EXPIRE_ORDERS_EVERY_MS).toBe(30_000);
  });

  it('confirma o pedido em um evento succeeded', async () => {
    const harness = createHarness();

    await harness.processPaymentEvent(SUCCEEDED);

    expect(harness.confirmExecute).toHaveBeenCalledWith({
      providerRef: 'pi_1',
      amountCents: 13200,
    });
    expect(harness.failExecute).not.toHaveBeenCalled();
  });

  it('marca failed em um evento failed', async () => {
    const harness = createHarness();

    await harness.processPaymentEvent({
      ...SUCCEEDED,
      type: 'failed',
      amountCents: null,
    });

    expect(harness.failExecute).toHaveBeenCalledWith({
      providerRef: 'pi_1',
      terminal: 'failed',
    });
    expect(harness.confirmExecute).not.toHaveBeenCalled();
  });

  it('marca expired em um evento expired', async () => {
    const harness = createHarness();

    await harness.processPaymentEvent({
      ...SUCCEEDED,
      type: 'expired',
      amountCents: null,
    });

    expect(harness.failExecute).toHaveBeenCalledWith({
      providerRef: 'pi_1',
      terminal: 'expired',
    });
    expect(harness.confirmExecute).not.toHaveBeenCalled();
  });

  it('ignora eventos ignored', async () => {
    const harness = createHarness();

    await harness.processPaymentEvent({
      ...SUCCEEDED,
      type: 'ignored',
      amountCents: null,
    });

    expect(harness.confirmExecute).not.toHaveBeenCalled();
    expect(harness.failExecute).not.toHaveBeenCalled();
  });

  it('não age sem referência do provedor', async () => {
    const harness = createHarness();

    await harness.processPaymentEvent({ ...SUCCEEDED, providerRef: null });
    await harness.processPaymentEvent({
      ...SUCCEEDED,
      type: 'failed',
      providerRef: null,
      amountCents: null,
    });
    await harness.processPaymentEvent({
      ...SUCCEEDED,
      type: 'expired',
      providerRef: null,
      amountCents: null,
    });

    expect(harness.confirmExecute).not.toHaveBeenCalled();
    expect(harness.failExecute).not.toHaveBeenCalled();
  });

  it('devolve a contagem de pedidos expirados', async () => {
    const harness = createHarness();

    await expect(harness.expireJob()).resolves.toBe(3);
    expect(harness.expireExecute).toHaveBeenCalledWith();
  });
});
