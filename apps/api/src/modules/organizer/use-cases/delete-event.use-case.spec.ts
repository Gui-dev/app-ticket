import { describe, expect, it } from 'vitest';

import type { InMemoryOrganizerEventSeed } from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { DeleteEventUseCase } from './delete-event.use-case';

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

function createRepository(
  events: InMemoryOrganizerEventSeed[],
  orders: { eventId: string }[] = [],
) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events,
    orders,
  });
}

describe('DeleteEventUseCase', () => {
  it('exclui evento próprio sem pedidos', async () => {
    const repository = createRepository([
      seedEvent({ id: 'evt-meu', title: 'Meu Show', organizerId: 'user-a' }),
    ]);
    const useCase = new DeleteEventUseCase(repository);

    const result = await useCase.execute({
      eventId: 'evt-meu',
      userId: 'user-a',
    });

    expect(result).toBe('ok');
    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(persisted.kind).toBe('not_found');
  });

  it('recusa exclusão de evento com pedidos', async () => {
    const repository = createRepository(
      [seedEvent({ id: 'evt-meu', title: 'Meu Show', organizerId: 'user-a' })],
      [{ eventId: 'evt-meu' }],
    );
    const useCase = new DeleteEventUseCase(repository);

    const result = await useCase.execute({
      eventId: 'evt-meu',
      userId: 'user-a',
    });

    expect(result).toBe('has_orders');
    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(persisted.kind).toBe('ok');
  });

  it('recusa exclusão em evento da plataforma', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-plataforma',
        title: 'Show da Plataforma',
        organizerId: null,
      }),
    ]);

    const result = await new DeleteEventUseCase(repository).execute({
      eventId: 'evt-plataforma',
      userId: 'user-a',
    });

    expect(result).toBe('forbidden');
    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-plataforma',
      userId: 'user-a',
    });
    expect(persisted.kind).toBe('ok');
  });

  it('recusa exclusão de evento alheio', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-alheio',
        title: 'Show Alheio',
        organizerId: 'user-b',
      }),
    ]);

    const result = await new DeleteEventUseCase(repository).execute({
      eventId: 'evt-alheio',
      userId: 'user-a',
    });

    expect(result).toBe('forbidden');
    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-alheio',
      userId: 'user-b',
    });
    expect(persisted.kind).toBe('ok');
  });

  it('retorna not_found para evento inexistente', async () => {
    const repository = createRepository([]);

    const result = await new DeleteEventUseCase(repository).execute({
      eventId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-a',
    });

    expect(result).toBe('not_found');
  });
});
