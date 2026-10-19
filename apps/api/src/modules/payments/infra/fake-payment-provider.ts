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
  readonly cancelledRefs: string[] = [];
  private readonly clientSecrets = new Map<string, string>();
  private readonly refunded = new Set<string>();

  constructor(
    private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ??
      'whsec_test',
  ) {}

  async createPayment(
    _input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    const id = randomUUID();
    const providerRef = `pi_fake_${id}`;
    const clientSecret = `cs_fake_${id}`;
    this.clientSecrets.set(providerRef, clientSecret);
    return { providerRef, clientSecret };
  }

  async retrieveClientSecret(providerRef: string): Promise<string | null> {
    return this.clientSecrets.get(providerRef) ?? null;
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
    if (this.refunded.has(providerRef)) return;
    this.refunded.add(providerRef);
    this.refundedRefs.push(providerRef);
  }

  async cancelPayment(providerRef: string): Promise<void> {
    this.cancelledRefs.push(providerRef);
  }
}
