import type { StripeAccountStore } from '../domain/stripe-account-store.js';

export class InMemoryStripeAccountStore implements StripeAccountStore {
  private readonly accounts = new Map<string, string>();

  async getByUserId(
    userId: string,
  ): Promise<{ stripeAccountId: string } | null> {
    const stripeAccountId = this.accounts.get(userId);
    if (!stripeAccountId) return null;
    return { stripeAccountId };
  }

  async setByUserId(userId: string, stripeAccountId: string): Promise<void> {
    this.accounts.set(userId, stripeAccountId);
  }
}
