import { splitAmounts } from '@ticketvibe/shared';

import type { EventsRepository } from '../../events/domain/events-repository.js';
import type { OrderRepository } from '../../orders/domain/order-repository.js';
import type { PaymentProvider } from '../domain/payment-provider.js';
import type { StripeAccountStore } from '../domain/stripe-account-store.js';

export type TransferOrganizerShareResult = 'transferred' | 'skipped' | 'failed';

export class TransferOrganizerShareUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventsRepository: EventsRepository,
    private readonly paymentProvider: PaymentProvider,
    private readonly stripeAccountStore: StripeAccountStore,
  ) {}

  async execute(input: {
    orderId: string;
  }): Promise<TransferOrganizerShareResult> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order) return 'skipped';
    if (order.transferStatus === 'succeeded') return 'transferred';
    if (order.status !== 'paid') return 'skipped';

    const [event] = await this.eventsRepository.findBySlugs([order.eventSlug]);
    const organizerId = event?.organizerId ?? null;
    if (!event || organizerId === null) return 'skipped';

    const stored = await this.stripeAccountStore.getByUserId(organizerId);
    if (!stored) {
      await this.orderRepository.setTransfer({
        orderId: order.id,
        status: 'skipped',
      });
      return 'skipped';
    }

    try {
      const { transferRef } = await this.paymentProvider.transfer({
        orderId: order.id,
        amountCents: splitAmounts(order.totalCents).organizerNetCents,
        destination: stored.stripeAccountId,
      });
      await this.orderRepository.setTransfer({
        orderId: order.id,
        status: 'succeeded',
        transferRef,
      });
    } catch {
      await this.orderRepository.setTransfer({
        orderId: order.id,
        status: 'failed',
      });
      return 'failed';
    }
    return 'transferred';
  }
}
