import type {
  PaymentEventInput,
  PaymentEventRepository,
} from '../domain/payment-event-repository.js';

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly recorded = new Set<string>();

  async record(input: PaymentEventInput): Promise<boolean> {
    if (this.recorded.has(input.providerEventId)) return false;
    this.recorded.add(input.providerEventId);
    return true;
  }
}
