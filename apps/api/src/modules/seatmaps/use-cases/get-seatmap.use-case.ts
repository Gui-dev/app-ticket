import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import type {
  SeatHoldRecord,
  SeatmapRepository,
} from '../domain/seatmap-repository.js';

export class GetSeatmapUseCase {
  constructor(private readonly seatmapRepository: SeatmapRepository) {}

  async execute(
    eventSlug: string,
    userId?: string,
  ): Promise<{ seatmap: SeatmapEntity; holds: SeatHoldRecord[] } | null> {
    await this.seatmapRepository.expireHolds();
    const seatmap = await this.seatmapRepository.findSeatmap(eventSlug);
    if (!seatmap) return null;
    const holds = userId
      ? await this.seatmapRepository.findHoldsByUser({ eventSlug, userId })
      : [];
    return { seatmap, holds };
  }
}
