import { describe, expect, it } from 'vitest';

import type { InMemoryOrganizerEventSeed } from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { UpdateEventUseCase } from './update-event.use-case';

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

function createRepository(events: InMemoryOrganizerEventSeed[] = []) {
  return new InMemoryOrganizerRepository({
    categories: [
      { slug: 'shows', name: 'Shows' },
      { slug: 'comedy', name: 'Comédia' },
    ],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      { slug: 'teatro-mx', name: 'Teatro MX', city: 'Curitiba', state: 'PR' },
    ],
    events,
  });
}

const UPDATE_INPUT = {
  userId: 'user-a',
  title: 'Show Remarcado',
  description: 'Descrição nova suficientemente longa do show remarcado.',
  categorySlug: 'comedy',
  venueSlug: 'teatro-mx',
  startsAt: new Date('2026-12-20T22:00:00.000Z'),
} as const;

describe('UpdateEventUseCase', () => {
  it('edita evento próprio e preserva o slug', async () => {
    const repository = createRepository([
      seedEvent({ id: 'evt-meu', title: 'Meu Show', organizerId: 'user-a' }),
    ]);

    const result = await new UpdateEventUseCase(repository).execute({
      eventId: 'evt-meu',
      ...UPDATE_INPUT,
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.slug).toBe('meu-show');
    expect(result.event.title).toBe('Show Remarcado');
    expect(result.event.categorySlug).toBe('comedy');
    expect(result.event.venueSlug).toBe('teatro-mx');
    expect(result.event.startsAt).toEqual(new Date('2026-12-20T22:00:00.000Z'));

    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-meu',
      userId: 'user-a',
    });
    expect(persisted.kind).toBe('ok');
    if (persisted.kind !== 'ok') return;
    expect(persisted.event.title).toBe('Show Remarcado');
    expect(persisted.event.slug).toBe('meu-show');
  });

  it('retorna forbidden para evento de outro organizador e não edita', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-alheio',
        title: 'Show Alheio',
        organizerId: 'user-b',
      }),
    ]);

    const result = await new UpdateEventUseCase(repository).execute({
      eventId: 'evt-alheio',
      ...UPDATE_INPUT,
    });

    expect(result.kind).toBe('forbidden');
    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-alheio',
      userId: 'user-b',
    });
    if (persisted.kind !== 'ok') return;
    expect(persisted.event.title).toBe('Show Alheio');
  });

  it('recusa edição em evento da plataforma', async () => {
    const repository = createRepository([
      seedEvent({
        id: 'evt-plataforma',
        title: 'Show da Plataforma',
        organizerId: null,
      }),
    ]);

    const result = await new UpdateEventUseCase(repository).execute({
      eventId: 'evt-plataforma',
      ...UPDATE_INPUT,
    });

    expect(result.kind).toBe('forbidden');
    const persisted = await repository.findEventForOrganizer({
      eventId: 'evt-plataforma',
      userId: 'user-a',
    });
    if (persisted.kind !== 'ok') return;
    expect(persisted.event.title).toBe('Show da Plataforma');
  });

  it('retorna not_found para evento inexistente', async () => {
    const repository = createRepository([]);

    const result = await new UpdateEventUseCase(repository).execute({
      eventId: '11111111-1111-4111-8111-111111111111',
      ...UPDATE_INPUT,
    });

    expect(result.kind).toBe('not_found');
  });

  it('retorna category_not_found para categoria inexistente', async () => {
    const repository = createRepository([
      seedEvent({ id: 'evt-meu', title: 'Meu Show', organizerId: 'user-a' }),
    ]);

    const result = await new UpdateEventUseCase(repository).execute({
      eventId: 'evt-meu',
      ...UPDATE_INPUT,
      categorySlug: 'inexistente',
    });

    expect(result.kind).toBe('category_not_found');
  });

  it('retorna venue_not_found para local inexistente', async () => {
    const repository = createRepository([
      seedEvent({ id: 'evt-meu', title: 'Meu Show', organizerId: 'user-a' }),
    ]);

    const result = await new UpdateEventUseCase(repository).execute({
      eventId: 'evt-meu',
      ...UPDATE_INPUT,
      venueSlug: 'inexistente',
    });

    expect(result.kind).toBe('venue_not_found');
  });
});
