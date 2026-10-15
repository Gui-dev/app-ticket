import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export class GetSeatmapUseCase {
  constructor(private readonly seatmapRepository: SeatmapRepository) {}

  execute(eventSlug: string): Promise<SeatmapEntity | null> {
    return this.seatmapRepository.findSeatmap(eventSlug);
  }
}
