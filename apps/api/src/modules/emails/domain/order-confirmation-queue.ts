export const EMAILS_QUEUE_NAME = 'emails';
export const ORDER_CONFIRMATION_JOB = 'order-confirmation';

export interface OrderConfirmationQueue {
  enqueue(input: { orderId: string }): Promise<void>;
}
