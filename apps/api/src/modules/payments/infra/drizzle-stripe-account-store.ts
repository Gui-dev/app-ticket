import { eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import type { StripeAccountStore } from '../domain/stripe-account-store.js';

export class DrizzleStripeAccountStore implements StripeAccountStore {
  constructor(private readonly db: Db) {}

  async getByUserId(
    userId: string,
  ): Promise<{ stripeAccountId: string } | null> {
    const rows = await this.db
      .select({ stripeAccountId: user.stripeAccountId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row?.stripeAccountId) return null;
    return { stripeAccountId: row.stripeAccountId };
  }

  async setByUserId(userId: string, stripeAccountId: string): Promise<void> {
    await this.db
      .update(user)
      .set({ stripeAccountId })
      .where(eq(user.id, userId));
  }
}
