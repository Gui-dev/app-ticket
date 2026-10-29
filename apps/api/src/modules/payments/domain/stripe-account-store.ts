export interface StripeAccountStore {
  getByUserId(userId: string): Promise<{ stripeAccountId: string } | null>;
  setByUserId(userId: string, stripeAccountId: string): Promise<void>;
}
