import type { EventsRepository } from '../../events/domain/events-repository.js';
import type { PaymentProvider } from '../../payments/domain/payment-provider.js';
import type { OrderRepository } from '../domain/order-repository.js';
import { refundAmountFor, refundOutcomeFor } from '../domain/refund-policy.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';

export type CancelOrderResult =
  | { kind: 'ok'; refundCents: number }
  | { kind: 'order_not_found' }
  | { kind: 'order_not_cancellable' }
  | { kind: 'refund_window_closed' }
  | { kind: 'refund_not_allowed' }
  | { kind: 'refund_provider_error' };

export class CancelOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventsRepository: EventsRepository,
    private readonly seatGateway: SeatCaptureGateway,
    private readonly paymentProvider: PaymentProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    orderId: string;
    userId: string;
  }): Promise<CancelOrderResult> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order || order.userId !== input.userId) {
      return { kind: 'order_not_found' };
    }
    if (order.status !== 'paid') {
      return { kind: 'order_not_cancellable' };
    }

    const [event] = await this.eventsRepository.findBySlugs([order.eventSlug]);
    const outcome = refundOutcomeFor({
      now: this.now(),
      startsAt: event?.startsAt ?? new Date(0),
      windowHours: event?.cancellationWindowHours,
      refundPercent: event?.refundPercent,
    });
    if (outcome === 'window_closed') {
      return { kind: 'refund_window_closed' };
    }
    if (outcome === 'not_allowed') {
      return { kind: 'refund_not_allowed' };
    }

    const refundCents = refundAmountFor(
      order.totalCents,
      event?.refundPercent ?? 100,
    );
    try {
      await this.paymentProvider.refund(order.providerRef ?? '', refundCents);
    } catch {
      return { kind: 'refund_provider_error' };
    }

    const gatewayResult = await this.seatGateway.cancelPaidOrder({
      orderId: order.id,
      refundCents,
    });
    if (gatewayResult.kind === 'not_paid') {
      return { kind: 'order_not_cancellable' };
    }
    return { kind: 'ok', refundCents };
  }
}
