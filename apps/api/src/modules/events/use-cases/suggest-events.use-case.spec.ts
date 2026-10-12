import { describe, expect, it } from 'vitest';
import type { EventDetailEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { SuggestEventsUseCase } from './suggest-events.use-case';

const stubEvents: EventDetailEntity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'fantasma',
    title: 'O Fantasma da Ópera',
    description: 'Musical no Teatro Renault.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-22T23:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'sertaneja',
    title: 'Sertaneja Rio',
    description: 'Sertanejo no Vivo Rio.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Vivo Rio',
    venueCity: 'Rio de Janeiro',
    venueState: 'RJ',
    startsAt: new Date('2026-11-28T23:00:00.000Z'),
    priceFromCents: 22000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
  },
];

function createUseCase(): SuggestEventsUseCase {
  return new SuggestEventsUseCase(new InMemoryEventsRepository(stubEvents));
}

function makeStub(
  overrides: Partial<EventDetailEntity> &
    Pick<EventDetailEntity, 'id' | 'slug'>,
): EventDetailEntity {
  return { ...stubEvents[0], ...overrides };
}

describe('SuggestEventsUseCase', () => {
  it('returns matching events and city suggestions', async () => {
    const result = await createUseCase().execute('rio');

    expect(result.events.map((event) => event.slug)).toEqual(['sertaneja']);
    expect(result.locations).toEqual([{ city: 'Rio de Janeiro', state: 'RJ' }]);
  });

  it('matches venues by name and keeps locations only when the city matches', async () => {
    const result = await createUseCase().execute('teatro');

    expect(result.events.map((event) => event.slug)).toEqual(['fantasma']);
    expect(result.locations).toEqual([]);
  });

  it('returns empty results for an unknown term', async () => {
    expect(await createUseCase().execute('zzz')).toEqual({
      events: [],
      locations: [],
    });
  });

  it('dedupes locations by city and state and limits results to five', async () => {
    const saoPauloEvents = Array.from({ length: 6 }, (_, index) =>
      makeStub({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        slug: `sp-${index}`,
        title: `Show SP ${index}`,
        description: 'Show na casa.',
        venueName: 'Casa SP',
        venueCity: 'São Paulo',
        venueState: 'SP',
        startsAt: new Date(Date.UTC(2026, 9, 1 + index, 21)),
      }),
    );
    const campinasEvent = makeStub({
      id: '00000000-0000-4000-8000-000000000009',
      slug: 'campinas-1',
      title: 'Show SP Campinas',
      description: 'Show na casa.',
      venueName: 'Casa SP',
      venueCity: 'Campinas',
      venueState: 'SP',
      startsAt: new Date(Date.UTC(2026, 9, 7, 21)),
    });
    const useCase = new SuggestEventsUseCase(
      new InMemoryEventsRepository([...saoPauloEvents, campinasEvent]),
    );

    const result = await useCase.execute('sp');

    expect(result.events).toHaveLength(5);
    expect(result.locations).toEqual([
      { city: 'Campinas', state: 'SP' },
      { city: 'São Paulo', state: 'SP' },
    ]);
  });
});
