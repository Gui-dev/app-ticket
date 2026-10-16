import type { SeatmapEntity, SeatStatusValue } from './seatmap-entity.js';

export interface SeatCoordsLookupFound {
  found: true;
  seat: {
    seatId: string;
    rowId: string;
    eventId: string;
    status: SeatStatusValue;
    sectorSlug: string;
    sectorName: string;
    priceFromCents: number;
    rowLabel: string;
    seatLabel: string;
  };
}

export interface SeatCoordsLookupMissing {
  found: false;
  scope: 'event' | 'sector' | 'seat';
}

export type SeatCoordsLookup = SeatCoordsLookupFound | SeatCoordsLookupMissing;

export interface SeatHoldRecord {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  expiresAt: Date;
}

export interface SeatmapRepository {
  findSeatmap(eventSlug: string): Promise<SeatmapEntity | null>;
  findSeatByCoords(input: {
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<SeatCoordsLookup>;
  findHoldsByUser(input: {
    eventSlug: string;
    userId: string;
  }): Promise<SeatHoldRecord[]>;
  expireHolds(): Promise<void>;
}
