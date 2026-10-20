import { eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { orderConfirmationEmails } from '../../../db/schema.js';
import type {
  OrderConfirmationRepository,
  OrderConfirmationState,
} from '../domain/order-confirmation-repository.js';

export class DrizzleOrderConfirmationRepository
  implements OrderConfirmationRepository
{
  constructor(private readonly db: Db) {}

  async find(orderId: string): Promise<OrderConfirmationState | null> {
    const [row] = await this.db
      .select({
        status: orderConfirmationEmails.status,
        sentAt: orderConfirmationEmails.sentAt,
        lastError: orderConfirmationEmails.lastError,
      })
      .from(orderConfirmationEmails)
      .where(eq(orderConfirmationEmails.orderId, orderId))
      .limit(1);

    return row ?? null;
  }

  async markSent(input: { orderId: string; now: Date }): Promise<void> {
    await this.db
      .insert(orderConfirmationEmails)
      .values({
        orderId: input.orderId,
        status: 'sent',
        sentAt: input.now,
        lastError: null,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: orderConfirmationEmails.orderId,
        set: {
          status: 'sent',
          sentAt: input.now,
          lastError: null,
          updatedAt: input.now,
        },
      });
  }

  async markFailed(input: {
    orderId: string;
    error: string;
    now: Date;
  }): Promise<void> {
    await this.db
      .insert(orderConfirmationEmails)
      .values({
        orderId: input.orderId,
        status: 'failed',
        lastError: input.error,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: orderConfirmationEmails.orderId,
        set: {
          status: 'failed',
          lastError: input.error,
          updatedAt: input.now,
        },
      });
  }
}
