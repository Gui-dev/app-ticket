export type OrderConfirmationStatus = 'pending' | 'sent' | 'failed';

export interface OrderConfirmationState {
  status: OrderConfirmationStatus;
  sentAt: Date | null;
  lastError: string | null;
}

export interface OrderConfirmationRepository {
  find(orderId: string): Promise<OrderConfirmationState | null>;
  markSent(input: { orderId: string; now: Date }): Promise<void>;
  markFailed(input: {
    orderId: string;
    error: string;
    now: Date;
  }): Promise<void>;
}
