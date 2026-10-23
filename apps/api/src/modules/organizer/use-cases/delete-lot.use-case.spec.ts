import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { DeleteLotUseCase } from './delete-lot.use-case';

const HOUR = 3_600_000;
const NOW = Date.now();

const EVENT_SEED: InMemoryOrganizerEventSeed = {
  id: 'evt-meu',
  title: 'Meu Show',
  description: 'Descrição suficientemente longa do evento testado.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: new Date('2026-12-01T20:00:00.000Z'),
  organizerId: 'user-a',
};

const SECTOR_SEED: InMemoryOrganizerSectorSeed = {
  eventId: 'evt-meu',
  id: 'sector-pista',
  name: 'Pista',
  priceFromCents: 5000,
  lots: [
    {
      id: 'lot-ativo',
      name: 'Lote Ativo',
      priceCents: 12000,
      startsAt: new Date(NOW - HOUR),
      endsAt: new Date(NOW + 24 * HOUR),
    },
    {
      id: 'lot-futuro',
      name: 'Lote Futuro',
      priceCents: 8000,
      startsAt: new Date(NOW + 48 * HOUR),
      endsAt: new Date(NOW + 72 * HOUR),
    },
  ],
};

function createRepository(
  sectors: InMemoryOrganizerSectorSeed[] = [SECTOR_SEED],
) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events: [EVENT_SEED],
    sectors,
  });
}

describe('DeleteLotUseCase', () => {
  it('remove o lote ativo e o preço do evento volta ao setor', async () => {
    const repository = createRepository();

    const result = await new DeleteLotUseCase(repository).execute({
      lotId: 'lot-ativo',
      userId: 'user-a',
    });
    expect(result).toBe('ok');

    const detail = await repository.listSectorsForEvent('evt-meu');
    expect(detail[0]?.lots.map((lot) => lot.id)).toEqual(['lot-futuro']);
    expect(detail[0]?.priceFromCents).toBe(5000);

    const event = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(event.kind).toBe('ok');
    if (event.kind !== 'ok') return;
    expect(event.event.priceFromCents).toBe(5000);
  });

  it('remover um lote não altera os dados dos outros lotes', async () => {
    const repository = createRepository();

    await new DeleteLotUseCase(repository).execute({
      lotId: 'lot-ativo',
      userId: 'user-a',
    });

    const detail = await repository.listLotsBySector('sector-pista');
    expect(detail).toEqual([
      {
        id: 'lot-futuro',
        name: 'Lote Futuro',
        priceCents: 8000,
        startsAt: new Date(NOW + 48 * HOUR),
        endsAt: new Date(NOW + 72 * HOUR),
      },
    ]);
  });

  it('recusa lote inexistente e evento alheio', async () => {
    const repository = createRepository();
    const useCase = new DeleteLotUseCase(repository);

    expect(
      await useCase.execute({ lotId: 'lot-inexistente', userId: 'user-a' }),
    ).toBe('not_found');
    expect(
      await useCase.execute({ lotId: 'lot-ativo', userId: 'user-b' }),
    ).toBe('forbidden');
  });
});
