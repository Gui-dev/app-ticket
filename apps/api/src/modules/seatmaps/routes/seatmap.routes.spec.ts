import {
  bestSeatResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'available' },
            { label: '2', status: 'available' },
            { label: '3', status: 'available' },
          ],
        },
      ],
    },
    {
      slug: 'balcao',
      name: 'Balcão',
      priceFromCents: 19000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'available' },
            { label: '2', status: 'occupied' },
            { label: '3', status: 'available' },
          ],
        },
      ],
    },
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 15000,
      rows: [],
    },
  ],
};

describe('GET /events/:slug/seatmap', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp({ seatmapRepository: new InMemorySeatmapRepository([gig]) });
    return app.ready();
  });

  afterAll(() => app.close());

  it('returns the seatmap excluding sectors without rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/seatmap',
    });

    expect(response.statusCode).toBe(200);
    const body = seatmapResponseSchema.parse(response.json());
    expect(body.seatmap.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);
  });

  it('returns 404 event_not_found for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/seatmap',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});

describe('GET /events/:slug/best-seat', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp({ seatmapRepository: new InMemorySeatmapRepository([gig]) });
    return app.ready();
  });

  afterAll(() => app.close());

  it('returns the most central free seat of the first row', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body).toEqual({
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '2',
        priceFromCents: 12000,
      },
    });
  });

  it('skips the occupied seat near the center', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=balcao',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body.seat.seatLabel).toBe('1');
  });

  it('returns 404 no_available_seat for a sector without rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=pista',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'no_available_seat' });
  });

  it('returns 400 invalid_query when the sector param is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_query');
  });

  it('returns 404 sector_not_found for an unknown sector', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=camarote',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'sector_not_found' });
  });

  it('returns 404 event_not_found for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});
