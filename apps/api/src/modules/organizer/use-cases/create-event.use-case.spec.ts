import { describe, expect, it } from 'vitest';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { CreateEventUseCase } from './create-event.use-case';

const CREATE_INPUT = {
  organizerId: 'user-a',
  title: 'Festival de Inverno',
  description: 'Festival com artistas locais no centro da cidade.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: new Date('2026-12-01T20:00:00.000Z'),
} as const;

function createRepository(
  seed: {
    categories?: { slug: string; name: string }[];
    venues?: { slug: string; name: string; city: string; state: string }[];
  } = {},
) {
  return new InMemoryOrganizerRepository({
    categories: seed.categories ?? [{ slug: 'shows', name: 'Shows' }],
    venues: seed.venues ?? [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
  });
}

describe('CreateEventUseCase', () => {
  it('cria evento com slug limpo derivado do título', async () => {
    const repository = createRepository();

    const result = await new CreateEventUseCase(repository).execute({
      ...CREATE_INPUT,
      title: 'Festival de Inverno!',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.slug).toBe('festival-de-inverno');
    expect(result.event.priceFromCents).toBe(0);
    expect(result.event.organizerId).toBe('user-a');
    expect(result.event.categorySlug).toBe('shows');
    expect(result.event.venueName).toBe('Arena SP');
  });

  it('gera slug único para título repetido', async () => {
    const repository = createRepository();
    const useCase = new CreateEventUseCase(repository);

    const first = await useCase.execute(CREATE_INPUT);
    const second = await useCase.execute(CREATE_INPUT);

    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    if (first.kind !== 'ok' || second.kind !== 'ok') return;
    expect(first.event.slug).toBe('festival-de-inverno');
    expect(second.event.slug).toBe('festival-de-inverno-2');
  });

  it('retorna category_not_found quando a categoria não existe', async () => {
    const repository = createRepository({ categories: [] });

    const result = await new CreateEventUseCase(repository).execute(
      CREATE_INPUT,
    );

    expect(result.kind).toBe('category_not_found');
  });

  it('retorna venue_not_found quando o local não existe', async () => {
    const repository = createRepository({ venues: [] });

    const result = await new CreateEventUseCase(repository).execute(
      CREATE_INPUT,
    );

    expect(result.kind).toBe('venue_not_found');
  });
});
