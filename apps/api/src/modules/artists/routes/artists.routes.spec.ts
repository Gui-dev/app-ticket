import { artistDetailResponseSchema } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import { InMemoryArtistsRepository } from '../infra/in-memory-artists-repository.js';

const stubEvents: EventDetailEntity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'standup-noite-de-verdades',
    title: 'Stand-up: Noite de Verdades',
    description: 'Uma noite de piadas.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueSlug: 'espaco-unimed',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-11-06T00:00:00.000Z'),
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
    artists: [{ slug: 'comediantes-afiados', name: 'Comediantes Afiados' }],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'melhor-de-standup-grand-finale',
    title: 'Melhor de Stand-up: Grand Finale',
    description: 'A grande final.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueSlug: 'espaco-unimed',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-12-13T00:00:00.000Z'),
    priceFromCents: 11000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
    artists: [{ slug: 'comediantes-afiados', name: 'Comediantes Afiados' }],
  },
];

describe('GET /artists/:slug', () => {
  it('returns the artist with their events sorted by date', async () => {
    const app = buildApp({
      artistsRepository: new InMemoryArtistsRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/artists/comediantes-afiados',
    });

    expect(response.statusCode).toBe(200);
    const body = artistDetailResponseSchema.parse(response.json());
    expect(body.artist.slug).toBe('comediantes-afiados');
    expect(body.artist.name).toBe('Comediantes Afiados');
    expect(body.artist.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'melhor-de-standup-grand-finale',
    ]);
    await app.close();
  });

  it('returns 404 artist_not_found for unknown slug', async () => {
    const app = buildApp({
      artistsRepository: new InMemoryArtistsRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/artists/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'artist_not_found' });
    await app.close();
  });
});
