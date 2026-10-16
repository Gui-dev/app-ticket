import { describe, expect, it } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { HoldSeatUseCase } from './hold-seat.use-case.js';
import { ReleaseHoldUseCase } from './release-hold.use-case.js';

const seatmap: SeatmapEntity = {
  eventSlug: 'o-fantasma-da-opera',
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      rows: [{ label: 'A', seats: [{ label: '1', status: 'available' }] }],
    },
  ],
};

describe('ReleaseHoldUseCase', () => {
  it('releases an owned hold and frees the seat', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
    const holdRepository = new InMemoryHoldRepository();
    const holdSeat = new HoldSeatUseCase(seatmapRepository, holdRepository);
    const release = new ReleaseHoldUseCase(seatmapRepository, holdRepository);

    await holdSeat.execute({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });

    const result = await release.execute({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(result.kind).toBe('released');

    const holds = await seatmapRepository.findHoldsByUser({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-a',
    });
    expect(holds).toHaveLength(0);
    const seat = await seatmapRepository.findSeatByCoords({
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(seat.found && seat.seat.status).toBe('available');
  });

  it('reports hold_not_found for foreign or missing holds', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
    const holdRepository = new InMemoryHoldRepository();
    const holdSeat = new HoldSeatUseCase(seatmapRepository, holdRepository);
    const release = new ReleaseHoldUseCase(seatmapRepository, holdRepository);
    const coords = {
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    };

    const missing = await release.execute({ userId: 'user-a', ...coords });
    expect(missing.kind).toBe('hold_not_found');

    await holdSeat.execute({ userId: 'user-a', ...coords });
    const foreign = await release.execute({ userId: 'user-b', ...coords });
    expect(foreign.kind).toBe('hold_not_found');

    const owned = await release.execute({ userId: 'user-a', ...coords });
    expect(owned.kind).toBe('released');
  });
});
