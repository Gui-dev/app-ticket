import { describe, expect, it } from 'vitest';
import { pickBestSeat } from '../domain/pick-best-seat.js';
import type {
  SeatmapSector,
  SeatStatusValue,
} from '../domain/seatmap-entity.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { FindBestSeatUseCase } from './find-best-seat.use-case.js';

function seat(label: string, status: SeatStatusValue = 'available') {
  return { label, status };
}

function sectorWith(rows: SeatmapSector['rows']): SeatmapSector {
  return {
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 12000,
    rows,
  };
}

describe('pickBestSeat', () => {
  it('picks the most central seat of the first row with availability', () => {
    expect(
      pickBestSeat(
        sectorWith([
          {
            label: 'A',
            seats: [seat('1'), seat('2'), seat('3'), seat('4'), seat('5')],
          },
        ]),
      ),
    ).toEqual({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '3',
      priceFromCents: 12000,
    });
  });

  it('breaks center ties towards the lower position', () => {
    const best = pickBestSeat(
      sectorWith([
        { label: 'A', seats: [seat('1'), seat('2'), seat('3'), seat('4')] },
      ]),
    );
    expect(best?.seatLabel).toBe('2');
  });

  it('skips occupied seats near the center', () => {
    const best = pickBestSeat(
      sectorWith([
        { label: 'A', seats: [seat('1'), seat('2', 'occupied'), seat('3')] },
      ]),
    );
    expect(best?.seatLabel).toBe('1');
  });

  it('moves to the next row when the first has no free seat', () => {
    const best = pickBestSeat(
      sectorWith([
        {
          label: 'A',
          seats: [
            seat('1', 'occupied'),
            seat('2', 'unavailable'),
            seat('3', 'occupied'),
          ],
        },
        { label: 'B', seats: [seat('1'), seat('2'), seat('3')] },
      ]),
    );
    expect(best).toMatchObject({ rowLabel: 'B', seatLabel: '2' });
  });

  it('ignores unavailable seats even when they are central', () => {
    const best = pickBestSeat(
      sectorWith([
        { label: 'A', seats: [seat('1'), seat('2', 'unavailable'), seat('3')] },
      ]),
    );
    expect(best?.seatLabel).toBe('1');
  });

  it('returns null when the sector has no rows', () => {
    expect(pickBestSeat(sectorWith([]))).toBeNull();
  });

  it('returns null when every seat is taken', () => {
    expect(
      pickBestSeat(
        sectorWith([
          { label: 'A', seats: [seat('1', 'occupied'), seat('2', 'occupied')] },
        ]),
      ),
    ).toBeNull();
  });
});

describe('FindBestSeatUseCase', () => {
  const pista: SeatmapSector = {
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 15000,
    rows: [],
  };
  const plateia = sectorWith([
    { label: 'A', seats: [seat('1'), seat('2'), seat('3')] },
  ]);
  const repository = () =>
    new InMemorySeatmapRepository([
      { eventSlug: 'gig', sectors: [plateia, pista] },
    ]);

  it('returns the seat with the sector price', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'gig',
      'plateia',
    );
    expect(result).toEqual({
      kind: 'seat',
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '2',
        priceFromCents: 12000,
      },
    });
  });

  it('returns event_not_found for an unknown event', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'outro',
      'plateia',
    );
    expect(result).toEqual({ kind: 'event_not_found' });
  });

  it('returns sector_not_found for an unknown sector', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'gig',
      'camarote',
    );
    expect(result).toEqual({ kind: 'sector_not_found' });
  });

  it('returns no_available_seat for a sector without rows', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'gig',
      'pista',
    );
    expect(result).toEqual({ kind: 'no_available_seat' });
  });
});
