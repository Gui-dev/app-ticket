import Stripe from 'stripe';

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
} from '../domain/payment-provider.js';

interface StripePaymentProviderConfig {
  secretKey: string;
  webhookSecret: string;
}

const EVENT_TYPES = new Map<string, PaymentEventType>([
  ['payment_intent.succeeded', 'succeeded'],
  ['payment_intent.payment_failed', 'failed'],
  ['payment_intent.canceled', 'expired'],
]);

function mapEvent(input: {
  providerEventId: string;
  type: string;
  providerRef: string | null;
  amountCents: number | null;
}): PaymentEvent {
  const type = EVENT_TYPES.get(input.type) ?? 'ignored';
  return {
    providerEventId: input.providerEventId,
    type,
    providerRef: input.providerRef,
    amountCents: type === 'succeeded' ? input.amountCents : null,
  };
}

export class StripePaymentProvider implements PaymentProvider {
  readonly providerName = 'stripe';
  private readonly stripe: Stripe;

  constructor(private readonly config: StripePaymentProviderConfig) {
    this.stripe = new Stripe(config.secretKey);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: 'brl',
      allowed_payment_method_types: [
        input.method === 'card' ? 'card' : 'boleto',
      ],
      description: input.description,
      metadata: { orderId: input.orderId },
      receipt_email: input.buyerEmail ?? undefined,
    });
    return { providerRef: intent.id, clientSecret: intent.client_secret };
  }

  async parseWebhook(input: {
    rawBody: string;
    signature: string | null;
  }): Promise<PaymentEvent | null> {
    if (!input.signature) return null;
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        input.rawBody,
        input.signature,
        this.config.webhookSecret,
      );
    } catch {
      return null;
    }
    const object = event.data.object as {
      id?: string;
      amount_received?: number;
    };
    return mapEvent({
      providerEventId: event.id,
      type: event.type,
      providerRef: object.id ?? null,
      amountCents: object.amount_received ?? null,
    });
  }

  async refund(providerRef: string): Promise<void> {
    await this.stripe.refunds.create({ payment_intent: providerRef });
  }
}
