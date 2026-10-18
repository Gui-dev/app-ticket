import { describe, expect, it } from 'vitest';

import { FakePaymentProvider } from './fake-payment-provider.js';
import { signStripeWebhook } from './stripe-signature.js';

const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

describe('FakePaymentProvider', () => {
  it('cria uma referência de pagamento fake determinística', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createPayment({
      orderId: 'order-1',
      amountCents: 13200,
      method: 'card',
      description: 'Pedido order-1',
      buyerEmail: 'buyer@example.com',
    });
    expect(provider.providerName).toBe('fake');
    expect(result.providerRef).toMatch(/^pi_fake_/);
    expect(result.clientSecret).toBeNull();
  });

  it('aceita webhook assinado pelo stripe e mapeia para succeeded', async () => {
    const provider = new FakePaymentProvider();
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_fake_1', amount_received: 13200 } },
    });
    const header = signStripeWebhook(payload, secret);
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: header,
    });
    expect(event).toEqual({
      providerEventId: 'evt_1',
      type: 'succeeded',
      providerRef: 'pi_fake_1',
      amountCents: 13200,
    });
  });

  it('rejeita payload adulterado e ignora tipos desconhecidos', async () => {
    const provider = new FakePaymentProvider();
    const header = signStripeWebhook('{"id":"evt_1"}', secret);
    expect(
      await provider.parseWebhook({
        rawBody: '{"id":"evt_2"}',
        signature: header,
      }),
    ).toBeNull();

    const unknown = JSON.stringify({
      id: 'evt_3',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1' } },
    });
    const event = await provider.parseWebhook({
      rawBody: unknown,
      signature: signStripeWebhook(unknown, secret),
    });
    expect(event?.type).toBe('ignored');
  });

  it('rejeita webhook com timestamp fora da tolerância', async () => {
    const provider = new FakePaymentProvider();
    const payload = JSON.stringify({ id: 'evt_1' });
    const stale = Math.floor(Date.now() / 1000) - 1000;
    expect(
      await provider.parseWebhook({
        rawBody: payload,
        signature: signStripeWebhook(payload, secret, stale),
      }),
    ).toBeNull();
  });

  it('trata nomes de tipo herdados como ignored', async () => {
    const provider = new FakePaymentProvider();
    const payload = JSON.stringify({
      id: 'evt_5',
      type: 'constructor',
      data: { object: { id: 'pi_5' } },
    });
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: signStripeWebhook(payload, secret),
    });
    expect(event?.type).toBe('ignored');
  });

  it('registra estornos em memória', async () => {
    const provider = new FakePaymentProvider();
    await provider.refund('pi_fake_1');
    expect(provider.refundedRefs).toEqual(['pi_fake_1']);
  });
});
