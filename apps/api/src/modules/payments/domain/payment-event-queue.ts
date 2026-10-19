import type { PaymentEventJobData } from '../jobs/process-payment-event.js';

export interface PaymentEventQueue {
  enqueue(data: PaymentEventJobData): Promise<void>;
}
