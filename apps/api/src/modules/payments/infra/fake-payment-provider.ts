import { randomUUID } from 'node:crypto';

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentEvent,
  PaymentProvider,
} from '../domain/payment-provider.js';
import { mapStripeEvent } from './stripe-event-mapper.js';
import { verifyStripeSignature } from './stripe-signature.js';

interface StripeWebhookPayload {
  id?: string;
  type?: string;
  data?: { object?: { id?: string; amount_received?: number } };
}

function parsePayload(rawBody: string): StripeWebhookPayload | null {
  try {
    return JSON.parse(rawBody) as StripeWebhookPayload;
  } catch {
    return null;
  }
}

export class FakePaymentProvider implements PaymentProvider {
  readonly providerName = 'fake';
  readonly refundedRefs: string[] = [];

  constructor(
    private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ??
      'whsec_test',
  ) {}

  async createPayment(
    _input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    return { providerRef: `pi_fake_${randomUUID()}`, clientSecret: null };
  }

  async parseWebhook(input: {
    rawBody: string;
    signature: string | null;
  }): Promise<PaymentEvent | null> {
    if (
      !verifyStripeSignature({
        rawBody: input.rawBody,
        signature: input.signature,
        secret: this.webhookSecret,
      })
    ) {
      return null;
    }
    const payload = parsePayload(input.rawBody);
    if (!payload) return null;
    return mapStripeEvent({
      id: payload.id ?? '',
      type: payload.type ?? '',
      data: { object: payload.data?.object ?? {} },
    });
  }

  async refund(providerRef: string): Promise<void> {
    this.refundedRefs.push(providerRef);
  }
}
