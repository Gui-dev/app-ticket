import { Queue, Worker } from 'bullmq';

import type { Db } from '../../db/client.js';
import type { RedisClient } from '../../redis/client.js';
import { DrizzleEventsRepository } from '../events/infra/drizzle-events-repository.js';
import { DrizzleOrderRepository } from '../orders/infra/drizzle-order-repository.js';
import { EMAILS_QUEUE_NAME } from './domain/order-confirmation-queue.js';
import { DrizzleOrderConfirmationRepository } from './infra/drizzle-order-confirmation-repository.js';
import { createSmtpEmailSender } from './infra/smtp-email-sender.js';
import {
  createOrderConfirmationJob,
  EMAIL_JOB_OPTIONS,
  type OrderConfirmationJobData,
} from './jobs/order-confirmation.js';

export async function createEmailsWorker(input: {
  db: Db;
  connection: RedisClient;
}): Promise<{
  queue: Queue<OrderConfirmationJobData>;
  worker: Worker<OrderConfirmationJobData, unknown>;
}> {
  const queue = new Queue<OrderConfirmationJobData>(EMAILS_QUEUE_NAME, {
    connection: input.connection,
    defaultJobOptions: EMAIL_JOB_OPTIONS,
  });

  const sendOrderConfirmation = createOrderConfirmationJob({
    orders: new DrizzleOrderRepository(input.db),
    events: new DrizzleEventsRepository(input.db),
    confirmations: new DrizzleOrderConfirmationRepository(input.db),
    emailSender: createSmtpEmailSender(),
  });

  const worker = new Worker<OrderConfirmationJobData, unknown>(
    EMAILS_QUEUE_NAME,
    async (job) => sendOrderConfirmation(job.data),
    { connection: input.connection },
  );

  worker.on('completed', (job) => {
    console.log('[worker] order confirmation email sent', job.data.orderId);
  });

  worker.on('failed', (job, error) => {
    console.error('[worker] email job failed', job?.id, error);
  });

  return { queue, worker };
}
