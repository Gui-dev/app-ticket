import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';

import { type Hold, holdSeatKey } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type HoldSeatResult =
  | { kind: 'held'; hold: Hold; renewed: boolean }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'seat_not_found' }
  | { kind: 'seat_unavailable' }
  | { kind: 'seat_held' };

export class HoldSeatUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<HoldSeatResult> {
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
    if (seat.status !== 'available' && seat.status !== 'reserved') {
      return { kind: 'seat_unavailable' };
    }

    const seatKey = holdSeatKey(seat.eventId, seat.rowId, seat.seatId);
    const claim = await this.holdRepository.claim(
      seatKey,
      input.userId,
      SEAT_HOLD_TTL_SECONDS,
    );
    if (claim === 'held') {
      return { kind: 'seat_held' };
    }

    const expiresAt = new Date(
      this.now().getTime() + SEAT_HOLD_TTL_SECONDS * 1000,
    );

    if (claim === 'claimed') {
      const mirrored = await this.seatmapRepository.reserveSeat({
        seatId: seat.seatId,
        userId: input.userId,
        expiresAt,
      });
      if (!mirrored) {
        return { kind: 'seat_unavailable' };
      }
    } else {
      await this.seatmapRepository.renewSeatHold({
        seatId: seat.seatId,
        userId: input.userId,
        expiresAt,
      });
    }

    return {
      kind: 'held',
      renewed: claim === 'owned',
      hold: {
        sectorSlug: seat.sectorSlug,
        rowLabel: seat.rowLabel,
        seatLabel: seat.seatLabel,
        expiresAt,
      },
    };
  }
}
