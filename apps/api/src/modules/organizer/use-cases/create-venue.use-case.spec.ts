import { describe, expect, it } from 'vitest';

import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { CreateVenueUseCase } from './create-venue.use-case';

describe('CreateVenueUseCase', () => {
  it('cria local com slug derivado do nome', async () => {
    const repository = new InMemoryOrganizerRepository();

    const venue = await new CreateVenueUseCase(repository).execute({
      name: 'Teatro Municipal',
      city: 'Belo Horizonte',
      state: 'mg',
    });

    expect(venue.slug).toBe('teatro-municipal');
    expect(venue.state).toBe('mg');
    expect(venue.id.length).toBeGreaterThan(0);
  });

  it('gera slug único para nome repetido', async () => {
    const repository = new InMemoryOrganizerRepository();
    const useCase = new CreateVenueUseCase(repository);

    const first = await useCase.execute({
      name: 'Teatro Municipal',
      city: 'Belo Horizonte',
      state: 'MG',
    });
    const second = await useCase.execute({
      name: 'Teatro Municipal',
      city: 'Belo Horizonte',
      state: 'MG',
    });

    expect(first.slug).toBe('teatro-municipal');
    expect(second.slug).toBe('teatro-municipal-2');
  });
});
