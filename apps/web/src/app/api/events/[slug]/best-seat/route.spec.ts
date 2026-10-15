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
import { GET } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

function request(slug: string, sector?: string) {
  const query = sector ? `?sector=${encodeURIComponent(sector)}` : '';
  return new Request(
    `http://localhost:3000/api/events/${slug}/best-seat${query}`,
  );
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

describe('GET /api/events/[slug]/best-seat', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('returns 400 when the sector param is missing', async () => {
    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
  });

  it('passes a valid best seat through the schema', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () =>
          HttpResponse.json({
            seat: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '6',
              priceFromCents: 12000,
            },
          }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera', 'plateia'), context);
    expect(res.status).toBe(200);
    expect((await res.json()).seat.seatLabel).toBe('6');
  });

  it('passes the 404 error body through', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () =>
          HttpResponse.json({ error: 'no_available_seat' }, { status: 404 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera', 'plateia'), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('no_available_seat');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () => HttpResponse.error(),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera', 'plateia'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });

  it('returns 502 when the upstream 404 body is not json', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () => new Response('<html>not found</html>', { status: 404 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera', 'plateia'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });
});
