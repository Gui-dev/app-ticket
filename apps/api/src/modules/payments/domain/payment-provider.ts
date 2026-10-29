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

export interface CreateConnectOnboardingInput {
  userId: string;
  accountId?: string | null;
}

export interface ConnectOnboardingResult {
  accountId: string;
  onboardingUrl: string;
}

export interface ConnectAccountStatus {
  payoutsEnabled: boolean;
}

export interface PaymentProvider {
  readonly providerName: 'stripe' | 'fake';
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  retrieveClientSecret(providerRef: string): Promise<string | null>;
  parseWebhook(input: {
    rawBody: string;
    signature: string | null;
  }): Promise<PaymentEvent | null>;
  refund(providerRef: string, amountCents?: number): Promise<void>;
  cancelPayment(providerRef: string): Promise<void>;
  createConnectOnboarding(
    input: CreateConnectOnboardingInput,
  ): Promise<ConnectOnboardingResult>;
  getConnectAccount(accountId: string): Promise<ConnectAccountStatus>;
}
