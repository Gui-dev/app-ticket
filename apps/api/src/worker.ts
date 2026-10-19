import { Queue, Worker } from 'bullmq';

import { createDb } from './db/client.js';
import { createPaymentsWorker } from './modules/payments/create-payments-worker.js';
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

const { queue: paymentsQueue, worker: paymentsWorker } =
  await createPaymentsWorker({ db, connection });

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
