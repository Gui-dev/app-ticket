import { describe, expect, it, vi } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryCartRepository } from '../infra/in-memory-cart-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { GetCartUseCase } from './get-cart.use-case.js';

const NOW_MS = Date.parse('2026-10-16T12:00:00.000Z');

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 12000,
      rows: [],
    },
  ],
};

function seedHolds() {
  return [
    {
      eventSlug: 'gig',
      userId: 'user-a',
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    },
    {
      eventSlug: 'gig',
      userId: 'user-a',
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '2',
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:08:00.000Z'),
    },
  ];
}

function seededRepositories() {
  const now = () => new Date(NOW_MS);
  return {
    seatmapRepository: new InMemorySeatmapRepository([gig], seedHolds(), now),
    cartRepository: new InMemoryCartRepository(now),
  };
}

describe('GetCartUseCase', () => {
  it('reports event_not_found for an unknown event', async () => {
    const useCase = new GetCartUseCase(
      new InMemorySeatmapRepository([gig]),
      new InMemoryCartRepository(),
    );
    await expect(useCase.execute('user-a', 'outro')).resolves.toEqual({
      kind: 'event_not_found',
    });
  });

  it('returns an empty cart without holds', async () => {
    const useCase = new GetCartUseCase(
      new InMemorySeatmapRepository([gig]),
      new InMemoryCartRepository(),
    );
    await expect(useCase.execute('user-a', 'gig')).resolves.toEqual({
      kind: 'cart',
      cart: { eventSlug: 'gig', items: [], expiresAt: null, totalCents: 0 },
    });
  });

  it('prices items with the stored type defaulting to inteira', async () => {
    const { seatmapRepository, cartRepository } = seededRepositories();
    await cartRepository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: 'pista:A:1',
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const useCase = new GetCartUseCase(seatmapRepository, cartRepository);
    const result = await useCase.execute('user-a', 'gig');
    expect(result).toEqual({
      kind: 'cart',
      cart: {
        eventSlug: 'gig',
        items: [
          {
            sectorSlug: 'pista',
            rowLabel: 'A',
            seatLabel: '1',
            ticketType: 'meia',
            priceCents: 6000,
            expiresAt: new Date('2026-10-16T12:10:00.000Z'),
          },
          {
            sectorSlug: 'pista',
            rowLabel: 'A',
            seatLabel: '2',
            ticketType: 'inteira',
            priceCents: 12000,
            expiresAt: new Date('2026-10-16T12:08:00.000Z'),
          },
        ],
        expiresAt: new Date('2026-10-16T12:08:00.000Z'),
        totalCents: 18000,
      },
    });
  });

  it('expires holds before building the cart', async () => {
    const { seatmapRepository, cartRepository } = seededRepositories();
    const expireSpy = vi.spyOn(seatmapRepository, 'expireHolds');
    const useCase = new GetCartUseCase(seatmapRepository, cartRepository);
    await useCase.execute('user-a', 'gig');
    expect(expireSpy).toHaveBeenCalledOnce();
  });
});
