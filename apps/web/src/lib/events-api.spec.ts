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
import { fetchEvents } from './events-api';

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

const server = setupServer(
  http.get('http://localhost:3001/events', ({ request }) => {
    const view = new URL(request.url).searchParams.get('view');
    if (view === 'featured') {
      return HttpResponse.json({
        events: [{ ...validEventFixture, internalFlag: true }],
      });
    }
    if (view === 'hot') {
      return HttpResponse.json({ events: [] });
    }
    return HttpResponse.json({ events: [] }, { status: 404 });
  }),
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
afterEach(() => vi.restoreAllMocks());

describe('fetchEvents', () => {
  test('parses the featured events payload through the contract', async () => {
    const result = await fetchEvents('featured');
    expect(result).toEqual([validEventFixture]);
  });

  test('returns an empty list for a valid empty hot response', async () => {
    const result = await fetchEvents('hot');
    expect(result).toEqual([]);
  });

  test('logs the error and returns [] on a 404 response', async () => {
    const result = await fetchEvents('all');
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});
