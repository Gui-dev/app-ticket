import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import {
  PAYMENT_JOB_ATTEMPTS,
  PAYMENT_JOB_BACKOFF_DELAY_MS,
  type PaymentEventJobData,
  PROCESS_PAYMENT_EVENT_JOB,
} from '../jobs/process-payment-event.js';
import { BullMqPaymentEventQueue } from './bullmq-payment-event-queue.js';

describe('BullMqPaymentEventQueue (unit)', () => {
  it('adiciona o job com jobId igual ao providerEventId', async () => {
    const add = vi.fn(async () => {});
    const queue = { add } as unknown as Queue<PaymentEventJobData>;
    const paymentEventQueue = new BullMqPaymentEventQueue(queue);
    const data: PaymentEventJobData = {
      providerEventId: 'evt_1',
      type: 'succeeded',
      providerRef: 'pi_1',
      amountCents: 1000,
    };

    await paymentEventQueue.enqueue(data);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(PROCESS_PAYMENT_EVENT_JOB, data, {
      jobId: 'evt_1',
      attempts: PAYMENT_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: PAYMENT_JOB_BACKOFF_DELAY_MS,
      },
    });
  });
});
