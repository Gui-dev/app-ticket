export interface Hold {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  expiresAt: Date;
}

export type HoldClaimResult = 'claimed' | 'owned' | 'held';

export function holdSeatKey(
  eventId: string,
  rowId: string,
  seatId: string,
): string {
  return `hold:seat:${eventId}:${rowId}:${seatId}`;
}
