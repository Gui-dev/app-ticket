import type { PaymentProvider } from './domain/payment-provider.js';
import { FakePaymentProvider } from './infra/fake-payment-provider.js';
import { StripePaymentProvider } from './infra/stripe-payment-provider.js';

export function createPaymentProvider(
  env: NodeJS.ProcessEnv = process.env,
): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'stripe') {
    const secretKey = env.STRIPE_SECRET_KEY;
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey || !webhookSecret) {
      throw new Error('stripe_provider_misconfigured');
    }
    return new StripePaymentProvider({ secretKey, webhookSecret });
  }
  return new FakePaymentProvider(env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test');
}
