import type { OrderStatus } from '@ticketvibe/shared';

import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { releaseOrderSeatsAndClearCart } from './release-order-seats-and-clear-cart.js';

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

    const now = this.now();

    if (order.status !== 'pending') {
      if (order.status === 'paid') {
        return { kind: 'already', status: 'paid' };
      }
      await this.refundAndReleaseSeats(order, input.providerRef, now);
      return { kind: 'refunded' };
    }

    if (input.amountCents !== null && input.amountCents !== order.totalCents) {
      await this.orderRepository.markFailed({ orderId: order.id, now });
      await this.refundAndReleaseSeats(order, input.providerRef, now);
      return { kind: 'amount_mismatch' };
    }

    const capture = await this.seatCaptureGateway.confirmOrderPayment({
      providerRef: input.providerRef,
      now,
    });
    if (capture.kind === 'paid') return { kind: 'paid' };
    if (capture.kind === 'already') {
      if (capture.status === 'paid') {
        return { kind: 'already', status: 'paid' };
      }
      await this.refundAndReleaseSeats(order, input.providerRef, now);
      return { kind: 'refunded' };
    }
    if (capture.kind === 'order_not_found') return { kind: 'ignored' };

    await this.refundAndReleaseSeats(order, input.providerRef, now);
    return { kind: 'refunded' };
  }

  private async refundAndReleaseSeats(
    order: OrderRecord,
    providerRef: string,
    now: Date,
  ): Promise<void> {
    await this.paymentProvider.refund(providerRef);
    await releaseOrderSeatsAndClearCart({
      seatCaptureGateway: this.seatCaptureGateway,
      holdRepository: this.holdRepository,
      cartRepository: this.cartRepository,
      order: {
        orderId: order.id,
        userId: order.userId,
        eventSlug: order.eventSlug,
      },
      now,
    });
  }
}
