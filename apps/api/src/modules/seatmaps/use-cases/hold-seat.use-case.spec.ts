import { CART_MAX_ITEMS, SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { cartItemKey } from '../domain/cart-repository.js';
import { holdSeatKey } from '../domain/hold-entity.js';
import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryCartRepository } from '../infra/in-memory-cart-repository.js';
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
  const cartRepository = new InMemoryCartRepository(() => new Date(nowMs));
  const useCase = new HoldSeatUseCase(
    seatmapRepository,
    holdRepository,
    cartRepository,
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
    const first = await useCase.execute({ userId: 'user-a', ...baseInput });
    expect(first.kind).toBe('held');
    if (first.kind !== 'held') return;
    expect(first.renewed).toBe(false);
    const result = await useCase.execute({ userId: 'user-a', ...baseInput });
    expect(result.kind).toBe('held');
    if (result.kind !== 'held') return;
    expect(result.renewed).toBe(true);
  });

  it('keeps the ticket type alive across hold renewals', async () => {
    let nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    const now = () => new Date(nowMs);
    const seatmapRepository = new InMemorySeatmapRepository(
      [seatmap],
      undefined,
      now,
    );
    const holdRepository = new InMemoryHoldRepository(now);
    const cartRepository = new InMemoryCartRepository(now);
    const useCase = new HoldSeatUseCase(
      seatmapRepository,
      holdRepository,
      cartRepository,
      now,
    );
    const input = { userId: 'user-a', ...baseInput };
    await useCase.execute(input);
    await cartRepository.setType({
      userId: 'user-a',
      eventSlug: baseInput.eventSlug,
      itemKey: cartItemKey(
        baseInput.sectorSlug,
        baseInput.rowLabel,
        baseInput.seatLabel,
      ),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    nowMs += 500 * 1000;
    const renewed = await useCase.execute(input);
    expect(renewed.kind).toBe('held');
    nowMs += 150 * 1000;
    const types = await cartRepository.getTypes({
      userId: 'user-a',
      eventSlug: baseInput.eventSlug,
    });
    expect(types.get('plateia:A:1')).toBe('meia');
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

  it('rolls back the redis claim when the mirror rejects the seat', async () => {
    const { useCase, holdRepository } = createUseCase();
    const result = await useCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '3',
    });
    expect(result.kind).toBe('seat_unavailable');
    const seatKey = holdSeatKey(
      'o-fantasma-da-opera',
      'o-fantasma-da-opera:plateia:A',
      'o-fantasma-da-opera:plateia:A:3',
    );
    await expect(
      holdRepository.claim(seatKey, 'user-b', SEAT_HOLD_TTL_SECONDS),
    ).resolves.toBe('claimed');
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

  it('rejects a new seat when the cart is full', async () => {
    const nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    const fillers = Array.from({ length: CART_MAX_ITEMS }, (_, index) => ({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-a',
      sectorSlug: 'plateia',
      rowLabel: 'B',
      seatLabel: String(index + 1),
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    }));
    const repositoryWithCart = new InMemorySeatmapRepository(
      [
        {
          ...seatmap,
          sectors: [
            {
              ...seatmap.sectors[0],
              rows: [
                ...seatmap.sectors[0].rows,
                {
                  label: 'B',
                  seats: Array.from({ length: CART_MAX_ITEMS }, (_, i) => ({
                    label: String(i + 1),
                    status: 'reserved' as const,
                  })),
                },
              ],
            },
          ],
        },
      ],
      fillers,
      () => new Date(nowMs),
    );
    const limitedUseCase = new HoldSeatUseCase(
      repositoryWithCart,
      new InMemoryHoldRepository(() => new Date(nowMs)),
      new InMemoryCartRepository(() => new Date(nowMs)),
      () => new Date(nowMs),
    );
    const result = await limitedUseCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '1',
    });
    expect(result.kind).toBe('cart_limit');
  });

  it('still renews the same seat when the cart is full', async () => {
    const nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    const fillers = Array.from({ length: CART_MAX_ITEMS }, (_, index) => ({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-a',
      sectorSlug: 'plateia',
      rowLabel: 'B',
      seatLabel: String(index + 1),
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    }));
    const repositoryWithCart = new InMemorySeatmapRepository(
      [
        {
          ...seatmap,
          sectors: [
            {
              ...seatmap.sectors[0],
              rows: [
                ...seatmap.sectors[0].rows,
                {
                  label: 'B',
                  seats: Array.from({ length: CART_MAX_ITEMS }, (_, i) => ({
                    label: String(i + 1),
                    status: 'reserved' as const,
                  })),
                },
              ],
            },
          ],
        },
      ],
      fillers,
      () => new Date(nowMs),
    );
    const holdRepository = new InMemoryHoldRepository(() => new Date(nowMs));
    const limitedUseCase = new HoldSeatUseCase(
      repositoryWithCart,
      holdRepository,
      new InMemoryCartRepository(() => new Date(nowMs)),
      () => new Date(nowMs),
    );
    await holdRepository.claim(
      holdSeatKey(
        'o-fantasma-da-opera',
        'o-fantasma-da-opera:plateia:A',
        'o-fantasma-da-opera:plateia:A:1',
      ),
      'user-a',
      SEAT_HOLD_TTL_SECONDS,
    );
    await repositoryWithCart.reserveSeat({
      seatId: 'o-fantasma-da-opera:plateia:A:1',
      userId: 'user-a',
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    });
    const result = await limitedUseCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '1',
    });
    expect(result.kind).toBe('held');
  });
});
