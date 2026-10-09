import { listEventsResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import type { EventEntity } from '../domain/event-entity.js';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository.js';

const stubEvents: EventEntity[] = [
  {
    id: '5755f491-f642-4f21-981d-c28cce72d4f4',
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
    id: 'e1b947d9-7be5-4896-bbf2-f433416b18dc',
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
    id: '37b8aba4-c962-4d58-bbbc-91e97f33abea',
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

describe('GET /events', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      eventsRepository: new InMemoryEventsRepository(stubEvents),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns all events sorted by date', async () => {
    const response = await app.inject({ method: 'GET', url: '/events' });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.title)).toEqual([
      'destaque',
      'comum',
      'em-alta',
    ]);
  });

  it('returns only featured events with view=featured', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?view=featured',
    });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.title)).toEqual(['destaque']);
  });

  it('returns only hot events with view=hot', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?view=hot',
    });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.title)).toEqual(['em-alta']);
  });

  it('rejects an invalid view with 400 and zod issues', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?view=bogus',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('invalid_query');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });
});
