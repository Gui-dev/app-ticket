import { describe, expect, it } from 'vitest';

import { createPaymentProvider } from './create-payment-provider.js';
import { FakePaymentProvider } from './infra/fake-payment-provider.js';
import { StripePaymentProvider } from './infra/stripe-payment-provider.js';
import { signStripeWebhook } from './infra/stripe-signature.js';

describe('createPaymentProvider', () => {
  it('retorna o provider fake sem PAYMENT_PROVIDER no ambiente', () => {
    const provider = createPaymentProvider({});
    expect(provider).toBeInstanceOf(FakePaymentProvider);
    expect(provider.providerName).toBe('fake');
  });

  it('lança stripe_provider_misconfigured quando faltam as chaves', () => {
    expect(() =>
      createPaymentProvider({
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      }),
    ).toThrow('stripe_provider_misconfigured');
    expect(() =>
      createPaymentProvider({
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_x',
      }),
    ).toThrow('stripe_provider_misconfigured');
  });

  it('retorna o provider stripe quando as chaves estão presentes', () => {
    const provider = createPaymentProvider({
      PAYMENT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });
    expect(provider).toBeInstanceOf(StripePaymentProvider);
    expect(provider.providerName).toBe('stripe');
  });

  it('usa o webhook secret do ambiente no provider fake', async () => {
    const provider = createPaymentProvider({
      STRIPE_WEBHOOK_SECRET: 'whsec_other',
    });
    const payload = JSON.stringify({ id: 'evt_1' });
    expect(
      await provider.parseWebhook({
        rawBody: payload,
        signature: signStripeWebhook(payload, 'whsec_test'),
      }),
    ).toBeNull();
    expect(
      await provider.parseWebhook({
        rawBody: payload,
        signature: signStripeWebhook(payload, 'whsec_other'),
      }),
    ).not.toBeNull();
  });
});
