import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { CreateRowUseCase } from './create-row.use-case';

const EVENT_SEED: InMemoryOrganizerEventSeed = {
  id: 'evt-meu',
  title: 'Meu Show',
  description: 'Descrição suficientemente longa do evento testado.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: new Date('2026-12-01T20:00:00.000Z'),
  organizerId: 'user-a',
};

function createRepository(
  organizerId: string | null = 'user-a',
  sectors: InMemoryOrganizerSectorSeed[] = [],
) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events: [{ ...EVENT_SEED, organizerId }],
    sectors,
  });
}

function sectorSeed(
  values: Partial<InMemoryOrganizerSectorSeed>,
): InMemoryOrganizerSectorSeed {
  return { eventId: 'evt-meu', name: 'Pista', ...values };
}

const ROW_INPUT = { sectorId: 'sector-pista', label: 'B', seatCount: 3 };

describe('CreateRowUseCase', () => {
  it('adiciona fila nova com cadeiras e atualiza seatsTotal', async () => {
    const repository = createRepository('user-a', [
      sectorSeed({ id: 'sector-pista', rows: [{ label: 'A', seatCount: 2 }] }),
    ]);

    const result = await new CreateRowUseCase(repository).execute({
      ...ROW_INPUT,
      userId: 'user-a',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sector.rows.map((row) => row.label)).toEqual(['A', 'B']);
    expect(result.sector.rows.map((row) => row.seatCount)).toEqual([2, 3]);
    expect(result.sector.seatsTotal).toBe(5);
  });

  it('recusa fila com label repetida no mesmo setor', async () => {
    const repository = createRepository('user-a', [
      sectorSeed({ id: 'sector-pista', rows: [{ label: 'A', seatCount: 2 }] }),
    ]);

    const result = await new CreateRowUseCase(repository).execute({
      ...ROW_INPUT,
      userId: 'user-a',
      label: 'A',
    });

    expect(result.kind).toBe('label_conflict');
  });

  it('recusa fila em setor inexistente', async () => {
    const repository = createRepository();

    const result = await new CreateRowUseCase(repository).execute({
      ...ROW_INPUT,
      userId: 'user-a',
      sectorId: 'sector-fantasma',
    });

    expect(result.kind).toBe('not_found');
  });

  it('recusa fila em setor da plataforma', async () => {
    const repository = createRepository(null, [
      sectorSeed({ id: 'sector-pista', rows: [] }),
    ]);

    const result = await new CreateRowUseCase(repository).execute({
      ...ROW_INPUT,
      userId: 'user-a',
    });

    expect(result.kind).toBe('forbidden');
  });

  it('recusa fila em setor de outro organizador', async () => {
    const repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: [
        {
          ...EVENT_SEED,
          id: 'evt-alheio',
          organizerId: 'user-b',
        },
      ],
      sectors: [
        sectorSeed({ id: 'sector-pista', eventId: 'evt-alheio', rows: [] }),
      ],
    });

    const result = await new CreateRowUseCase(repository).execute({
      ...ROW_INPUT,
      userId: 'user-a',
    });

    expect(result.kind).toBe('forbidden');
  });
});
