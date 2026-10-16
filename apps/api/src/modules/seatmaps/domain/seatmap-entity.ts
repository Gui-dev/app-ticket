import type { SeatStatus } from '@ticketvibe/shared';

export type SeatStatusValue = SeatStatus | 'reserved';

export interface SeatmapSeat {
  label: string;
  status: SeatStatusValue;
}

export interface SeatmapRow {
  label: string;
  seats: SeatmapSeat[];
}

export interface SeatmapSector {
  slug: string;
  name: string;
  priceFromCents: number;
  rows: SeatmapRow[];
}

export interface SeatmapEntity {
  eventSlug: string;
  sectors: SeatmapSector[];
}

export interface BestSeat {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}
