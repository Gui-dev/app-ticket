import { randomUUID } from 'node:crypto';

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
} from '../domain/payment-provider.js';
import { verifyStripeSignature } from './stripe-signature.js';

interface StripeWebhookPayload {
  id?: string;
  type?: string;
  data?: { object?: { id?: string; amount_received?: number } };
}

const EVENT_TYPES = new Map<string, PaymentEventType>([
  ['payment_intent.succeeded', 'succeeded'],
  ['payment_intent.payment_failed', 'failed'],
  ['payment_intent.canceled', 'expired'],
]);

function parsePayload(rawBody: string): StripeWebhookPayload | null {
  try {
    return JSON.parse(rawBody) as StripeWebhookPayload;
  } catch {
    return null;
  }
}

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
    return mapEvent({
      providerEventId: payload.id ?? '',
      type: payload.type ?? '',
      providerRef: payload.data?.object?.id ?? null,
      amountCents: payload.data?.object?.amount_received ?? null,
    });
  }

  async refund(providerRef: string): Promise<void> {
    this.refundedRefs.push(providerRef);
  }
}
