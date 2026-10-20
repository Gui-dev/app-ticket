import { Queue } from 'bullmq';

import type { RedisClient } from '../../../redis/client.js';
import {
  EMAILS_QUEUE_NAME,
  ORDER_CONFIRMATION_JOB,
  type OrderConfirmationQueue,
} from '../domain/order-confirmation-queue.js';

export function createBullMqOrderConfirmationQueue(input: {
  connection: RedisClient;
}): OrderConfirmationQueue {
  const queue = new Queue(EMAILS_QUEUE_NAME, { connection: input.connection });

  return {
    async enqueue({ orderId }) {
      await queue.add(
        ORDER_CONFIRMATION_JOB,
        { orderId },
        { jobId: `order-confirmation-${orderId}` },
      );
    },
  };
}
