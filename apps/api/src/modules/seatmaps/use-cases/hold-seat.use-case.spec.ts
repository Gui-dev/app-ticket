import { describe, expect, it } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { HoldSeatUseCase } from './hold-seat.use-case.js';

const seatmap: SeatmapEntity = {
  eventSlug: 'o-fantasma-da-opera',
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'available' },
            { label: '2', status: 'occupied' },
            { label: '3', status: 'reserved' },
          ],
        },
      ],
    },
  ],
};

function createUseCase(nowMs = Date.parse('2026-10-16T12:00:00.000Z')) {
  const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
  const holdRepository = new InMemoryHoldRepository(() => new Date(nowMs));
  const useCase = new HoldSeatUseCase(
    seatmapRepository,
    holdRepository,
    () => new Date(nowMs),
  );
  return { useCase, holdRepository };
}

const baseInput = {
  eventSlug: 'o-fantasma-da-opera',
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: '1',
};

describe('HoldSeatUseCase', () => {
  it('holds an available seat for the user', async () => {
    const { useCase } = createUseCase();
    const result = await useCase.execute({ userId: 'user-a', ...baseInput });
    expect(result.kind).toBe('held');
    if (result.kind !== 'held') return;
    expect(result.hold).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(result.hold.expiresAt.toISOString()).toBe(
      '2026-10-16T12:10:00.000Z',
    );
    expect(result.renewed).toBe(false);
  });

  it('renews when the same user claims again', async () => {
    const { useCase } = createUseCase();
    await useCase.execute({ userId: 'user-a', ...baseInput });
    const result = await useCase.execute({ userId: 'user-a', ...baseInput });
    expect(result.kind).toBe('held');
    if (result.kind !== 'held') return;
    expect(result.renewed).toBe(true);
  });

  it('reports seat_held when another user owns the hold', async () => {
    const { useCase } = createUseCase();
    await useCase.execute({ userId: 'user-a', ...baseInput });
    const result = await useCase.execute({ userId: 'user-b', ...baseInput });
    expect(result.kind).toBe('seat_held');
  });

  it('reports seat_unavailable for occupied and reserved seats', async () => {
    const { useCase } = createUseCase();
    const occupied = await useCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '2',
    });
    expect(occupied.kind).toBe('seat_unavailable');
    const reserved = await useCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '3',
    });
    expect(reserved.kind).toBe('seat_unavailable');
  });

  it('distinguishes event, sector and seat misses', async () => {
    const { useCase } = createUseCase();
    expect(
      (
        await useCase.execute({
          userId: 'user-a',
          ...baseInput,
          eventSlug: 'x',
        })
      ).kind,
    ).toBe('event_not_found');
    expect(
      (
        await useCase.execute({
          userId: 'user-a',
          ...baseInput,
          sectorSlug: 'x',
        })
      ).kind,
    ).toBe('sector_not_found');
    expect(
      (
        await useCase.execute({
          userId: 'user-a',
          ...baseInput,
          seatLabel: '9',
        })
      ).kind,
    ).toBe('seat_not_found');
  });
});
