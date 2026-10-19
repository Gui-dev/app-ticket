import type { Queue } from 'bullmq';

import type { PaymentEventQueue } from '../domain/payment-event-queue.js';
import {
  type PaymentEventJobData,
  PROCESS_PAYMENT_EVENT_JOB,
} from '../jobs/process-payment-event.js';

export class BullMqPaymentEventQueue implements PaymentEventQueue {
  constructor(private readonly queue: Queue<PaymentEventJobData>) {}

  async enqueue(data: PaymentEventJobData): Promise<void> {
    await this.queue.add(PROCESS_PAYMENT_EVENT_JOB, data);
  }
}
