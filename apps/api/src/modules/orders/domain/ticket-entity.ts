import { randomBytes } from 'node:crypto';
import type { OrderStatus } from '@ticketvibe/shared';

export type TicketStatus = 'valid' | 'invalid';

export interface TicketRecord {
  id: string;
  orderId: string;
  orderItemId: string;
  seatId: string;
  code: string;
  createdAt: Date;
}

export function generateTicketCode(): string {
  return randomBytes(16).toString('base64url');
}

export function ticketStatusFor(orderStatus: OrderStatus): TicketStatus {
  return orderStatus === 'paid' ? 'valid' : 'invalid';
}
