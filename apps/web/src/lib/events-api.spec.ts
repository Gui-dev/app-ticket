import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { fetchCategories, fetchEventBySlug, fetchEvents } from './events-api';

const validEventFixture = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'rock-night-sao-paulo',
  title: 'Rock Night',
  description: 'A night of rock music.',
  category: { slug: 'music', name: 'Music' },
  venue: { name: 'Audio Club', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-10-22T23:00:00Z',
  priceFromCents: 8000,
  imageUrl: 'https://example.com/image.jpg',
  badgeLabel: 'Popular',
};

const validEventDetailFixture = {
  ...validEventFixture,
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  sectors: [
    { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 },
    { slug: 'camarote', name: 'Camarote', priceFromCents: 25000 },
  ],
};

const server = setupServer(
  http.get('http://localhost:3001/events', ({ request }) => {
    const params = new URL(request.url).searchParams;
    if (params.get('view') === 'featured') {
      return HttpResponse.json({ events: [validEventFixture] });
    }
    if (params.get('q') === 'boom') {
      return HttpResponse.json({ events: [] }, { status: 500 });
    }
    return HttpResponse.json({ events: [] });
  }),
  http.get('http://localhost:3001/categories', () =>
    HttpResponse.json({
      categories: [
        { slug: 'shows', name: 'Shows' },
        { slug: 'comedy', name: 'Comédia' },
      ],
    }),
  ),
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
afterEach(() => vi.restoreAllMocks());

describe('fetchEvents', () => {
  test('parses the payload through the contract and reports success', async () => {
    const result = await fetchEvents({ view: 'featured' });
    expect(result).toEqual({ ok: true, events: [validEventFixture] });
  });

  test('returns an empty-but-ok result for a valid empty payload', async () => {
    const result = await fetchEvents({});
    expect(result).toEqual({ ok: true, events: [] });
  });

  test('reports a failure on a non-2xx response', async () => {
    const result = await fetchEvents({ q: 'boom' });
    expect(result.ok).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  test('sends the search filters as query parameters', async () => {
    const seen: string[] = [];
    server.use(
      http.get('http://localhost:3001/events', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ events: [] });
      }),
    );

    await fetchEvents({ view: 'hot', q: 'teatro', state: 'RJ' });

    expect(seen[0]).toContain('view=hot');
    expect(seen[0]).toContain('q=teatro');
    expect(seen[0]).toContain('state=RJ');
  });

  test('logs and reports a failure when the payload breaks the contract', async () => {
    server.use(
      http.get('http://localhost:3001/events', () =>
        HttpResponse.json({ events: 'nope' }),
      ),
    );

    const result = await fetchEvents({});

    expect(result.ok).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  test('omits the default view and empty filters from the query string', async () => {
    const seen: string[] = [];
    server.use(
      http.get('http://localhost:3001/events', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ events: [] });
      }),
    );

    await fetchEvents({ view: 'all', q: '', category: undefined });

    expect(seen[0]).not.toContain('view=');
    expect(seen[0]).not.toContain('q=');
    expect(seen[0]).not.toContain('category=');
  });
});

describe('fetchEventBySlug', () => {
  test('parses the detail payload through the contract', async () => {
    server.use(
      http.get('http://localhost:3001/events/:slug', () =>
        HttpResponse.json({ event: validEventDetailFixture }),
      ),
    );

    const result = await fetchEventBySlug('o-fantasma-da-opera');

    expect(result).not.toBeNull();
    expect(result?.slug).toBe('o-fantasma-da-opera');
    expect(result?.sectors[0].priceFromCents).toBe(12000);
    expect(result?.sectors).toHaveLength(2);
  });

  test('returns null without logging when the event does not exist', async () => {
    server.use(
      http.get('http://localhost:3001/events/:slug', () =>
        HttpResponse.json({ error: 'event_not_found' }, { status: 404 }),
      ),
    );

    const result = await fetchEventBySlug('desconhecido');

    expect(result).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('propagates the failure on a server error', async () => {
    server.use(
      http.get('http://localhost:3001/events/:slug', () =>
        HttpResponse.json({ error: 'internal' }, { status: 500 }),
      ),
    );

    await expect(fetchEventBySlug('algo')).rejects.toThrow(
      'Unexpected status 500',
    );
  });

  test('logs and rethrows when the payload breaks the contract', async () => {
    server.use(
      http.get('http://localhost:3001/events/:slug', () =>
        HttpResponse.json({
          event: { ...validEventDetailFixture, priceFromCents: '12000' },
        }),
      ),
    );

    await expect(fetchEventBySlug('o-fantasma-da-opera')).rejects.toThrow(
      'priceFromCents',
    );
    expect(console.error).toHaveBeenCalled();
  });
});

describe('fetchCategories', () => {
  test('parses the categories payload through the contract', async () => {
    const result = await fetchCategories();
    expect(result).toEqual({
      ok: true,
      categories: [
        { slug: 'shows', name: 'Shows' },
        { slug: 'comedy', name: 'Comédia' },
      ],
    });
  });
});
