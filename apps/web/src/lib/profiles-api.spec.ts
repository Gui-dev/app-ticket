import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { fetchArtistBySlug, fetchVenueBySlug } from './profiles-api';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('fetchArtistBySlug', () => {
  it('returns the artist payload parsed by zod', async () => {
    server.use(
      http.get('http://localhost:3001/artists/andrew-lloyd-webber', () =>
        HttpResponse.json({
          artist: {
            slug: 'andrew-lloyd-webber',
            name: 'Andrew Lloyd Webber',
            events: [],
          },
        }),
      ),
    );

    const result = await fetchArtistBySlug('andrew-lloyd-webber');

    expect(result).toEqual({
      slug: 'andrew-lloyd-webber',
      name: 'Andrew Lloyd Webber',
      events: [],
    });
  });

  it('returns null on 404', async () => {
    server.use(
      http.get('http://localhost:3001/artists/desconhecido', () =>
        HttpResponse.json({ error: 'artist_not_found' }, { status: 404 }),
      ),
    );

    expect(await fetchArtistBySlug('desconhecido')).toBeNull();
  });

  it('throws on unexpected status', async () => {
    server.use(
      http.get('http://localhost:3001/artists/boom', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    await expect(fetchArtistBySlug('boom')).rejects.toThrow();
  });
});

describe('fetchVenueBySlug', () => {
  it('returns the venue payload parsed by zod', async () => {
    server.use(
      http.get('http://localhost:3001/venues/teatro-renault', () =>
        HttpResponse.json({
          venue: {
            slug: 'teatro-renault',
            name: 'Teatro Renault',
            city: 'São Paulo',
            state: 'SP',
            events: [],
          },
        }),
      ),
    );

    expect(await fetchVenueBySlug('teatro-renault')).toEqual({
      slug: 'teatro-renault',
      name: 'Teatro Renault',
      city: 'São Paulo',
      state: 'SP',
      events: [],
    });
  });

  it('returns null on 404', async () => {
    server.use(
      http.get('http://localhost:3001/venues/desconhecido', () =>
        HttpResponse.json({ error: 'venue_not_found' }, { status: 404 }),
      ),
    );

    expect(await fetchVenueBySlug('desconhecido')).toBeNull();
  });
});
