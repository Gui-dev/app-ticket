import type { SeatmapEntity } from './seatmap-entity.js';

export interface SeatmapRepository {
  findSeatmap(eventSlug: string): Promise<SeatmapEntity | null>;
}
