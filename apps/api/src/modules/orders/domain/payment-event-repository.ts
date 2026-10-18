export interface PaymentEventInput {
  providerEventId: string;
  provider: string;
  type: string;
}

export interface PaymentEventRepository {
  record(input: PaymentEventInput): Promise<boolean>;
}
