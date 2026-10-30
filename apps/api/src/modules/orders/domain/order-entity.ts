import type {
  OrderStatus,
  PaymentMethod,
  TicketType,
  TransferStatus,
} from '@ticketvibe/shared';

export interface OrderItemRecord {
  seatId: string;
  rowId: string;
  sectorSlug: string;
  sectorName: string | null;
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
  buyerEmail: string | null;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  refundCents: number | null;
  transferStatus: TransferStatus;
  transferRef: string | null;
  createdAt: Date;
  paidAt: Date | null;
  items: OrderItemRecord[];
}

export interface OrderSummaryRecord {
  id: string;
  eventSlug: string;
  status: OrderStatus;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  itemCount: number;
  createdAt: Date;
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

function itemIdentity(item: OrderItemRecord): string {
  return `${item.seatId}|${item.ticketType}|${item.priceCents}`;
}

export function orderMatchesItems(
  order: { items: OrderItemRecord[] },
  items: OrderItemRecord[],
): boolean {
  if (order.items.length !== items.length) return false;
  const expected = items.map(itemIdentity).sort();
  const current = order.items.map(itemIdentity).sort();
  return expected.every((identity, index) => identity === current[index]);
}
