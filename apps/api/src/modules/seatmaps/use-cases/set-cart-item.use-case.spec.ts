import { describe, expect, it } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryCartRepository } from '../infra/in-memory-cart-repository.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { SetCartItemUseCase } from './set-cart-item.use-case.js';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 12000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'reserved' },
            { label: '2', status: 'available' },
          ],
        },
      ],
    },
  ],
};

function build() {
  const seatmapRepository = new InMemorySeatmapRepository([gig]);
  const holdRepository = new InMemoryHoldRepository();
  const cartRepository = new InMemoryCartRepository();
  const useCase = new SetCartItemUseCase(
    seatmapRepository,
    holdRepository,
    cartRepository,
  );
  return { useCase, holdRepository, cartRepository };
}

const baseInput = {
  userId: 'user-a',
  eventSlug: 'gig',
  sectorSlug: 'pista',
  rowLabel: 'A',
  seatLabel: '1',
  ticketType: 'meia' as const,
};

describe('SetCartItemUseCase', () => {
  it('stores the ticket type for an owned hold', async () => {
    const { useCase, holdRepository, cartRepository } = build();
    await holdRepository.claim(
      'hold:seat:gig:gig:pista:A:gig:pista:A:1',
      'user-a',
      600,
    );
    const result = await useCase.execute(baseInput);
    expect(result).toEqual({
      kind: 'cart_item_set',
      item: {
        sectorSlug: 'pista',
        rowLabel: 'A',
        seatLabel: '1',
        ticketType: 'meia',
      },
    });
    const types = await cartRepository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('pista:A:1')).toBe('meia');
  });

  it('reports hold_not_found without an owned hold', async () => {
    const { useCase } = build();
    await expect(useCase.execute(baseInput)).resolves.toEqual({
      kind: 'hold_not_found',
    });
  });

  it('distinguishes event, sector and seat misses', async () => {
    const { useCase } = build();
    expect((await useCase.execute({ ...baseInput, eventSlug: 'x' })).kind).toBe(
      'event_not_found',
    );
    expect(
      (await useCase.execute({ ...baseInput, sectorSlug: 'x' })).kind,
    ).toBe('sector_not_found');
    expect((await useCase.execute({ ...baseInput, seatLabel: '9' })).kind).toBe(
      'seat_not_found',
    );
  });
});
