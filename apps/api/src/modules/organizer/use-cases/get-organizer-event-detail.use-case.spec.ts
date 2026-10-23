import { describe, expect, it } from 'vitest';

import type { InMemoryOrganizerEventSeed } from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { GetOrganizerEventDetailUseCase } from './get-organizer-event-detail.use-case';

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

describe('GetOrganizerEventDetailUseCase', () => {
  const detailSeed = (values: Partial<InMemoryOrganizerEventSeed> = {}) => [
    seedEvent({
      id: 'evt-meu',
      title: 'Meu Show',
      organizerId: 'user-a',
      ...values,
    }),
  ];

  it('retorna evento próprio com setores vazios quando não há setores', async () => {
    const repository = createRepository(detailSeed());

    const result = await new GetOrganizerEventDetailUseCase(repository).execute(
      { eventId: 'evt-meu', userId: 'user-a' },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.slug).toBe('meu-show');
    expect(result.sectors).toEqual([]);
  });

  it('monta o detail com setores, filas e contagem de cadeiras', async () => {
    const repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: detailSeed(),
      sectors: [
        {
          eventId: 'evt-meu',
          id: 'sector-palco',
          name: 'Palco',
          priceFromCents: 5000,
          rows: [
            { label: 'A', seatCount: 3 },
            { label: 'B', seatCount: 1 },
          ],
        },
      ],
    });

    const result = await new GetOrganizerEventDetailUseCase(repository).execute(
      { eventId: 'evt-meu', userId: 'user-a' },
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sectors).toHaveLength(1);
    const sector = result.sectors[0];
    if (!sector) return;
    expect(sector.name).toBe('Palco');
    expect(sector.seatsTotal).toBe(4);
    expect(sector.rows.map((row) => row.label)).toEqual(['A', 'B']);
    expect(sector.lots).toEqual([]);
  });

  it('permite leitura de evento da plataforma', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-plataforma',
        title: 'Show da Plataforma',
        organizerId: null,
      }),
    ]);

    const result = await new GetOrganizerEventDetailUseCase(repository).execute(
      { eventId: 'evt-plataforma', userId: 'user-a' },
    );

    expect(result.kind).toBe('ok');
  });

  it('retorna not_found para evento inexistente', async () => {
    const repository = createRepository([]);

    const result = await new GetOrganizerEventDetailUseCase(repository).execute(
      {
        eventId: '11111111-1111-4111-8111-111111111111',
        userId: 'user-a',
      },
    );

    expect(result.kind).toBe('not_found');
  });

  it('retorna forbidden para evento de outro organizador', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-show-alheio',
        title: 'Show Alheio',
        organizerId: 'user-b',
      }),
    ]);

    const result = await new GetOrganizerEventDetailUseCase(repository).execute(
      { eventId: 'evt-show-alheio', userId: 'user-a' },
    );

    expect(result.kind).toBe('forbidden');
  });
});
