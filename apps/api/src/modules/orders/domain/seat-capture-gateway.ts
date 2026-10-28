import type { OrderStatus } from '@ticketvibe/shared';

export type ConfirmPaidResult =
  | { kind: 'paid' }
  | { kind: 'already'; status: OrderStatus }
  | { kind: 'seats_lost' }
  | { kind: 'order_not_found' };

export type CancelPaidResult = { kind: 'refunded' } | { kind: 'not_paid' };

export interface SeatCaptureGateway {
  confirmOrderPayment(input: {
    providerRef: string;
    now: Date;
  }): Promise<ConfirmPaidResult>;
  releaseOrderSeats(input: {
    orderId: string;
    now: Date;
  }): Promise<{ seatKeys: string[] }>;
  cancelPaidOrder(input: {
    orderId: string;
    refundCents: number;
  }): Promise<CancelPaidResult>;
}
