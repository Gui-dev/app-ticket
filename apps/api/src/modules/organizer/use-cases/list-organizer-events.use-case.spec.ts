import { describe, expect, it } from 'vitest';

import type { InMemoryOrganizerEventSeed } from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { ListOrganizerEventsUseCase } from './list-organizer-events.use-case';

function seedEvent(
  values: Partial<InMemoryOrganizerEventSeed> & { title: string },
): InMemoryOrganizerEventSeed {
  return {
    description: 'Descrição suficientemente longa do evento testado.',
    categorySlug: 'shows',
    venueSlug: 'arena-sp',
    startsAt: new Date('2026-12-01T20:00:00.000Z'),
    organizerId: null,
    ...values,
  };
}

function createRepository(events: InMemoryOrganizerEventSeed[]) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events,
  });
}

describe('ListOrganizerEventsUseCase', () => {
  it('lista eventos próprios e da plataforma ordenados por data', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-meu',
        title: 'Meu Show',
        organizerId: 'user-a',
        startsAt: new Date('2026-12-10T20:00:00.000Z'),
      }),
      seedEvent({
        id: 'evt-alheio',
        title: 'Show Alheio',
        organizerId: 'user-b',
        startsAt: new Date('2026-12-02T20:00:00.000Z'),
      }),
      seedEvent({
        id: 'evt-plataforma',
        title: 'Show da Plataforma',
        organizerId: null,
        startsAt: new Date('2026-12-05T20:00:00.000Z'),
      }),
      seedEvent({
        id: 'evt-antigo',
        title: 'Meu Show Antigo',
        organizerId: 'user-a',
        startsAt: new Date('2026-12-01T20:00:00.000Z'),
      }),
    ]);

    const result = await new ListOrganizerEventsUseCase(repository).execute(
      'user-a',
    );

    expect(result.map((event) => event.id)).toEqual([
      'evt-antigo',
      'evt-plataforma',
      'evt-meu',
    ]);
    expect(result.map((event) => event.organizerId === null)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('retorna lista vazia quando não há eventos próprios nem da plataforma', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-alheio',
        title: 'Só de Outro',
        organizerId: 'user-b',
      }),
    ]);

    const result = await new ListOrganizerEventsUseCase(repository).execute(
      'user-a',
    );

    expect(result).toEqual([]);
  });
});
