import type { PaymentMethod } from '@ticketvibe/shared';

export interface CreatePaymentInput {
  orderId: string;
  amountCents: number;
  method: PaymentMethod;
  description: string;
  buyerEmail: string | null;
}

export interface CreatePaymentResult {
  providerRef: string;
  clientSecret: string | null;
}

export type PaymentEventType = 'succeeded' | 'failed' | 'expired' | 'ignored';

export interface PaymentEvent {
  providerEventId: string;
  type: PaymentEventType;
  providerRef: string | null;
  amountCents: number | null;
}

export interface PaymentProvider {
  readonly providerName: 'stripe' | 'fake';
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  retrieveClientSecret(providerRef: string): Promise<string | null>;
  parseWebhook(input: {
    rawBody: string;
    signature: string | null;
  }): Promise<PaymentEvent | null>;
  refund(providerRef: string): Promise<void>;
}
