import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export class InMemorySeatmapRepository implements SeatmapRepository {
  private readonly seatmaps = new Map<string, SeatmapEntity>();

  constructor(seed: SeatmapEntity[] = []) {
    for (const seatmap of seed) {
      this.seatmaps.set(seatmap.eventSlug, seatmap);
    }
  }

  async findSeatmap(eventSlug: string): Promise<SeatmapEntity | null> {
    return this.seatmaps.get(eventSlug) ?? null;
  }
}
