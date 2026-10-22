import { describe, expect, it, vi } from 'vitest';
import type { SeatmapEntity } from '../domain/seatmap-entity';
import type { SeatmapRepository } from '../domain/seatmap-repository';
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

function stubRepository(overrides: Partial<SeatmapRepository>) {
  return {
    existsBySlug: vi.fn(async () => true),
    findSeatmap: vi.fn(async () => null),
    findSeatByCoords: vi.fn(),
    findHoldsByUser: vi.fn(async () => []),
    expireHolds: vi.fn(async () => {}),
    reserveSeat: vi.fn(async () => true),
    renewSeatHold: vi.fn(async () => true),
    releaseSeat: vi.fn(async () => {}),
    ...overrides,
  } satisfies SeatmapRepository;
}

describe('GetSeatmapUseCase', () => {
  it('returns the seatmap for a known event', async () => {
    const repository = new InMemorySeatmapRepository([gig]);
    await expect(
      new GetSeatmapUseCase(repository).execute('gig'),
    ).resolves.toEqual({ seatmap: gig, holds: [] });
  });

  it('returns null for an unknown event', async () => {
    const repository = new InMemorySeatmapRepository([gig]);
    await expect(
      new GetSeatmapUseCase(repository).execute('outro'),
    ).resolves.toBeNull();
  });

  it('returns the user holds when a userId is given', async () => {
    const hold = {
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
      priceFromCents: 15000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    };
    const holdsSpy = vi.fn(async () => [hold]);
    const result = await new GetSeatmapUseCase(
      stubRepository({
        findSeatmap: vi.fn(async () => gig),
        findHoldsByUser: holdsSpy,
      }),
    ).execute('gig', 'user-a');
    expect(holdsSpy).toHaveBeenCalledWith({
      eventSlug: 'gig',
      userId: 'user-a',
    });
    expect(result).toEqual({ seatmap: gig, holds: [hold] });
  });

  it('skips the holds lookup without a userId', async () => {
    const holdsSpy = vi.fn(async () => []);
    await new GetSeatmapUseCase(
      stubRepository({
        findSeatmap: vi.fn(async () => gig),
        findHoldsByUser: holdsSpy,
      }),
    ).execute('gig');
    expect(holdsSpy).not.toHaveBeenCalled();
  });

  it('expires holds before the lookup', async () => {
    const expireSpy = vi.fn(async () => {});
    await new GetSeatmapUseCase(
      stubRepository({
        findSeatmap: vi.fn(async () => gig),
        expireHolds: expireSpy,
      }),
    ).execute('gig');
    expect(expireSpy).toHaveBeenCalledOnce();
  });

  it('delegates the lookup to the repository', async () => {
    const spy = vi.fn(async () => gig);
    await new GetSeatmapUseCase(stubRepository({ findSeatmap: spy })).execute(
      'gig',
    );
    expect(spy).toHaveBeenCalledWith('gig');
  });
});
