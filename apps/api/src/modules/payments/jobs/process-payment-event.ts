import type { OrderConfirmationQueue } from '../../emails/domain/order-confirmation-queue.js';
import type { ConfirmOrderPaymentUseCase } from '../../orders/use-cases/confirm-order-payment.use-case.js';
import type { ExpirePendingOrdersUseCase } from '../../orders/use-cases/expire-pending-orders.use-case.js';
import type { FailOrderUseCase } from '../../orders/use-cases/fail-order.use-case.js';
import type { PaymentEventType } from '../domain/payment-provider.js';
import type { TransferOrganizerShareUseCase } from '../use-cases/transfer-organizer-share.use-case.js';

export const PAYMENTS_QUEUE_NAME = 'payments';
export const PROCESS_PAYMENT_EVENT_JOB = 'process-payment-event';
export const EXPIRE_ORDERS_JOB_ID = 'expire-pending-orders';
export const EXPIRE_ORDERS_EVERY_MS = 30_000;
export const PAYMENT_JOB_ATTEMPTS = 6;
export const PAYMENT_JOB_BACKOFF_DELAY_MS = 5000;

export const PAYMENT_JOB_OPTIONS = {
  attempts: PAYMENT_JOB_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: PAYMENT_JOB_BACKOFF_DELAY_MS,
  },
  removeOnFail: true,
} as const;

export interface PaymentEventJobData {
  providerEventId: string;
  type: PaymentEventType;
  providerRef: string | null;
  amountCents: number | null;
}

export function createProcessPaymentEventJob(deps: {
  confirmOrderPayment: ConfirmOrderPaymentUseCase;
  failOrder: FailOrderUseCase;
  orderConfirmationQueue: OrderConfirmationQueue;
  transferOrganizerShare: TransferOrganizerShareUseCase;
}): (data: PaymentEventJobData) => Promise<void> {
  return async (data) => {
    if (data.providerRef === null) return;
    const providerRef = data.providerRef;

    switch (data.type) {
      case 'succeeded': {
        const result = await deps.confirmOrderPayment.execute({
          providerRef,
          amountCents: data.amountCents,
        });
        if (
          result.kind === 'paid' ||
          (result.kind === 'already' && result.status === 'paid')
        ) {
          try {
            await deps.transferOrganizerShare.execute({
              orderId: result.orderId,
            });
          } catch (error) {
            console.error('[worker] organizer transfer failed', error);
          }
          await deps.orderConfirmationQueue.enqueue({
            orderId: result.orderId,
          });
        }
        return;
      }
      case 'failed':
        await deps.failOrder.execute({ providerRef, terminal: 'failed' });
        return;
      case 'expired':
        await deps.failOrder.execute({ providerRef, terminal: 'expired' });
        return;
      case 'ignored':
        return;
    }
  };
}

export function createExpirePendingOrdersJob(deps: {
  expirePendingOrders: ExpirePendingOrdersUseCase;
}): () => Promise<number> {
  return async () => (await deps.expirePendingOrders.execute()).expired;
}
