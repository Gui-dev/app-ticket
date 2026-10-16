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
import { POST } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

const upstreamUrl =
  'http://localhost:3001/events/o-fantasma-da-opera/holds/release';

function request(): Request {
  return new Request(
    'http://localhost:3000/api/events/o-fantasma-da-opera/holds/release',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify({
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
      }),
    },
  );
}

describe('POST /api/events/[slug]/holds/release', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('forwards body and cookie and returns 200', async () => {
    let forwardedCookie = '';
    server.use(
      http.post(upstreamUrl, async ({ request: upstream }) => {
        forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
        return HttpResponse.json({ released: true });
      }),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ released: true });
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('passes 401 through', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('passes 404 hold_not_found through', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'hold_not_found' }, { status: 404 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('hold_not_found');
  });

  it('validates the body before calling upstream', async () => {
    let called = false;
    server.use(
      http.post(upstreamUrl, () => {
        called = true;
        return HttpResponse.json({ released: true });
      }),
    );
    const bad = new Request(
      'http://localhost:3000/api/events/o-fantasma-da-opera/holds/release',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sectorSlug: '', rowLabel: 'A', seatLabel: '6' }),
      },
    );
    const res = await POST(bad, context);
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('returns 502 when the upstream responds with a server error', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalledWith(
      'Release hold upstream responded with status 500',
    );
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.post(upstreamUrl, () => HttpResponse.json({ released: false })),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(http.post(upstreamUrl, () => HttpResponse.error()));
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });
});
