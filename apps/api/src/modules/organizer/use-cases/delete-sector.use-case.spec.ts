import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { DeleteSectorUseCase } from './delete-sector.use-case';

const EVENT_SEED: InMemoryOrganizerEventSeed = {
  id: 'evt-meu',
  title: 'Meu Show',
  description: 'Descrição suficientemente longa do evento testado.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: new Date('2026-12-01T20:00:00.000Z'),
  organizerId: 'user-a',
};

const SOLD_SEAT_ID = '00000000-0000-4000-8000-000000000001';

function createRepository(
  sectors: InMemoryOrganizerSectorSeed[],
  orders: { eventId: string; seatIds?: string[] }[] = [],
) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events: [EVENT_SEED],
    sectors,
    orders,
  });
}

describe('DeleteSectorUseCase', () => {
  it('exclui setor sem vendas e recalcula o mínimo dos restantes', async () => {
    const repository = createRepository([
      {
        eventId: 'evt-meu',
        id: 'sector-pista',
        name: 'Pista',
        priceFromCents: 5000,
        rows: [{ label: 'A', seatCount: 1, seatIds: [SOLD_SEAT_ID] }],
      },
      {
        eventId: 'evt-meu',
        id: 'sector-camarote',
        name: 'Camarote',
        priceFromCents: 8000,
        rows: [{ label: 'A', seatCount: 1 }],
      },
    ]);
    await repository.recalculateEventPriceFrom('evt-meu');

    const result = await new DeleteSectorUseCase(repository).execute({
      sectorId: 'sector-pista',
      userId: 'user-a',
    });

    expect(result).toBe('ok');
    const remaining = await repository.listSectorsForEvent('evt-meu');
    expect(remaining.map((sector) => sector.name)).toEqual(['Camarote']);
    const event = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(event.kind).toBe('ok');
    if (event.kind !== 'ok') return;
    expect(event.event.priceFromCents).toBe(8000);
  });

  it('recusa exclusão de setor com cadeira vendida', async () => {
    const repository = createRepository(
      [
        {
          eventId: 'evt-meu',
          id: 'sector-pista',
          name: 'Pista',
          priceFromCents: 5000,
          rows: [{ label: 'A', seatCount: 1, seatIds: [SOLD_SEAT_ID] }],
        },
      ],
      [{ eventId: 'evt-meu', seatIds: [SOLD_SEAT_ID] }],
    );

    const result = await new DeleteSectorUseCase(repository).execute({
      sectorId: 'sector-pista',
      userId: 'user-a',
    });

    expect(result).toBe('has_orders');
    const remaining = await repository.listSectorsForEvent('evt-meu');
    expect(remaining).toHaveLength(1);
  });

  it('recusa exclusão de setor da plataforma', async () => {
    const repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: [{ ...EVENT_SEED, organizerId: null }],
      sectors: [
        {
          eventId: 'evt-meu',
          id: 'sector-pista',
          name: 'Pista',
          rows: [{ label: 'A', seatCount: 1 }],
        },
      ],
    });

    const result = await new DeleteSectorUseCase(repository).execute({
      sectorId: 'sector-pista',
      userId: 'user-a',
    });

    expect(result).toBe('forbidden');
  });

  it('devolve not_found para setor inexistente', async () => {
    const repository = createRepository([]);

    const result = await new DeleteSectorUseCase(repository).execute({
      sectorId: '00000000-0000-4000-8000-000000000009',
      userId: 'user-a',
    });

    expect(result).toBe('not_found');
  });
});
