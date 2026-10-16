import { pickBestSeat } from '../domain/pick-best-seat.js';
import type { BestSeat } from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type FindBestSeatResult =
  | { kind: 'seat'; seat: BestSeat }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'no_available_seat' };

export class FindBestSeatUseCase {
  constructor(private readonly seatmapRepository: SeatmapRepository) {}

  async execute(
    eventSlug: string,
    sectorSlug: string,
  ): Promise<FindBestSeatResult> {
    await this.seatmapRepository.expireHolds();
    const seatmap = await this.seatmapRepository.findSeatmap(eventSlug);
    if (!seatmap) {
      return { kind: 'event_not_found' };
    }
    const sector = seatmap.sectors.find((item) => item.slug === sectorSlug);
    if (!sector) {
      return { kind: 'sector_not_found' };
    }
    const seat = pickBestSeat(sector);
    if (!seat) {
      return { kind: 'no_available_seat' };
    }
    return { kind: 'seat', seat };
  }
}
