import Stripe from 'stripe';

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentEvent,
  PaymentProvider,
} from '../domain/payment-provider.js';
import { mapStripeEvent } from './stripe-event-mapper.js';

interface StripePaymentProviderConfig {
  secretKey: string;
  webhookSecret: string;
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

  async retrieveClientSecret(providerRef: string): Promise<string | null> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(providerRef);
      return intent.client_secret ?? null;
    } catch {
      return null;
    }
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
    return mapStripeEvent({
      id: event.id,
      type: event.type,
      data: { object },
    });
  }

  async refund(providerRef: string): Promise<void> {
    await this.stripe.refunds.create(
      { payment_intent: providerRef },
      { idempotencyKey: `refund-${providerRef}` },
    );
  }
}
