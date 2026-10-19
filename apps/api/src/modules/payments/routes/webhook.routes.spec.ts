import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type {
  PaymentEventInput,
  PaymentEventRepository,
} from '../../orders/domain/payment-event-repository.js';
import type { PaymentEventQueue } from '../domain/payment-event-queue.js';
import { FakePaymentProvider } from '../infra/fake-payment-provider.js';
import { signStripeWebhook } from '../infra/stripe-signature.js';

const WEBHOOK_SECRET = 'whsec_test';

function createRepository(): PaymentEventRepository {
  const seen = new Set<string>();
  return {
    record: async (input: PaymentEventInput) => {
      if (seen.has(input.providerEventId)) return false;
      seen.add(input.providerEventId);
      return true;
    },
  };
}

function createQueue(): {
  queue: PaymentEventQueue;
  enqueue: ReturnType<typeof vi.fn>;
} {
  const enqueue = vi.fn(async () => {});
  return { queue: { enqueue } as PaymentEventQueue, enqueue };
}

function buildTestApp(input: {
  repository: PaymentEventRepository;
  queue: PaymentEventQueue;
}): FastifyInstance {
  return buildApp({
    paymentProvider: new FakePaymentProvider(WEBHOOK_SECRET),
    paymentEventRepository: input.repository,
    paymentEventQueue: input.queue,
  });
}

function succeededPayload(providerEventId: string): string {
  return JSON.stringify({
    id: providerEventId,
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_unit_1', amount_received: 13200 } },
  });
}

describe('rota de webhook do stripe (unit)', () => {
  afterAll(() => {
    vi.clearAllMocks();
  });

  it('rejeita assinatura inválida com 400', async () => {
    const repository = createRepository();
    const { queue, enqueue } = createQueue();
    const app = buildTestApp({ repository, queue });
    const payload = succeededPayload('evt_bad');

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signStripeWebhook(payload, 'whsec_outro'),
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_signature' });
    expect(enqueue).not.toHaveBeenCalled();
    await app.close();
  });

  it('registra e enfileira um evento válido com 200', async () => {
    const repository = createRepository();
    const { queue, enqueue } = createQueue();
    const app = buildTestApp({ repository, queue });
    const payload = succeededPayload('evt_ok');

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signStripeWebhook(payload, WEBHOOK_SECRET),
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      providerEventId: 'evt_ok',
      type: 'succeeded',
      providerRef: 'pi_unit_1',
      amountCents: 13200,
    });
    await app.close();
  });

  it('responde 200 com duplicate e reenfileira o evento no reenvio', async () => {
    const repository = createRepository();
    const { queue, enqueue } = createQueue();
    const app = buildTestApp({ repository, queue });
    const payload = succeededPayload('evt_repeat');
    const headers = {
      'content-type': 'application/json',
      'stripe-signature': signStripeWebhook(payload, WEBHOOK_SECRET),
    };

    const first = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers,
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ received: true });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ received: true, duplicate: true });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      providerEventId: 'evt_repeat',
      type: 'succeeded',
      providerRef: 'pi_unit_1',
      amountCents: 13200,
    });
    await app.close();
  });

  it('reenfileira o evento quando o enqueue falha na primeira entrega', async () => {
    const repository = createRepository();
    const enqueue = vi.fn();
    enqueue.mockRejectedValueOnce(new Error('queue_indisponivel'));
    enqueue.mockResolvedValue(undefined);
    const queue = { enqueue } as PaymentEventQueue;
    const app = buildTestApp({ repository, queue });
    const payload = succeededPayload('evt_dropped');
    const headers = {
      'content-type': 'application/json',
      'stripe-signature': signStripeWebhook(payload, WEBHOOK_SECRET),
    };

    const first = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers,
      payload,
    });

    expect(first.statusCode).toBeGreaterThanOrEqual(500);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ received: true, duplicate: true });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenLastCalledWith({
      providerEventId: 'evt_dropped',
      type: 'succeeded',
      providerRef: 'pi_unit_1',
      amountCents: 13200,
    });
    await app.close();
  });
});
