import { randomUUID } from 'node:crypto';

import type {
  ConnectAccountStatus,
  ConnectOnboardingResult,
  CreateConnectOnboardingInput,
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
  readonly transfers: {
    orderId: string;
    amountCents: number;
    destination: string;
    transferRef: string;
  }[] = [];
  failNextTransfer = false;
  private readonly clientSecrets = new Map<string, string>();
  private readonly refunded = new Set<string>();
  private readonly connectAccounts = new Set<string>();

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

  async refund(providerRef: string, _amountCents?: number): Promise<void> {
    if (this.refunded.has(providerRef)) return;
    this.refunded.add(providerRef);
    this.refundedRefs.push(providerRef);
  }

  async cancelPayment(providerRef: string): Promise<void> {
    this.cancelledRefs.push(providerRef);
  }

  async createConnectOnboarding(
    input: CreateConnectOnboardingInput,
  ): Promise<ConnectOnboardingResult> {
    const accountId = `acct_fake_${input.userId}`;
    this.connectAccounts.add(accountId);
    return {
      accountId,
      onboardingUrl: `https://connect.stripe.com/fake/${accountId}/onboarding`,
    };
  }

  async getConnectAccount(accountId: string): Promise<ConnectAccountStatus> {
    return { payoutsEnabled: this.connectAccounts.has(accountId) };
  }

  async transfer(input: {
    orderId: string;
    amountCents: number;
    destination: string;
  }): Promise<{ transferRef: string }> {
    if (this.failNextTransfer) {
      this.failNextTransfer = false;
      throw new Error('Fake transfer failure');
    }
    const id = randomUUID();
    const transferRef = `tr_fake_${id}`;
    this.transfers.push({ ...input, transferRef });
    return { transferRef };
  }
}
