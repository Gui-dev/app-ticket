import { describe, expect, it } from 'vitest';
import {
  eventSchema,
  healthResponseSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
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
