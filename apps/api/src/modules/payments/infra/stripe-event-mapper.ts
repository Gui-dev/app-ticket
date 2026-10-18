import type {
  PaymentEvent,
  PaymentEventType,
} from '../domain/payment-provider.js';

export interface StripeEventInput {
  id: string;
  type: string;
  data: { object: { id?: string; amount_received?: number } };
}

const EVENT_TYPES = new Map<string, PaymentEventType>([
  ['payment_intent.succeeded', 'succeeded'],
  ['payment_intent.payment_failed', 'failed'],
  ['payment_intent.canceled', 'expired'],
]);

export function mapStripeEvent(event: StripeEventInput): PaymentEvent {
  const type = EVENT_TYPES.get(event.type) ?? 'ignored';
  return {
    providerEventId: event.id,
    type,
    providerRef: event.data.object.id ?? null,
    amountCents:
      type === 'succeeded' ? (event.data.object.amount_received ?? null) : null,
  };
}
