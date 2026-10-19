import { Queue, Worker } from 'bullmq';

import { createDb } from './db/client.js';
import { createPaymentsWorkerDeps } from './modules/payments/create-payments-worker-deps.js';
import {
  createExpirePendingOrdersJob,
  createProcessPaymentEventJob,
  EXPIRE_ORDERS_EVERY_MS,
  EXPIRE_ORDERS_JOB_ID,
  PAYMENTS_QUEUE_NAME,
  type PaymentEventJobData,
} from './modules/payments/jobs/process-payment-event.js';
import {
  createExpireSeatHoldsJob,
  EXPIRE_HOLDS_EVERY_MS,
  EXPIRE_HOLDS_JOB_ID,
  SEAT_HOLD_QUEUE_NAME,
} from './modules/seatmaps/jobs/expire-seat-holds.js';
import { createRedis } from './redis/client.js';

const db = createDb();
const connection = createRedis();
connection.options.maxRetriesPerRequest = null;

const queue = new Queue(SEAT_HOLD_QUEUE_NAME, { connection });

await queue.upsertJobScheduler(
  EXPIRE_HOLDS_JOB_ID,
  { every: EXPIRE_HOLDS_EVERY_MS },
  { name: EXPIRE_HOLDS_JOB_ID },
);

const worker = new Worker<unknown, number>(
  SEAT_HOLD_QUEUE_NAME,
  createExpireSeatHoldsJob(db),
  { connection },
);

worker.on('completed', (_job, result) => {
  if (result > 0) {
    console.log(`[worker] expired ${result} hold(s)`);
  }
});

worker.on('failed', (job, error) => {
  console.error('[worker] expire-seat-holds failed', job?.id, error);
});

console.log('[worker] seat hold expiry worker started');

const paymentsQueue = new Queue(PAYMENTS_QUEUE_NAME, { connection });

await paymentsQueue.upsertJobScheduler(
  EXPIRE_ORDERS_JOB_ID,
  { every: EXPIRE_ORDERS_EVERY_MS },
  { name: EXPIRE_ORDERS_JOB_ID },
);

const paymentsDeps = createPaymentsWorkerDeps({ db, redis: connection });
const processPaymentEvent = createProcessPaymentEventJob({
  confirmOrderPayment: paymentsDeps.confirmOrderPayment,
  failOrder: paymentsDeps.failOrder,
});
const expirePendingOrders = createExpirePendingOrdersJob({
  expirePendingOrders: paymentsDeps.expirePendingOrders,
});

const paymentsWorker = new Worker<PaymentEventJobData, unknown>(
  PAYMENTS_QUEUE_NAME,
  async (job) => {
    if (job.name === EXPIRE_ORDERS_JOB_ID) {
      return expirePendingOrders();
    }
    return processPaymentEvent(job.data);
  },
  { connection },
);

paymentsWorker.on('completed', (job, result) => {
  if (
    job.name === EXPIRE_ORDERS_JOB_ID &&
    typeof result === 'number' &&
    result > 0
  ) {
    console.log(`[worker] expired ${result} order(s)`);
  }
});

paymentsWorker.on('failed', (job, error) => {
  console.error('[worker] payment job failed', job?.id, error);
});

console.log('[worker] payments worker started');

async function shutdown(): Promise<void> {
  await worker.close();
  await paymentsWorker.close();
  await queue.close();
  await paymentsQueue.close();
  connection.disconnect();
}

process.once('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
