import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { StripePaymentProvider } from './stripe-payment-provider.js';
import { signStripeWebhook } from './stripe-signature.js';

const secret = 'whsec_test';

const buildProvider = () =>
  new StripePaymentProvider({
    secretKey: 'sk_test_dummy',
    webhookSecret: secret,
  });

const stripeClientOf = (provider: StripePaymentProvider) =>
  (provider as unknown as { stripe: Stripe }).stripe;

describe('StripePaymentProvider', () => {
  it('mapeia payment_intent.succeeded assinado', async () => {
    const provider = buildProvider();
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', amount_received: 13200 } },
    });
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: signStripeWebhook(payload, secret),
    });
    expect(provider.providerName).toBe('stripe');
    expect(event).toEqual({
      providerEventId: 'evt_1',
      type: 'succeeded',
      providerRef: 'pi_1',
      amountCents: 13200,
    });
  });

  it('mapeia payment_intent.payment_failed', async () => {
    const provider = buildProvider();
    const payload = JSON.stringify({
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_2' } },
    });
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: signStripeWebhook(payload, secret),
    });
    expect(event).toEqual({
      providerEventId: 'evt_2',
      type: 'failed',
      providerRef: 'pi_2',
      amountCents: null,
    });
  });

  it('mapeia payment_intent.canceled', async () => {
    const provider = buildProvider();
    const payload = JSON.stringify({
      id: 'evt_3',
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_3' } },
    });
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: signStripeWebhook(payload, secret),
    });
    expect(event).toEqual({
      providerEventId: 'evt_3',
      type: 'expired',
      providerRef: 'pi_3',
      amountCents: null,
    });
  });

  it('marca tipos desconhecidos como ignored', async () => {
    const provider = buildProvider();
    const payload = JSON.stringify({
      id: 'evt_4',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1' } },
    });
    const event = await provider.parseWebhook({
      rawBody: payload,
      signature: signStripeWebhook(payload, secret),
    });
    expect(event).toEqual({
      providerEventId: 'evt_4',
      type: 'ignored',
      providerRef: 'ch_1',
      amountCents: null,
    });
  });

  it('retorna null para payload adulterado', async () => {
    const provider = buildProvider();
    const payload = JSON.stringify({ id: 'evt_1' });
    expect(
      await provider.parseWebhook({
        rawBody: `${payload} `,
        signature: signStripeWebhook(payload, secret),
      }),
    ).toBeNull();
  });

  it('retorna null quando a assinatura está ausente', async () => {
    const provider = buildProvider();
    expect(
      await provider.parseWebhook({
        rawBody: JSON.stringify({ id: 'evt_1' }),
        signature: null,
      }),
    ).toBeNull();
  });

  it('retorna null quando o timestamp está fora da tolerância', async () => {
    const provider = buildProvider();
    const payload = JSON.stringify({ id: 'evt_1' });
    const stale = Math.floor(Date.now() / 1000) - 1000;
    expect(
      await provider.parseWebhook({
        rawBody: payload,
        signature: signStripeWebhook(payload, secret, stale),
      }),
    ).toBeNull();
  });

  it('recupera o client secret do payment intent existente', async () => {
    const provider = buildProvider();
    const retrieve = vi
      .spyOn(stripeClientOf(provider).paymentIntents, 'retrieve')
      .mockResolvedValue({
        id: 'pi_1',
        client_secret: 'cs_1',
      } as unknown as Stripe.Response<Stripe.PaymentIntent>);

    expect(await provider.retrieveClientSecret('pi_1')).toBe('cs_1');
    expect(retrieve).toHaveBeenCalledWith('pi_1');
  });

  it('retorna null quando a busca do payment intent falha', async () => {
    const provider = buildProvider();
    vi.spyOn(
      stripeClientOf(provider).paymentIntents,
      'retrieve',
    ).mockRejectedValue(new Error('No such payment_intent: pi_1'));

    expect(await provider.retrieveClientSecret('pi_1')).toBeNull();
  });

  it('retorna null quando o payment intent não tem client secret', async () => {
    const provider = buildProvider();
    vi.spyOn(
      stripeClientOf(provider).paymentIntents,
      'retrieve',
    ).mockResolvedValue({
      id: 'pi_1',
      client_secret: null,
    } as unknown as Stripe.Response<Stripe.PaymentIntent>);

    expect(await provider.retrieveClientSecret('pi_1')).toBeNull();
  });

  it('reembolsa com a chave de idempotência derivada da referência', async () => {
    const provider = buildProvider();
    const create = vi
      .spyOn(stripeClientOf(provider).refunds, 'create')
      .mockResolvedValue({
        id: 're_1',
      } as unknown as Stripe.Response<Stripe.Refund>);

    await provider.refund('pi_1');

    expect(create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1' },
      { idempotencyKey: 'refund-pi_1' },
    );
  });

  it('reembolsa o valor parcial informando o amount', async () => {
    const provider = buildProvider();
    const create = vi
      .spyOn(stripeClientOf(provider).refunds, 'create')
      .mockResolvedValue({
        id: 're_2',
      } as unknown as Stripe.Response<Stripe.Refund>);

    await provider.refund('pi_1', 6300);

    expect(create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1', amount: 6300 },
      { idempotencyKey: 'refund-pi_1' },
    );
  });

  it('cancela o payment intent da referência', async () => {
    const provider = buildProvider();
    const cancel = vi
      .spyOn(stripeClientOf(provider).paymentIntents, 'cancel')
      .mockResolvedValue({
        id: 'pi_1',
        status: 'canceled',
      } as unknown as Stripe.Response<Stripe.PaymentIntent>);

    await provider.cancelPayment('pi_1');

    expect(cancel).toHaveBeenCalledWith('pi_1');
  });

  it('ignora o erro ao cancelar o payment intent', async () => {
    const provider = buildProvider();
    vi.spyOn(
      stripeClientOf(provider).paymentIntents,
      'cancel',
    ).mockRejectedValue(new Error('No such payment_intent: pi_1'));

    await expect(provider.cancelPayment('pi_1')).resolves.toBeUndefined();
  });
});
