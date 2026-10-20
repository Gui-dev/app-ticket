export const EMAILS_QUEUE_NAME = 'emails';
export const ORDER_CONFIRMATION_JOB = 'order-confirmation';
export const EMAIL_JOB_ATTEMPTS = 6;
export const EMAIL_JOB_BACKOFF_DELAY_MS = 5000;

export const EMAIL_JOB_OPTIONS = {
  attempts: EMAIL_JOB_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: EMAIL_JOB_BACKOFF_DELAY_MS,
  },
  removeOnFail: true,
  removeOnComplete: true,
} as const;

export interface OrderConfirmationQueue {
  enqueue(input: { orderId: string }): Promise<void>;
}
