import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { paymentEvents } from '../../../db/schema.js';
import {
  ensureTestDatabase,
  flushTestRedis,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import { DrizzlePaymentEventRepository } from '../../orders/infra/drizzle-payment-event-repository.js';
import type { PaymentEventQueue } from '../domain/payment-event-queue.js';
import { BullMqPaymentEventQueue } from '../infra/bullmq-payment-event-queue.js';
import { FakePaymentProvider } from '../infra/fake-payment-provider.js';
import { signStripeWebhook } from '../infra/stripe-signature.js';
import {
  PAYMENTS_QUEUE_NAME,
  PROCESS_PAYMENT_EVENT_JOB,
} from '../jobs/process-payment-event.js';

const WEBHOOK_SECRET = 'whsec_test';

const enqueue = vi.fn(async () => {});

function succeededPayload(providerEventId: string): string {
  return JSON.stringify({
    id: providerEventId,
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_integration_1', amount_received: 13200 } },
  });
}

function signedHeaders(payload: string, secret = WEBHOOK_SECRET) {
  return {
    'content-type': 'application/json',
    'stripe-signature': signStripeWebhook(payload, secret),
  };
}

describe('rota de webhook do stripe (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  const countEvents = async (): Promise<number> => {
    const [row] = await testDb
      .select({ total: sql<number>`count(*)::int` })
      .from(paymentEvents);
    return row.total;
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);

    app = buildApp({
      paymentProvider: new FakePaymentProvider(WEBHOOK_SECRET),
      paymentEventRepository: new DrizzlePaymentEventRepository(testDb),
      paymentEventQueue: { enqueue } as PaymentEventQueue,
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    enqueue.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await testDb.$client.end();
  });

  it('grava o evento e enfileira uma vez no primeiro POST', async () => {
    const payload = succeededPayload('evt_integration_ok');

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: signedHeaders(payload),
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(await countEvents()).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      providerEventId: 'evt_integration_ok',
      type: 'succeeded',
      providerRef: 'pi_integration_1',
      amountCents: 13200,
    });
  });

  it('marca o reenvio como duplicate e mantém uma única linha', async () => {
    const payload = succeededPayload('evt_integration_repeat');
    const headers = signedHeaders(payload);

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

    expect(first.json()).toEqual({ received: true });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ received: true, duplicate: true });
    expect(await countEvents()).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('não grava nada com assinatura inválida', async () => {
    const payload = succeededPayload('evt_integration_bad');

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: signedHeaders(payload, 'whsec_outro'),
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_signature' });
    expect(await countEvents()).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('fila BullMQ de eventos de pagamento (redis integration)', () => {
  let connection: RedisClient;
  let queue: Queue;
  let paymentEventQueue: BullMqPaymentEventQueue;

  beforeAll(async () => {
    await flushTestRedis();
    connection = createRedis(TEST_REDIS_URL);
    connection.options.maxRetriesPerRequest = null;
    queue = new Queue(PAYMENTS_QUEUE_NAME, { connection });
    paymentEventQueue = new BullMqPaymentEventQueue(queue);
  });

  afterAll(async () => {
    await queue.drain();
    await queue.close();
    connection.disconnect();
  });

  it('publica o evento como job process-payment-event', async () => {
    await paymentEventQueue.enqueue({
      providerEventId: 'evt_queue_1',
      type: 'succeeded',
      providerRef: 'pi_queue_1',
      amountCents: 4200,
    });

    const jobs = await queue.getJobs(['waiting']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe(PROCESS_PAYMENT_EVENT_JOB);
    expect(jobs[0].data).toEqual({
      providerEventId: 'evt_queue_1',
      type: 'succeeded',
      providerRef: 'pi_queue_1',
      amountCents: 4200,
    });
  });
});
