import { describe, expect, it } from 'vitest';
import type { EventEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { ListEventsUseCase } from './list-events.use-case';

const stubEvents: EventEntity[] = [
  {
    id: 'e3',
    slug: 'em-alta',
    title: 'em-alta',
    description: 'Show com poucos ingressos restantes',
    categorySlug: 'show',
    categoryName: 'Show',
    venueName: 'Arena Central',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-06-30T20:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: 'Últimos ingressos',
    featured: false,
    isHot: true,
  },
  {
    id: 'e1',
    slug: 'destaque',
    title: 'destaque',
    description: 'Evento em destaque na home',
    categorySlug: 'teatro',
    categoryName: 'Teatro',
    venueName: 'Teatro Municipal',
    venueCity: 'Rio de Janeiro',
    venueState: 'RJ',
    startsAt: new Date('2026-06-01T20:00:00.000Z'),
    priceFromCents: 8000,
    imageUrl: null,
    badgeLabel: 'Destaque',
    featured: true,
    isHot: false,
  },
  {
    id: 'e2',
    slug: 'comum',
    title: 'comum',
    description: 'Evento sem selo especial',
    categorySlug: 'festival',
    categoryName: 'Festival',
    venueName: 'Parque Central',
    venueCity: 'Belo Horizonte',
    venueState: 'MG',
    startsAt: new Date('2026-06-15T20:00:00.000Z'),
    priceFromCents: 15000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
];

function createUseCase(events: EventEntity[] = stubEvents): ListEventsUseCase {
  return new ListEventsUseCase(new InMemoryEventsRepository(events));
}

function titlesOf(events: EventEntity[]): string[] {
  return events.map((event) => event.title);
}

describe('ListEventsUseCase', () => {
  it('returns only featured events sorted by date', async () => {
    const result = await createUseCase().execute({ view: 'featured' });

    expect(titlesOf(result)).toEqual(['destaque']);
  });

  it('returns only hot events sorted by date', async () => {
    const result = await createUseCase().execute({ view: 'hot' });

    expect(titlesOf(result)).toEqual(['em-alta']);
  });

  it('returns all events sorted by date without mutating the source array', async () => {
    const result = await createUseCase().execute({ view: 'all' });

    expect(titlesOf(result)).toEqual(['destaque', 'comum', 'em-alta']);
    expect(titlesOf(stubEvents)).toEqual(['em-alta', 'destaque', 'comum']);
  });

  it('treats an empty query as the all view', async () => {
    const useCase = createUseCase();

    const emptyQueryResult = await useCase.execute({});
    const allResult = await useCase.execute({ view: 'all' });

    expect(emptyQueryResult).toEqual(allResult);
    expect(titlesOf(emptyQueryResult)).toEqual([
      'destaque',
      'comum',
      'em-alta',
    ]);
  });
});
