import type { EventsRepository } from '../../events/domain/events-repository.js';
import type { OrderRepository } from '../../orders/domain/order-repository.js';
import type { EmailSender } from '../domain/email-sender.js';
import { buildOrderConfirmationEmail } from '../domain/order-confirmation.js';
import type { OrderConfirmationRepository } from '../domain/order-confirmation-repository.js';

export interface OrderConfirmationJobData {
  orderId: string;
}

export function createOrderConfirmationJob(deps: {
  orders: OrderRepository;
  events: EventsRepository;
  confirmations: OrderConfirmationRepository;
  emailSender: EmailSender;
  now?: () => Date;
}): (data: OrderConfirmationJobData) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async (data) => {
    const state = await deps.confirmations.find(data.orderId);
    if (state?.status === 'sent') return;

    const order = await deps.orders.findById(data.orderId);
    if (!order) {
      console.warn('[worker] email job skipped: order not found');
      return;
    }

    if (order.status !== 'paid') {
      await deps.confirmations.markFailed({
        orderId: order.id,
        error: 'order_not_paid',
        now: now(),
      });
      return;
    }

    if (!order.buyerEmail) {
      await deps.confirmations.markFailed({
        orderId: order.id,
        error: 'missing_buyer_email',
        now: now(),
      });
      return;
    }

    const event = await deps.events.findBySlug(order.eventSlug);
    if (!event) {
      await deps.confirmations.markFailed({
        orderId: order.id,
        error: 'event_not_found',
        now: now(),
      });
      return;
    }

    const message = buildOrderConfirmationEmail({
      orderId: order.id,
      buyerEmail: order.buyerEmail,
      eventTitle: event.title,
      eventStartsAt: event.startsAt,
      venueName: event.venueName,
      venueCity: event.venueCity,
      venueState: event.venueState,
      items: order.items,
      subtotalCents: order.subtotalCents,
      serviceFeeCents: order.serviceFeeCents,
      totalCents: order.totalCents,
    });

    try {
      await deps.emailSender.send(message);
    } catch (error) {
      try {
        await deps.confirmations.markFailed({
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
          now: now(),
        });
      } catch (markError) {
        console.error(
          '[worker] email job could not record the send failure',
          markError,
        );
      }
      throw error;
    }

    await deps.confirmations.markSent({ orderId: order.id, now: now() });
  };
}
