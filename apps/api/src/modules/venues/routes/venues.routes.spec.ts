import { venueDetailResponseSchema } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import { InMemoryVenuesRepository } from '../infra/in-memory-venues-repository.js';

const stubEvents: EventDetailEntity[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'o-fantasma-da-opera',
    title: 'O Fantasma da Ópera',
    description: 'Um musical famoso.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueSlug: 'teatro-renault',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-23T00:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: true,
    isHot: true,
    sectors: [],
    artists: [],
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    slug: 'a-hora-e-a-vez',
    title: 'A Hora é a Vez',
    description: 'Comédia dramática.',
    categorySlug: 'teatro',
    categoryName: 'Teatro',
    venueSlug: 'teatro-renault',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-12-19T00:00:00.000Z'),
    priceFromCents: 14000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
    artists: [],
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    slug: 'sertaneja-rio',
    title: 'Sertaneja Rio',
    description: 'Show sertanejo.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueSlug: 'vivo-rio',
    venueName: 'Vivo Rio',
    venueCity: 'Rio de Janeiro',
    venueState: 'RJ',
    startsAt: new Date('2026-11-29T01:00:00.000Z'),
    priceFromCents: 22000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: true,
    sectors: [],
    artists: [],
  },
];

describe('GET /venues/:slug', () => {
  it('returns the venue with their events sorted by date', async () => {
    const app = buildApp({
      venuesRepository: new InMemoryVenuesRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/venues/teatro-renault',
    });

    expect(response.statusCode).toBe(200);
    const body = venueDetailResponseSchema.parse(response.json());
    expect(body.venue).toMatchObject({
      slug: 'teatro-renault',
      name: 'Teatro Renault',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(body.venue.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'a-hora-e-a-vez',
    ]);
    await app.close();
  });

  it('returns 404 venue_not_found for unknown slug', async () => {
    const app = buildApp({
      venuesRepository: new InMemoryVenuesRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/venues/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'venue_not_found' });
    await app.close();
  });
});
