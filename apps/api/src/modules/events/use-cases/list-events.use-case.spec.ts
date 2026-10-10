import { describe, expect, it, vi } from 'vitest';
import type { EventEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { ListEventsUseCase } from './list-events.use-case';

const stubEvents: EventEntity[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'sertaneja',
    title: 'Sertaneja Rio',
    description: 'Show de sertanejo às margens do Rio.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Vivo Rio',
    venueCity: 'Rio de Janeiro',
    venueState: 'RJ',
    startsAt: new Date('2026-11-28T22:00:00.000Z'),
    priceFromCents: 22000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'fantasma',
    title: 'O Fantasma da Ópera',
    description: 'Musical internacional no palco do Teatro Renault.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-22T23:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: true,
    isHot: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'standup',
    title: 'Stand-up: Noite de Verdades',
    description: 'Comédia sem filtro no Espaço Unimed.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-11-05T21:00:00.000Z'),
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: true,
  },
];

function createUseCase(events: EventEntity[] = stubEvents): ListEventsUseCase {
  return new ListEventsUseCase(new InMemoryEventsRepository(events));
}

function slugsOf(events: EventEntity[]): string[] {
  return events.map((event) => event.slug);
}

describe('ListEventsUseCase', () => {
  it('returns all events sorted by date without mutating the source array', async () => {
    const result = await createUseCase().execute({ view: 'all' });

    expect(slugsOf(result)).toEqual(['fantasma', 'standup', 'sertaneja']);
    expect(slugsOf(stubEvents)).toEqual(['sertaneja', 'fantasma', 'standup']);
  });

  it('treats an empty query as the all view', async () => {
    const result = await createUseCase().execute({});

    expect(slugsOf(result)).toEqual(['fantasma', 'standup', 'sertaneja']);
  });

  it('returns only featured events for view=featured', async () => {
    const result = await createUseCase().execute({ view: 'featured' });

    expect(slugsOf(result)).toEqual(['fantasma']);
  });

  it('filters by a text term across title, venue and city', async () => {
    expect(slugsOf(await createUseCase().execute({ q: 'teatro' }))).toEqual([
      'fantasma',
    ]);
    expect(slugsOf(await createUseCase().execute({ q: 'rio' }))).toEqual([
      'sertaneja',
    ]);
  });

  it('matches all terms (AND) and ignores missing terms', async () => {
    expect(
      slugsOf(await createUseCase().execute({ q: 'fantasma ópera' })),
    ).toEqual(['fantasma']);
    expect(
      slugsOf(await createUseCase().execute({ q: 'fantasma cyberpunk' })),
    ).toEqual([]);
  });

  it('filters by category, state and date range', async () => {
    expect(
      slugsOf(await createUseCase().execute({ category: 'shows' })),
    ).toEqual(['fantasma', 'sertaneja']);
    expect(slugsOf(await createUseCase().execute({ state: 'RJ' }))).toEqual([
      'sertaneja',
    ]);
    expect(
      slugsOf(
        await createUseCase().execute({
          from: '2026-11-01',
          to: '2026-11-30',
        }),
      ),
    ).toEqual(['standup', 'sertaneja']);
  });

  it('combines view and filters', async () => {
    const result = await createUseCase().execute({
      view: 'hot',
      category: 'comedy',
    });

    expect(slugsOf(result)).toEqual(['standup']);
  });

  it('forwards view and filters to the repository', async () => {
    const repository = new InMemoryEventsRepository(stubEvents);
    const findAll = vi.spyOn(repository, 'findAll');

    await new ListEventsUseCase(repository).execute({
      view: 'hot',
      q: 'show',
      state: 'SP',
    });

    expect(findAll).toHaveBeenCalledWith('hot', {
      q: 'show',
      state: 'SP',
    });
  });
});
