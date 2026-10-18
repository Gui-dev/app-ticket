import type {
  OrderStatus,
  PaymentMethod,
  TicketType,
} from '@ticketvibe/shared';

export interface OrderItemRecord {
  seatId: string;
  rowId: string;
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  ticketType: TicketType;
  priceCents: number;
}

export interface OrderRecord {
  id: string;
  userId: string;
  eventId: string;
  eventSlug: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  provider: string;
  providerRef: string | null;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  createdAt: Date;
  paidAt: Date | null;
  items: OrderItemRecord[];
}

export interface CapturableSeat {
  seatId: string;
  status: string;
  holdUserId: string | null;
  holdExpiresAt: Date | null;
}

export type CaptureDecision = 'confirm' | 'lost';

export function decideOrderCapture(
  order: { userId: string },
  seats: CapturableSeat[],
  now: Date,
): CaptureDecision {
  if (seats.length === 0) return 'lost';
  const allHeld = seats.every(
    (seat) =>
      seat.status === 'reserved' &&
      seat.holdUserId === order.userId &&
      seat.holdExpiresAt !== null &&
      seat.holdExpiresAt.getTime() > now.getTime(),
  );
  return allHeld ? 'confirm' : 'lost';
}
