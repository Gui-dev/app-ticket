import { SEAT_HOLD_TTL_SECONDS, type TicketType } from '@ticketvibe/shared';

import type { CartRepository } from '../domain/cart-repository.js';
import { cartItemKey } from '../domain/cart-repository.js';
import { holdSeatKey } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type SetCartItemResult =
  | {
      kind: 'cart_item_set';
      item: {
        sectorSlug: string;
        rowLabel: string;
        seatLabel: string;
        ticketType: TicketType;
      };
    }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'seat_not_found' }
  | { kind: 'hold_not_found' };

export class SetCartItemUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
    private readonly cartRepository: CartRepository,
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
    ticketType: TicketType;
  }): Promise<SetCartItemResult> {
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
    const owned = await this.holdRepository.owns(seatKey, input.userId);
    if (!owned) {
      return { kind: 'hold_not_found' };
    }

    await this.cartRepository.setType({
      userId: input.userId,
      eventSlug: input.eventSlug,
      itemKey: cartItemKey(input.sectorSlug, input.rowLabel, input.seatLabel),
      ticketType: input.ticketType,
      ttlSeconds: SEAT_HOLD_TTL_SECONDS,
    });

    return {
      kind: 'cart_item_set',
      item: {
        sectorSlug: input.sectorSlug,
        rowLabel: input.rowLabel,
        seatLabel: input.seatLabel,
        ticketType: input.ticketType,
      },
    };
  }
}
