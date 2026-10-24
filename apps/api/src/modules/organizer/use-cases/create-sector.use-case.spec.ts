import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { CreateSectorUseCase } from './create-sector.use-case';
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

const CREATE_INPUT = {
  eventId: 'evt-meu',
  userId: 'user-a',
  name: 'Palco',
  priceFromCents: 5000,
  rows: [
    { label: 'A', seatCount: 3 },
    { label: 'B', seatCount: 1 },
  ],
};

function createRepository(
  events: InMemoryOrganizerEventSeed[],
  seedValues: InMemoryOrganizerSectorSeed[] = [],
) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events,
    sectors: seedValues,
  });
}

describe('CreateSectorUseCase', () => {
  it('cria setor com filas e cadeiras geradas de 1 até N', async () => {
    const repository = createRepository([EVENT_SEED]);

    const result = await new CreateSectorUseCase(repository).execute(
      CREATE_INPUT,
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sector.slug).toBe('palco');
    expect(result.sector.name).toBe('Palco');
    expect(result.sector.priceFromCents).toBe(5000);
    expect(result.sector.seatsTotal).toBe(4);
    expect(result.sector.rows.map((row) => row.label)).toEqual(['A', 'B']);
    expect(result.sector.rows.map((row) => row.seatCount)).toEqual([3, 1]);
    expect(result.sector.lots).toEqual([]);

    const detail = await repository.listSectorsForEvent('evt-meu');
    expect(detail).toHaveLength(1);
    expect(detail[0]?.seatsTotal).toBe(4);
  });

  it('recalcula o preço do evento com o mínimo dos setores', async () => {
    const repository = createRepository([EVENT_SEED]);
    const useCase = new CreateSectorUseCase(repository);

    await useCase.execute({
      ...CREATE_INPUT,
      name: 'Pista',
      priceFromCents: 10000,
    });
    await useCase.execute({
      ...CREATE_INPUT,
      name: 'Camarote',
      priceFromCents: 8000,
    });

    const event = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(event.kind).toBe('ok');
    if (event.kind !== 'ok') return;
    expect(event.event.priceFromCents).toBe(8000);
  });

  it('recusa criação em evento inexistente', async () => {
    const result = await new CreateSectorUseCase(createRepository([])).execute(
      CREATE_INPUT,
    );

    expect(result.kind).toBe('not_found');
  });

  it('recusa escrita em evento da plataforma', async () => {
    const repository = createRepository([
      { ...EVENT_SEED, id: 'evt-plataforma', organizerId: null },
    ]);

    const result = await new CreateSectorUseCase(repository).execute({
      ...CREATE_INPUT,
      eventId: 'evt-plataforma',
    });

    expect(result.kind).toBe('forbidden');
  });

  it('recusa escrita em evento alheio', async () => {
    const repository = createRepository([
      { ...EVENT_SEED, id: 'evt-alheio', organizerId: 'user-b' },
    ]);

    const result = await new CreateSectorUseCase(repository).execute({
      ...CREATE_INPUT,
      eventId: 'evt-alheio',
    });

    expect(result.kind).toBe('forbidden');
  });

  it('recusa nome de setor que colide com setor existente no evento', async () => {
    const repository = createRepository(
      [EVENT_SEED],
      [{ eventId: 'evt-meu', id: 'sector-palco', name: 'Palco' }],
    );

    const result = await new CreateSectorUseCase(repository).execute(
      CREATE_INPUT,
    );

    expect(result.kind).toBe('sector_conflict');
  });
});

describe('DeleteSectorUseCase recálculo residual', () => {
  it('remove o último setor preservando o preço anterior quando não restam setores', async () => {
    const repository = createRepository([EVENT_SEED]);

    await new CreateSectorUseCase(repository).execute({
      ...CREATE_INPUT,
      name: 'Palco',
      priceFromCents: 5000,
      rows: [{ label: 'A', seatCount: 1 }],
    });

    const eventBefore = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(eventBefore.kind).toBe('ok');
    if (eventBefore.kind !== 'ok') return;
    expect(eventBefore.event.priceFromCents).toBe(5000);

    const detail = await repository.listSectorsForEvent('evt-meu');
    const sectorId = detail[0]?.id;
    if (!sectorId) throw new Error('fixture sem setor');

    const result = await new DeleteSectorUseCase(repository).execute({
      sectorId,
      userId: 'user-a',
    });

    expect(result).toBe('ok');
    expect(await repository.listSectorsForEvent('evt-meu')).toEqual([]);

    const eventAfter = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(eventAfter.kind).toBe('ok');
    if (eventAfter.kind !== 'ok') return;
    expect(eventAfter.event.priceFromCents).toBe(5000);
  });
});
