import { type Job, Queue, Worker } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  events,
  orders,
  seatRows,
  seats,
  sectors,
  user,
} from '../../../db/schema.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
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
import { DrizzleEventsRepository } from '../../events/infra/drizzle-events-repository.js';
import { DrizzleOrderRepository } from '../../orders/infra/drizzle-order-repository.js';
import type { EmailMessage } from '../domain/email-sender.js';
import {
  EMAILS_QUEUE_NAME,
  ORDER_CONFIRMATION_JOB,
} from '../domain/order-confirmation-queue.js';
import { DrizzleOrderConfirmationRepository } from '../infra/drizzle-order-confirmation-repository.js';
import {
  createOrderConfirmationJob,
  type OrderConfirmationJobData,
} from './order-confirmation.js';

const EVENT_SLUG = 'o-fantasma-da-opera';
const NOW = new Date('2026-10-20T15:00:00.000Z');

describe('envio do e-mail de confirmação (integração postgres + redis)', () => {
  let testDb: Db;
  let redis: RedisClient;
  let queue: Queue<OrderConfirmationJobData>;
  let worker: Worker<OrderConfirmationJobData, unknown>;
  let orderRepository: DrizzleOrderRepository;
  let confirmations: DrizzleOrderConfirmationRepository;
  let eventId: string;
  let jobCounter = 0;
  const sent: EmailMessage[] = [];

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    redis = createRedis(TEST_REDIS_URL);
    redis.options.maxRetriesPerRequest = null;
    await redis.connect();

    orderRepository = new DrizzleOrderRepository(testDb);
    confirmations = new DrizzleOrderConfirmationRepository(testDb);

    const sendOrderConfirmation = createOrderConfirmationJob({
      orders: orderRepository,
      events: new DrizzleEventsRepository(testDb),
      confirmations,
      emailSender: {
        async send(message) {
          sent.push(message);
        },
      },
      now: () => NOW,
    });

    queue = new Queue<OrderConfirmationJobData>(EMAILS_QUEUE_NAME, {
      connection: redis,
    });
    worker = new Worker<OrderConfirmationJobData, unknown>(
      EMAILS_QUEUE_NAME,
      async (job) => sendOrderConfirmation(job.data),
      { connection: redis },
    );
    await worker.waitUntilReady();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await flushTestRedis();
    sent.length = 0;
    jobCounter = 0;
    await testDb
      .insert(user)
      .values({ id: 'user-a', name: 'User A', email: 'user-a@example.com' });
    const [event] = await testDb
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, EVENT_SLUG));
    eventId = event.id;
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
    await resetDatabase(testDb);
    await redis.quit();
    await testDb.$client.end();
  });

  async function createPaidOrder() {
    const [seat] = await testDb
      .select({ seatId: seats.id, rowId: seats.rowId })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .where(
        and(
          eq(sectors.eventId, eventId),
          eq(sectors.slug, 'plateia'),
          eq(seatRows.label, 'A'),
          eq(seats.label, '6'),
        ),
      );
    if (!seat) throw new Error('assento A-6 não encontrado');

    const order = await orderRepository.create({
      userId: 'user-a',
      eventId,
      paymentMethod: 'card',
      provider: 'fake',
      buyerEmail: 'comprador@example.com',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [
        {
          seatId: seat.seatId,
          rowId: seat.rowId,
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'inteira',
          priceCents: 12000,
        },
      ],
    });

    await testDb
      .update(orders)
      .set({ status: 'paid', paidAt: NOW })
      .where(eq(orders.id, order.id));

    return order;
  }

  async function enqueueAndWait(orderId: string): Promise<void> {
    jobCounter += 1;
    const finished = new Promise<void>((resolve, reject) => {
      const onCompleted = (job: Job<OrderConfirmationJobData> | undefined) => {
        if (job?.data.orderId !== orderId) return;
        cleanup();
        resolve();
      };
      const onFailed = (
        job: Job<OrderConfirmationJobData> | undefined,
        error: Error,
      ) => {
        if (job?.data.orderId !== orderId) return;
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        worker.off('completed', onCompleted);
        worker.off('failed', onFailed);
      };
      worker.on('completed', onCompleted);
      worker.on('failed', onFailed);
    });

    await queue.add(
      ORDER_CONFIRMATION_JOB,
      { orderId },
      { jobId: `order-confirmation-test-${orderId}-${jobCounter}` },
    );

    await finished;
  }

  it('envia o e-mail uma vez e ignora a reentrega do mesmo pedido', async () => {
    const order = await createPaidOrder();

    await enqueueAndWait(order.id);

    const state = await confirmations.find(order.id);
    expect(state).toMatchObject({ status: 'sent', lastError: null });
    expect(state?.sentAt).toEqual(NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'comprador@example.com',
      subject: 'Compra confirmada: O Fantasma da Ópera',
    });

    await enqueueAndWait(order.id);

    expect(sent).toHaveLength(1);
    expect(await confirmations.find(order.id)).toMatchObject({
      status: 'sent',
      sentAt: NOW,
    });
  }, 10_000);
});
