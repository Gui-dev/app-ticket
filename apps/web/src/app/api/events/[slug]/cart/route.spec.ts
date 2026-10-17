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

function request(slug: string, cookie?: string) {
  return new Request(`http://localhost:3000/api/events/${slug}/cart`, {
    headers: cookie ? { cookie } : {},
  });
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

const emptyCart = {
  eventSlug: 'o-fantasma-da-opera',
  items: [],
  expiresAt: null,
  totalCents: 0,
};

describe('GET /api/events/[slug]/cart', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('forwards the session cookie', async () => {
    let forwardedCookie = '';
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/cart',
        ({ request: upstream }) => {
          forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
          return HttpResponse.json(emptyCart);
        },
      ),
    );

    const res = await GET(
      request('o-fantasma-da-opera', 'better-auth.session_token=abc'),
      context,
    );
    expect(res.status).toBe(200);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('passes a valid cart through the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json(emptyCart),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(200);
    expect((await res.json()).eventSlug).toBe('o-fantasma-da-opera');
  });

  it('returns 404 when the event does not exist', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json({ error: 'event_not_found' }, { status: 404 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('event_not_found');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.error(),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json({ eventSlug: 'x', items: 'nope' }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
  });

  it('returns 401 when upstream rejects the session', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns 502 when upstream responds with an error status', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
