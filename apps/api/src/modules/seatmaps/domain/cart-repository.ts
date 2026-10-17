import type { TicketType } from '@ticketvibe/shared';

export interface CartRepository {
  setType(input: {
    userId: string;
    eventSlug: string;
    itemKey: string;
    ticketType: TicketType;
    ttlSeconds: number;
  }): Promise<void>;
  getTypes(input: {
    userId: string;
    eventSlug: string;
  }): Promise<Map<string, TicketType>>;
  refreshTtl(input: {
    userId: string;
    eventSlug: string;
    ttlSeconds: number;
  }): Promise<void>;
}

export function cartItemKey(
  sectorSlug: string,
  rowLabel: string,
  seatLabel: string,
): string {
  return `${sectorSlug}:${rowLabel}:${seatLabel}`;
}
