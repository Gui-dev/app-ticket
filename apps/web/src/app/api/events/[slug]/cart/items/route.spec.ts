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
import { PUT } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

const item = {
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: '6',
  ticketType: 'meia',
};

function request(slug: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000/api/events/${slug}/cart/items`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

describe('PUT /api/events/[slug]/cart/items', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('rejects an invalid body without calling upstream', async () => {
    let calls = 0;
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => {
          calls += 1;
          return HttpResponse.json({});
        },
      ),
    );

    const res = await PUT(
      request('o-fantasma-da-opera', { ...item, sectorSlug: '' }),
      context,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
    expect(calls).toBe(0);
  });

  it('forwards the session cookie and the parsed body', async () => {
    let forwardedCookie = '';
    let forwardedBody: unknown;
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        async ({ request: upstream }) => {
          forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
          forwardedBody = await upstream.json();
          return HttpResponse.json({ item });
        },
      ),
    );

    const res = await PUT(
      request('o-fantasma-da-opera', item, 'better-auth.session_token=abc'),
      context,
    );
    expect(res.status).toBe(200);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
    expect(forwardedBody).toEqual(item);
    expect((await res.json()).item).toEqual(item);
  });

  it('passes 404 hold_not_found through', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.json({ error: 'hold_not_found' }, { status: 404 }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('hold_not_found');
  });

  it('returns 401 when upstream rejects the session', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(401);
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.json({ item: { sectorSlug: 'x' } }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(502);
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.error(),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when upstream responds with an error status', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
