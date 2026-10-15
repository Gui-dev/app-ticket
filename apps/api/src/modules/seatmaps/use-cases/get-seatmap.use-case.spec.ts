import { describe, expect, it, vi } from 'vitest';
import type { SeatmapEntity } from '../domain/seatmap-entity';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository';
import { GetSeatmapUseCase } from './get-seatmap.use-case';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 15000,
      rows: [],
    },
  ],
};

describe('GetSeatmapUseCase', () => {
  it('returns the seatmap for a known event', async () => {
    const repository = new InMemorySeatmapRepository([gig]);
    await expect(
      new GetSeatmapUseCase(repository).execute('gig'),
    ).resolves.toEqual(gig);
  });

  it('returns null for an unknown event', async () => {
    const repository = new InMemorySeatmapRepository([gig]);
    await expect(
      new GetSeatmapUseCase(repository).execute('outro'),
    ).resolves.toBeNull();
  });

  it('delegates the lookup to the repository', async () => {
    const spy = vi.fn(async () => gig);
    await new GetSeatmapUseCase({ findSeatmap: spy }).execute('gig');
    expect(spy).toHaveBeenCalledWith('gig');
  });
});
