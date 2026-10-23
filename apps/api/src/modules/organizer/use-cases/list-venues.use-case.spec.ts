import { describe, expect, it } from 'vitest';

import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { ListVenuesUseCase } from './list-venues.use-case';

function createRepository(
  venues: { slug: string; name: string; city: string; state: string }[],
) {
  return new InMemoryOrganizerRepository({ venues });
}

describe('ListVenuesUseCase', () => {
  it('lista o catálogo compartilhado em ordem alfabética de nome', async () => {
    const repository = createRepository([
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      {
        slug: 'teatro-central',
        name: 'Teatro Central',
        city: 'Curitiba',
        state: 'PR',
      },
      {
        slug: 'escola-sul',
        name: 'Escola Sul',
        city: 'Porto Alegre',
        state: 'RS',
      },
    ]);

    const venues = await new ListVenuesUseCase(repository).execute();

    expect(venues.map((venue) => venue.name)).toEqual([
      'Arena SP',
      'Escola Sul',
      'Teatro Central',
    ]);
    expect(venues[0]).toEqual({
      id: expect.any(String),
      slug: 'arena-sp',
      name: 'Arena SP',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('devolve lista vazia sem catálogo', async () => {
    const venues = await new ListVenuesUseCase(createRepository([])).execute();

    expect(venues).toEqual([]);
  });
});
