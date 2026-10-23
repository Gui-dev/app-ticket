import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerSectorSeed,
} from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { DeleteRowUseCase } from './delete-row.use-case';

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
const FREE_SEAT_ID = '00000000-0000-4000-8000-000000000002';

function createRepository(
  sectors: InMemoryOrganizerSectorSeed[],
  orders: { eventId: string; seatIds?: string[] }[] = [],
) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events: [
      EVENT_SEED,
      {
        ...EVENT_SEED,
        id: 'evt-plataforma',
        organizerId: null,
      },
    ],
    sectors,
    orders,
  });
}

describe('DeleteRowUseCase', () => {
  it('exclui fila sem vendas junto com as cadeiras', async () => {
    const repository = createRepository([
      {
        eventId: 'evt-meu',
        id: 'sector-pista',
        name: 'Pista',
        rows: [
          { label: 'A', seatCount: 2, seatIds: [SOLD_SEAT_ID, FREE_SEAT_ID] },
        ],
      },
    ]);
    const detail = await repository.listSectorsForEvent('evt-meu');
    const rowId = detail[0]?.rows[0]?.id;
    if (!rowId) throw new Error('fixture sem fila');

    const result = await new DeleteRowUseCase(repository).execute({
      rowId,
      userId: 'user-a',
    });

    expect(result).toBe('ok');
    const after = await repository.listSectorsForEvent('evt-meu');
    expect(after[0]?.rows).toEqual([]);
    expect(after[0]?.seatsTotal).toBe(0);
  });

  it('recusa exclusão de fila com cadeira vendida', async () => {
    const repository = createRepository(
      [
        {
          eventId: 'evt-meu',
          id: 'sector-pista',
          name: 'Pista',
          rows: [
            { label: 'A', seatCount: 2, seatIds: [SOLD_SEAT_ID, FREE_SEAT_ID] },
          ],
        },
      ],
      [{ eventId: 'evt-meu', seatIds: [SOLD_SEAT_ID] }],
    );
    const detail = await repository.listSectorsForEvent('evt-meu');
    const rowId = detail[0]?.rows[0]?.id;
    if (!rowId) throw new Error('fixture sem fila');

    const result = await new DeleteRowUseCase(repository).execute({
      rowId,
      userId: 'user-a',
    });

    expect(result).toBe('has_orders');
    const after = await repository.listSectorsForEvent('evt-meu');
    expect(after[0]?.rows).toHaveLength(1);
  });

  it('recusa exclusão de fila da plataforma', async () => {
    const repository = createRepository([
      {
        eventId: 'evt-plataforma',
        id: 'sector-pista',
        name: 'Pista',
        rows: [{ label: 'A', seatCount: 1, seatIds: [SOLD_SEAT_ID] }],
      },
    ]);
    const detail = await repository.listSectorsForEvent('evt-plataforma');
    const rowId = detail[0]?.rows[0]?.id;
    if (!rowId) throw new Error('fixture sem fila');

    const result = await new DeleteRowUseCase(repository).execute({
      rowId,
      userId: 'user-a',
    });

    expect(result).toBe('forbidden');
  });

  it('devolve not_found para fila inexistente', async () => {
    const repository = createRepository([]);

    const result = await new DeleteRowUseCase(repository).execute({
      rowId: '00000000-0000-4000-8000-000000000009',
      userId: 'user-a',
    });

    expect(result).toBe('not_found');
  });
});
