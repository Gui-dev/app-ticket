import type { SeatStatus } from '@ticketvibe/shared';

export interface SeatStatusDelta {
  eventSlug: string;
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  status: SeatStatus;
}

export interface SeatAvailabilityBroker {
  publish(deltas: SeatStatusDelta[]): void;
}
