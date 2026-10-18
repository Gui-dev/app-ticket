import type { Db } from '../../../db/client.js';
import { paymentEvents } from '../../../db/schema.js';
import type {
  PaymentEventInput,
  PaymentEventRepository,
} from '../domain/payment-event-repository.js';

export class DrizzlePaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly db: Db) {}

  async record(input: PaymentEventInput): Promise<boolean> {
    const result = await this.db
      .insert(paymentEvents)
      .values({
        providerEventId: input.providerEventId,
        provider: input.provider,
        type: input.type,
      })
      .onConflictDoNothing({ target: paymentEvents.providerEventId });
    return (result.rowCount ?? 0) > 0;
  }
}
