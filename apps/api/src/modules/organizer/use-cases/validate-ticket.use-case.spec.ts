import { describe, expect, it } from 'vitest';

import type { InMemoryOrganizerTicketSeed } from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { ValidateTicketUseCase } from './validate-ticket.use-case';

describe('ValidateTicketUseCase', () => {
  it('delega a validação ao repositório', async () => {
    const tickets: InMemoryOrganizerTicketSeed[] = [
      { eventId: 'evt-meu', code: 'TKV-1', rowLabel: 'A', seatLabel: '1' },
    ];
    const repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: [
        {
          id: 'evt-meu',
          title: 'Meu Show',
          description: 'Descrição suficientemente longa do evento testado.',
          categorySlug: 'shows',
          venueSlug: 'arena-sp',
          startsAt: new Date('2026-12-01T20:00:00.000Z'),
          organizerId: 'user-a',
        },
      ],
      tickets,
    });
    const useCase = new ValidateTicketUseCase(repository);

    const valid = await useCase.execute({
      eventId: 'evt-meu',
      userId: 'user-a',
      code: 'TKV-1',
    });
    expect(valid.kind).toBe('ok');

    const invalid = await useCase.execute({
      eventId: 'evt-meu',
      userId: 'user-a',
      code: 'TKV-2',
    });
    expect(invalid).toEqual({ kind: 'invalid' });
  });
});
