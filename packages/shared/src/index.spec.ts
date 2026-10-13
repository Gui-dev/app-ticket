import { describe, expect, it } from 'vitest';
import {
  artistDetailResponseSchema,
  artistDetailSchema,
  eventDetailResponseSchema,
  eventDetailSchema,
  eventSchema,
  healthResponseSchema,
  listCategoriesResponseSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  searchFiltersSchema,
  sectorSchema,
  suggestQuerySchema,
  suggestResponseSchema,
  venueDetailResponseSchema,
  venueDetailSchema,
} from './index';

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({
      status: 'ok',
    });
  });

  it('rejects a payload that is not ok', () => {
    expect(() => healthResponseSchema.parse({ status: 'down' })).toThrow();
  });
});

const validEvent = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'rock-night-sao-paulo',
  title: 'Rock Night',
  description: 'A night of rock music.',
  category: { slug: 'music', name: 'Music' },
  venue: { name: 'Audio Club', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-11-10T20:00:00.000Z',
  priceFromCents: 8000,
  imageUrl: 'https://example.com/image.jpg',
  badgeLabel: 'Popular',
};

describe('eventSchema', () => {
  it('accepts a complete valid event', () => {
    expect(eventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it('rejects an id that is not a uuid', () => {
    expect(() =>
      eventSchema.parse({ ...validEvent, id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects an event without a venue', () => {
    const { venue: _venue, ...withoutVenue } = validEvent;
    expect(() => eventSchema.parse(withoutVenue)).toThrow();
  });

  it('rejects a negative priceFromCents', () => {
    expect(() =>
      eventSchema.parse({ ...validEvent, priceFromCents: -1 }),
    ).toThrow();
  });

  it('accepts null imageUrl and badgeLabel', () => {
    const withoutImages = { ...validEvent, imageUrl: null, badgeLabel: null };
    expect(eventSchema.parse(withoutImages)).toEqual(withoutImages);
  });
});

describe('listEventsQuerySchema', () => {
  it('accepts an empty object and defaults view to all', () => {
    expect(listEventsQuerySchema.parse({})).toEqual({ view: 'all' });
  });

  it('accepts each supported view', () => {
    for (const view of ['all', 'featured', 'hot'] as const) {
      expect(listEventsQuerySchema.parse({ view })).toEqual({ view });
    }
  });

  it('rejects an unknown view', () => {
    expect(() => listEventsQuerySchema.parse({ view: 'unknown' })).toThrow();
  });

  it('keeps the search filters alongside the view', () => {
    expect(
      listEventsQuerySchema.parse({
        view: 'hot',
        q: '  fantasma ',
        category: 'shows',
        state: 'sp',
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toEqual({
      view: 'hot',
      q: 'fantasma',
      category: 'shows',
      state: 'SP',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });
});

describe('searchFiltersSchema', () => {
  it('trims the query and uppercases the state', () => {
    expect(searchFiltersSchema.parse({ q: ' teatro ', state: 'rj' })).toEqual({
      q: 'teatro',
      state: 'RJ',
    });
  });

  it('accepts an empty object (no filters)', () => {
    expect(searchFiltersSchema.parse({})).toEqual({});
  });

  it('rejects an empty query', () => {
    expect(() => searchFiltersSchema.parse({ q: '   ' })).toThrow();
  });

  it('rejects a state that is not two letters', () => {
    expect(() => searchFiltersSchema.parse({ state: 'XYZ' })).toThrow();
  });

  it('rejects a date that is not ISO yyyy-mm-dd', () => {
    expect(() => searchFiltersSchema.parse({ from: '01/11/2026' })).toThrow();
  });
});

describe('listCategoriesResponseSchema', () => {
  it('accepts a list of categories', () => {
    const payload = { categories: [{ slug: 'shows', name: 'Shows' }] };
    expect(listCategoriesResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a category without a name', () => {
    expect(() =>
      listCategoriesResponseSchema.parse({ categories: [{ slug: 'shows' }] }),
    ).toThrow();
  });
});

describe('listEventsResponseSchema', () => {
  it('accepts a response with a valid event', () => {
    expect(listEventsResponseSchema.parse({ events: [validEvent] })).toEqual({
      events: [validEvent],
    });
  });

  it('rejects a response whose event violates eventSchema', () => {
    expect(() =>
      listEventsResponseSchema.parse({
        events: [{ ...validEvent, priceFromCents: -1 }],
      }),
    ).toThrow();
  });
});

const validSector = { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 };

describe('sectorSchema', () => {
  it('accepts a valid sector', () => {
    expect(sectorSchema.parse(validSector)).toEqual(validSector);
  });

  it('rejects a negative priceFromCents', () => {
    expect(() =>
      sectorSchema.parse({ ...validSector, priceFromCents: -1 }),
    ).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => sectorSchema.parse({ ...validSector, name: '' })).toThrow();
  });
});

describe('eventDetailSchema', () => {
  it('accepts an event with sectors', () => {
    const detail = { ...validEvent, sectors: [validSector] };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('accepts an event with no sectors', () => {
    const detail = { ...validEvent, sectors: [] };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects a sector that violates the sector contract', () => {
    expect(() =>
      eventDetailSchema.parse({
        ...validEvent,
        sectors: [{ slug: 'plateia', name: 'Plateia' }],
      }),
    ).toThrow();
  });
});

describe('eventDetailResponseSchema', () => {
  it('accepts a wrapped event detail payload', () => {
    const payload = { event: { ...validEvent, sectors: [validSector] } };
    expect(eventDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('suggestQuerySchema', () => {
  it('trims and accepts a query with at least two characters', () => {
    expect(suggestQuerySchema.parse({ q: '  fanta ' })).toEqual({ q: 'fanta' });
  });

  it('rejects queries shorter than two characters', () => {
    expect(() => suggestQuerySchema.parse({ q: 'a' })).toThrow();
    expect(() => suggestQuerySchema.parse({ q: ' ' })).toThrow();
  });

  it('rejects a missing query', () => {
    expect(() => suggestQuerySchema.parse({})).toThrow();
  });
});

const validSuggestResponse = {
  events: [
    {
      slug: 'o-fantasma-da-opera',
      title: 'O Fantasma da Ópera',
      startsAt: '2026-10-22T23:00:00.000Z',
      venueName: 'Teatro Renault',
      venueCity: 'São Paulo',
      venueState: 'SP',
      priceFromCents: 12000,
    },
  ],
  locations: [{ city: 'São Paulo', state: 'SP' }],
};

describe('suggestResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(suggestResponseSchema.parse(validSuggestResponse)).toEqual(
      validSuggestResponse,
    );
  });

  it('accepts empty results', () => {
    expect(suggestResponseSchema.parse({ events: [], locations: [] })).toEqual({
      events: [],
      locations: [],
    });
  });

  it('rejects a location with a state shorter than two letters', () => {
    expect(() =>
      suggestResponseSchema.parse({
        ...validSuggestResponse,
        locations: [{ city: 'São Paulo', state: 'S' }],
      }),
    ).toThrow();
  });

  it('rejects an event item without priceFromCents', () => {
    const { priceFromCents: _omitted, ...incomplete } =
      validSuggestResponse.events[0];
    expect(() =>
      suggestResponseSchema.parse({
        ...validSuggestResponse,
        events: [incomplete],
      }),
    ).toThrow();
  });
});

describe('artistDetailSchema', () => {
  const validArtist = {
    slug: 'andrew-lloyd-webber',
    name: 'Andrew Lloyd Webber',
    events: [
      {
        id: '3d8f2f3a-8c1b-4a2e-9c3d-1b2a3c4d5e6f',
        slug: 'o-fantasma-da-opera',
        title: 'O Fantasma da Ópera',
        description: 'Um musical famoso.',
        category: { slug: 'shows', name: 'Shows' },
        venue: { name: 'Teatro Renault', city: 'São Paulo', state: 'SP' },
        startsAt: '2026-10-22T23:00:00.000Z',
        priceFromCents: 12000,
        imageUrl: null,
        badgeLabel: null,
      },
    ],
  };

  it('accepts an artist with events', () => {
    expect(artistDetailSchema.parse(validArtist)).toEqual(validArtist);
  });

  it('accepts an artist with zero events', () => {
    expect(
      artistDetailSchema.parse({ ...validArtist, events: [] }).events,
    ).toEqual([]);
  });

  it('rejects an artist without slug', () => {
    const { slug: _slug, ...withoutSlug } = validArtist;
    expect(artistDetailSchema.safeParse(withoutSlug).success).toBe(false);
  });

  it('rejects an artist with empty name', () => {
    expect(
      artistDetailSchema.safeParse({ ...validArtist, name: '' }).success,
    ).toBe(false);
  });
});

describe('artistDetailResponseSchema', () => {
  it('wraps the artist', () => {
    const payload = {
      artist: {
        slug: 'comediantes-afiados',
        name: 'Comediantes Afiados',
        events: [],
      },
    };
    expect(artistDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('venueDetailSchema', () => {
  const validVenue = {
    slug: 'teatro-renault',
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'SP',
    events: [],
  };

  it('accepts a venue with city and state', () => {
    expect(venueDetailSchema.parse(validVenue)).toEqual(validVenue);
  });

  it('rejects a venue with invalid state', () => {
    expect(
      venueDetailSchema.safeParse({ ...validVenue, state: 'São Paulo' })
        .success,
    ).toBe(false);
  });
});

describe('venueDetailResponseSchema', () => {
  it('wraps the venue', () => {
    const payload = {
      venue: {
        slug: 'vivo-rio',
        name: 'Vivo Rio',
        city: 'Rio de Janeiro',
        state: 'RJ',
        events: [],
      },
    };
    expect(venueDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});
