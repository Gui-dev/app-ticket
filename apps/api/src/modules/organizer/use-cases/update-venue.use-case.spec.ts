import { describe, expect, it } from 'vitest';

import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { CreateVenueUseCase } from './create-venue.use-case';
import { UpdateVenueUseCase } from './update-venue.use-case';

describe('UpdateVenueUseCase', () => {
  it('renomeia o local mantendo o slug, que é fixado na criação', async () => {
    const repository = new InMemoryOrganizerRepository();
    const venue = await new CreateVenueUseCase(repository).execute({
      name: 'Teatro Municipal',
      city: 'Belo Horizonte',
      state: 'MG',
    });

    const updated = await new UpdateVenueUseCase(repository).execute({
      venueId: venue.id,
      name: 'Teatro Municipal Novo',
      city: 'Belo Horizonte',
      state: 'Mg',
    });

    expect(updated?.slug).toBe('teatro-municipal');
    expect(updated?.name).toBe('Teatro Municipal Novo');
    expect(updated?.state).toBe('Mg');
  });

  it('retorna null para local inexistente', async () => {
    const repository = new InMemoryOrganizerRepository();

    const updated = await new UpdateVenueUseCase(repository).execute({
      venueId: '00000000-0000-4000-8000-000000000000',
      name: 'Teatro Fantasma',
      city: 'Recife',
      state: 'PE',
    });

    expect(updated).toBeNull();
  });
});
