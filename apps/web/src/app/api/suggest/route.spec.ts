import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GET } from './route';

const server = setupServer();

function url(q: string) {
  return new Request(
    `http://localhost:3000/api/suggest?q=${encodeURIComponent(q)}`,
  );
}

describe('GET /api/suggest', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('returns 400 when q is missing', async () => {
    const res = await GET(new Request('http://localhost:3000/api/suggest'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
  });

  it('proxies a valid payload through the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/suggest', () =>
        HttpResponse.json({
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
          locations: [],
        }),
      ),
    );

    const res = await GET(url('fanta'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].slug).toBe('o-fantasma-da-opera');
  });

  it('returns 502 when the upstream fails', async () => {
    server.use(
      http.get('http://localhost:3001/events/suggest', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    const res = await GET(url('fanta'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/suggest', () =>
        HttpResponse.json({ events: 'nope', locations: null }),
      ),
    );

    const res = await GET(url('fanta'));
    expect(res.status).toBe(502);
  });
});
