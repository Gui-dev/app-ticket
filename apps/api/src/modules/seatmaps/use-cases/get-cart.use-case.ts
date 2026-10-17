import { type TicketType, ticketPriceCents } from '@ticketvibe/shared';
import type { CartRepository } from '../domain/cart-repository.js';
import { cartItemKey } from '../domain/cart-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export interface CartItemView {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  ticketType: TicketType;
  priceCents: number;
  expiresAt: Date;
}

export interface CartView {
  eventSlug: string;
  items: CartItemView[];
  expiresAt: Date | null;
  totalCents: number;
}

export type GetCartResult =
  | { kind: 'cart'; cart: CartView }
  | { kind: 'event_not_found' };

export class GetCartUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly cartRepository: CartRepository,
  ) {}

  async execute(userId: string, eventSlug: string): Promise<GetCartResult> {
    const seatmap = await this.seatmapRepository.findSeatmap(eventSlug);
    if (!seatmap) {
      return { kind: 'event_not_found' };
    }

    await this.seatmapRepository.expireHolds();
    const holds = await this.seatmapRepository.findHoldsByUser({
      eventSlug,
      userId,
    });
    if (holds.length === 0) {
      return {
        kind: 'cart',
        cart: { eventSlug, items: [], expiresAt: null, totalCents: 0 },
      };
    }

    const types = await this.cartRepository.getTypes({ userId, eventSlug });
    let totalCents = 0;
    let earliest: Date | null = null;
    const sortedHolds = [...holds].sort(
      (a, b) =>
        a.sectorSlug.localeCompare(b.sectorSlug) ||
        a.rowLabel.localeCompare(b.rowLabel) ||
        a.seatLabel.localeCompare(b.seatLabel),
    );
    const items = sortedHolds.map((hold) => {
      const ticketType: TicketType =
        types.get(
          cartItemKey(hold.sectorSlug, hold.rowLabel, hold.seatLabel),
        ) ?? 'inteira';
      const priceCents = ticketPriceCents(ticketType, hold.priceFromCents);
      totalCents += priceCents;
      if (!earliest || hold.expiresAt < earliest) {
        earliest = hold.expiresAt;
      }
      return {
        sectorSlug: hold.sectorSlug,
        rowLabel: hold.rowLabel,
        seatLabel: hold.seatLabel,
        ticketType,
        priceCents,
        expiresAt: hold.expiresAt,
      };
    });

    return {
      kind: 'cart',
      cart: { eventSlug, items, expiresAt: earliest, totalCents },
    };
  }
}
