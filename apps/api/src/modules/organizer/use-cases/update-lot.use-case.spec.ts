import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { UpdateLotUseCase } from './update-lot.use-case';

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

const UPDATE = {
  lotId: 'lot-ativo',
  userId: 'user-a',
  name: 'Lote Ativo Ajustado',
  priceCents: 9000,
  startsAt: new Date(NOW - HOUR),
  endsAt: new Date(NOW + 24 * HOUR),
};

describe('UpdateLotUseCase', () => {
  it('atualiza lote ativo e recalcula o preço do evento pela vigência', async () => {
    const repository = createRepository();

    const result = await new UpdateLotUseCase(repository).execute(UPDATE);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.lot).toMatchObject({
      name: 'Lote Ativo Ajustado',
      priceCents: 9000,
      startsAt: UPDATE.startsAt,
      endsAt: UPDATE.endsAt,
    });

    const detail = await repository.listSectorsForEvent('evt-meu');
    expect(detail[0]?.lots[0]).toMatchObject({
      id: 'lot-ativo',
      name: 'Lote Ativo Ajustado',
      priceCents: 9000,
    });

    const event = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(event.kind).toBe('ok');
    if (event.kind !== 'ok') return;
    expect(event.event.priceFromCents).toBe(9000);
  });

  it('recusa janela inválida e sobreposição com outro lote', async () => {
    const repository = createRepository();
    const useCase = new UpdateLotUseCase(repository);

    const janelaInvalida = await useCase.execute({
      ...UPDATE,
      endsAt: new Date(UPDATE.startsAt.getTime()),
    });
    expect(janelaInvalida.kind).toBe('invalid_period');

    const sobreposto = await useCase.execute({
      ...UPDATE,
      startsAt: new Date(NOW + 47 * HOUR),
      endsAt: new Date(NOW + 73 * HOUR),
    });
    expect(sobreposto.kind).toBe('overlapping');
  });

  it('recusa lote inexistente e evento alheio', async () => {
    const repository = createRepository();
    const useCase = new UpdateLotUseCase(repository);

    expect(
      (await useCase.execute({ ...UPDATE, lotId: 'lot-inexistente' })).kind,
    ).toBe('not_found');
    expect((await useCase.execute({ ...UPDATE, userId: 'user-b' })).kind).toBe(
      'forbidden',
    );
  });
});
