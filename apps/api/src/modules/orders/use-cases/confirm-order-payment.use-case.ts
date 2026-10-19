import type { OrderStatus } from '@ticketvibe/shared';

import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';

export type ConfirmOrderPaymentResult =
  | { kind: 'paid' }
  | { kind: 'already'; status: OrderStatus }
  | { kind: 'amount_mismatch' }
  | { kind: 'refunded' }
  | { kind: 'ignored' };

export class ConfirmOrderPaymentUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly seatCaptureGateway: SeatCaptureGateway,
    private readonly paymentProvider: PaymentProvider,
    private readonly holdRepository: HoldRepository,
    private readonly cartRepository: CartRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    providerRef: string;
    amountCents: number | null;
  }): Promise<ConfirmOrderPaymentResult> {
    const order = await this.orderRepository.findByProviderRef(
      input.providerRef,
    );
    if (!order) return { kind: 'ignored' };
    if (order.status !== 'pending') {
      return { kind: 'already', status: order.status };
    }

    const now = this.now();

    if (input.amountCents !== null && input.amountCents !== order.totalCents) {
      await this.orderRepository.markFailed({ orderId: order.id, now });
      await this.paymentProvider.refund(input.providerRef);
      await this.releaseSeats(order, now);
      return { kind: 'amount_mismatch' };
    }

    const capture = await this.seatCaptureGateway.confirmOrderPayment({
      providerRef: input.providerRef,
      now,
    });
    if (capture.kind === 'paid') return { kind: 'paid' };
    if (capture.kind === 'already') {
      return { kind: 'already', status: capture.status };
    }
    if (capture.kind === 'order_not_found') return { kind: 'ignored' };

    await this.paymentProvider.refund(input.providerRef);
    await this.releaseSeats(order, now);
    return { kind: 'refunded' };
  }

  private async releaseSeats(order: OrderRecord, now: Date): Promise<void> {
    const { seatKeys } = await this.seatCaptureGateway.releaseOrderSeats({
      orderId: order.id,
      now,
    });
    for (const seatKey of seatKeys) {
      await this.holdRepository.release(seatKey, order.userId);
    }
    await this.cartRepository.clear({
      userId: order.userId,
      eventSlug: order.eventSlug,
    });
  }
}
