import { holdSeatKey } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type ReleaseHoldResult =
  | { kind: 'released' }
  | { kind: 'hold_not_found' }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'seat_not_found' };

export class ReleaseHoldUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<ReleaseHoldResult> {
    await this.seatmapRepository.expireHolds();

    const lookup = await this.seatmapRepository.findSeatByCoords({
      eventSlug: input.eventSlug,
      sectorSlug: input.sectorSlug,
      rowLabel: input.rowLabel,
      seatLabel: input.seatLabel,
    });
    if (!lookup.found) {
      if (lookup.scope === 'event') return { kind: 'event_not_found' };
      if (lookup.scope === 'sector') return { kind: 'sector_not_found' };
      return { kind: 'seat_not_found' };
    }

    const { seat } = lookup;
    const seatKey = holdSeatKey(seat.eventId, seat.rowId, seat.seatId);
    const released = await this.holdRepository.release(seatKey, input.userId);
    if (!released) {
      return { kind: 'hold_not_found' };
    }

    await this.seatmapRepository.releaseSeat({
      seatId: seat.seatId,
      userId: input.userId,
    });
    return { kind: 'released' };
  }
}
