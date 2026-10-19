import { Queue, Worker } from 'bullmq';

import type { Db } from '../../db/client.js';
import type { RedisClient } from '../../redis/client.js';
import { createPaymentsWorkerDeps } from './create-payments-worker-deps.js';
import {
  createExpirePendingOrdersJob,
  createProcessPaymentEventJob,
  EXPIRE_ORDERS_EVERY_MS,
  EXPIRE_ORDERS_JOB_ID,
  PAYMENT_JOB_OPTIONS,
  PAYMENTS_QUEUE_NAME,
  type PaymentEventJobData,
} from './jobs/process-payment-event.js';

export async function createPaymentsWorker(input: {
  db: Db;
  connection: RedisClient;
}): Promise<{
  queue: Queue<PaymentEventJobData>;
  worker: Worker<PaymentEventJobData, unknown>;
}> {
  const queue = new Queue<PaymentEventJobData>(PAYMENTS_QUEUE_NAME, {
    connection: input.connection,
    defaultJobOptions: PAYMENT_JOB_OPTIONS,
  });

  await queue.upsertJobScheduler(
    EXPIRE_ORDERS_JOB_ID,
    { every: EXPIRE_ORDERS_EVERY_MS },
    { name: EXPIRE_ORDERS_JOB_ID, opts: PAYMENT_JOB_OPTIONS },
  );

  const deps = createPaymentsWorkerDeps({
    db: input.db,
    redis: input.connection,
  });
  const processPaymentEvent = createProcessPaymentEventJob({
    confirmOrderPayment: deps.confirmOrderPayment,
    failOrder: deps.failOrder,
  });
  const expirePendingOrders = createExpirePendingOrdersJob({
    expirePendingOrders: deps.expirePendingOrders,
  });

  const worker = new Worker<PaymentEventJobData, unknown>(
    PAYMENTS_QUEUE_NAME,
    async (job) => {
      if (job.name === EXPIRE_ORDERS_JOB_ID) {
        return expirePendingOrders();
      }
      return processPaymentEvent(job.data);
    },
    { connection: input.connection },
  );

  worker.on('completed', (job, result) => {
    if (
      job.name === EXPIRE_ORDERS_JOB_ID &&
      typeof result === 'number' &&
      result > 0
    ) {
      console.log(`[worker] expired ${result} order(s)`);
    }
  });

  worker.on('failed', (job, error) => {
    console.error('[worker] payment job failed', job?.id, error);
  });

  return { queue, worker };
}
