import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { CreateLotUseCase } from './create-lot.use-case';

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
};

const EXECUTE = {
  sectorId: 'sector-pista',
  userId: 'user-a',
  name: 'Primeiro Lote',
  priceCents: 12000,
  startsAt: new Date(NOW - HOUR),
  endsAt: new Date(NOW + 24 * HOUR),
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

describe('CreateLotUseCase', () => {
  it('cria lote ativo e recalcula o preço do evento pela vigência', async () => {
    const repository = createRepository();

    const result = await new CreateLotUseCase(repository).execute(EXECUTE);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.lot).toMatchObject({
      name: 'Primeiro Lote',
      priceCents: 12000,
      startsAt: EXECUTE.startsAt,
      endsAt: EXECUTE.endsAt,
    });

    const event = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(event.kind).toBe('ok');
    if (event.kind !== 'ok') return;
    expect(event.event.priceFromCents).toBe(12000);
  });

  it('lote futuro não muda o preço efetivo do evento', async () => {
    const repository = createRepository();

    const result = await new CreateLotUseCase(repository).execute({
      ...EXECUTE,
      startsAt: new Date(NOW + 48 * HOUR),
      endsAt: new Date(NOW + 72 * HOUR),
    });
    expect(result.kind).toBe('ok');

    const event = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(event.kind).toBe('ok');
    if (event.kind !== 'ok') return;
    expect(event.event.priceFromCents).toBe(5000);
  });

  it('recusa janela encerrada antes de começar com invalid_period', async () => {
    const repository = createRepository();

    const result = await new CreateLotUseCase(repository).execute({
      ...EXECUTE,
      endsAt: new Date(EXECUTE.startsAt.getTime()),
    });

    expect(result.kind).toBe('invalid_period');
  });

  it('recusa sobreposição de janela com lote existente', async () => {
    const repository = createRepository([
      {
        ...SECTOR_SEED,
        lots: [
          {
            id: 'lot-futuro',
            name: 'Lote Futuro',
            priceCents: 8000,
            startsAt: new Date(NOW + 48 * HOUR),
            endsAt: new Date(NOW + 72 * HOUR),
          },
        ],
      },
    ]);
    const useCase = new CreateLotUseCase(repository);

    const englobado = await useCase.execute({
      ...EXECUTE,
      name: 'Lote Cortando o Futuro',
      startsAt: new Date(NOW + 47 * HOUR),
      endsAt: new Date(NOW + 73 * HOUR),
    });
    expect(englobado.kind).toBe('overlapping');

    const bordaFinal = await useCase.execute({
      ...EXECUTE,
      name: 'Lote Bate na Entrada',
      startsAt: new Date(NOW + 46 * HOUR),
      endsAt: new Date(NOW + 49 * HOUR),
    });
    expect(bordaFinal.kind).toBe('overlapping');

    const bordaInicial = await useCase.execute({
      ...EXECUTE,
      name: 'Lote Bate na Saída',
      startsAt: new Date(NOW + 71 * HOUR),
      endsAt: new Date(NOW + 80 * HOUR),
    });
    expect(bordaInicial.kind).toBe('overlapping');

    const encostado = await useCase.execute({
      ...EXECUTE,
      name: 'Lote Encostado',
      startsAt: new Date(NOW + 24 * HOUR),
      endsAt: new Date(NOW + 48 * HOUR),
    });
    expect(encostado.kind).toBe('ok');

    const detail = await repository.listLotsBySector('sector-pista');
    expect(detail.map((lot) => lot.name)).toEqual([
      'Lote Encostado',
      'Lote Futuro',
    ]);
  });

  it('recusa setor inexistente e evento alheio', async () => {
    const repository = createRepository();
    const useCase = new CreateLotUseCase(repository);

    expect(
      (await useCase.execute({ ...EXECUTE, sectorId: 'sector-inexistente' }))
        .kind,
    ).toBe('not_found');
    expect((await useCase.execute({ ...EXECUTE, userId: 'user-b' })).kind).toBe(
      'forbidden',
    );
  });

  it('detail do setor passa a listar os lotes por startsAt', async () => {
    const repository = createRepository();
    const useCase = new CreateLotUseCase(repository);

    await useCase.execute({
      ...EXECUTE,
      name: 'Lote Ativo',
      startsAt: new Date(NOW - HOUR),
      endsAt: new Date(NOW + 24 * HOUR),
    });
    await useCase.execute({
      ...EXECUTE,
      name: 'Lote Futuro',
      startsAt: new Date(NOW + 48 * HOUR),
      endsAt: new Date(NOW + 72 * HOUR),
    });

    const detail = await repository.listSectorsForEvent('evt-meu');
    expect(detail[0]?.lots.map((lot) => lot.name)).toEqual([
      'Lote Ativo',
      'Lote Futuro',
    ]);
  });
});
