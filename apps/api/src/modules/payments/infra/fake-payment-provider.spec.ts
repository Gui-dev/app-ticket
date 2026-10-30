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
    expect(result.clientSecret).toMatch(/^cs_fake_/);
  });

  it('recupera o client secret criado para a mesma referência', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createPayment({
      orderId: 'order-1',
      amountCents: 13200,
      method: 'card',
      description: 'Pedido order-1',
      buyerEmail: 'buyer@example.com',
    });

    expect(await provider.retrieveClientSecret(result.providerRef)).toBe(
      result.clientSecret,
    );
  });

  it('devolve null para uma referência de pagamento desconhecida', async () => {
    const provider = new FakePaymentProvider();

    expect(
      await provider.retrieveClientSecret('pi_fake_desconhecida'),
    ).toBeNull();
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

  it('mapeia evento sem id no objeto com providerRef nulo', async () => {
    const provider = new FakePaymentProvider();
    const payload = JSON.stringify({
      id: 'evt_6',
      type: 'payment_intent.succeeded',
      data: { object: { amount_received: 5000 } },
    });
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: signStripeWebhook(payload, secret),
    });
    expect(event).toEqual({
      providerEventId: 'evt_6',
      type: 'succeeded',
      providerRef: null,
      amountCents: 5000,
    });
  });

  it('registra estornos em memória', async () => {
    const provider = new FakePaymentProvider();
    await provider.refund('pi_fake_1');
    expect(provider.refundedRefs).toEqual(['pi_fake_1']);
  });

  it('registra o reembolso parcial ignorando o amount informado', async () => {
    const provider = new FakePaymentProvider();
    await provider.refund('pi_fake_1', 6300);
    await provider.refund('pi_fake_1', 100);
    expect(provider.refundedRefs).toEqual(['pi_fake_1']);
  });

  it('registra o reembolso apenas uma vez para a mesma referência', async () => {
    const provider = new FakePaymentProvider();
    await provider.refund('pi_fake_1');
    await provider.refund('pi_fake_1');
    await provider.refund('pi_fake_2');
    expect(provider.refundedRefs).toEqual(['pi_fake_1', 'pi_fake_2']);
  });

  it('registra o cancelamento da referência de pagamento', async () => {
    const provider = new FakePaymentProvider();
    await provider.cancelPayment('pi_fake_1');
    await provider.cancelPayment('pi_fake_2');
    expect(provider.cancelledRefs).toEqual(['pi_fake_1', 'pi_fake_2']);
  });

  it('cria onboarding de connect com conta fake determinística', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createConnectOnboarding({ userId: 'user-a' });
    expect(result.accountId).toBe('acct_fake_user-a');
    expect(result.onboardingUrl).toBe(
      'https://connect.stripe.com/fake/acct_fake_user-a/onboarding',
    );
  });

  it('reutiliza a mesma conta fake no onboarding repetido', async () => {
    const provider = new FakePaymentProvider();
    const first = await provider.createConnectOnboarding({ userId: 'user-a' });
    const second = await provider.createConnectOnboarding({ userId: 'user-a' });
    expect(second.accountId).toBe(first.accountId);
    expect(second.onboardingUrl).toBe(first.onboardingUrl);
  });

  it('marca a conta conectada como pronta para repasses imediatamente', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createConnectOnboarding({ userId: 'user-a' });
    await expect(provider.getConnectAccount(result.accountId)).resolves.toEqual(
      { payoutsEnabled: true },
    );
  });

  it('devolve payoutsEnabled false para conta connect desconhecida', async () => {
    const provider = new FakePaymentProvider();
    await expect(
      provider.getConnectAccount('acct_fake_desconhecida'),
    ).resolves.toEqual({ payoutsEnabled: false });
  });

  it('registra a transferência do repasse com referência fake', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.transfer({
      orderId: 'order-1',
      amountCents: 11880,
      destination: 'acct_fake_user-a',
    });
    expect(result.transferRef).toMatch(/^tr_fake_/);
    expect(provider.transfers).toEqual([
      {
        orderId: 'order-1',
        amountCents: 11880,
        destination: 'acct_fake_user-a',
        transferRef: result.transferRef,
      },
    ]);
  });

  it('lança uma única vez quando a próxima transferência deve falhar', async () => {
    const provider = new FakePaymentProvider();
    provider.failNextTransfer = true;
    await expect(
      provider.transfer({
        orderId: 'order-1',
        amountCents: 11880,
        destination: 'acct_fake_user-a',
      }),
    ).rejects.toThrow();
    expect(provider.transfers).toEqual([]);

    const result = await provider.transfer({
      orderId: 'order-1',
      amountCents: 11880,
      destination: 'acct_fake_user-a',
    });
    expect(result.transferRef).toMatch(/^tr_fake_/);
    expect(provider.transfers).toHaveLength(1);
  });
});
