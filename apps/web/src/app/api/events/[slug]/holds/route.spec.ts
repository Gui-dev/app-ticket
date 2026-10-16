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

const holdPayload = {
  hold: {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
    expiresAt: '2026-10-16T12:10:00.000Z',
  },
};

function request(): Request {
  return new Request(
    'http://localhost:3000/api/events/o-fantasma-da-opera/holds',
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

describe('POST /api/events/[slug]/holds', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('forwards body and cookie and returns 201', async () => {
    let forwardedCookie = '';
    server.use(
      http.post(
        'http://localhost:3001/events/o-fantasma-da-opera/holds',
        async ({ request: upstream }) => {
          forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
          return HttpResponse.json(holdPayload, { status: 201 });
        },
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(holdPayload);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('passes 401 through', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('passes 409 seat_held through', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ error: 'seat_held' }, { status: 409 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('seat_held');
  });

  it('validates the body before calling upstream', async () => {
    let called = false;
    server.use(
      http.post(
        'http://localhost:3001/events/o-fantasma-da-opera/holds',
        () => {
          called = true;
          return HttpResponse.json(holdPayload, { status: 201 });
        },
      ),
    );
    const bad = new Request(
      'http://localhost:3000/api/events/o-fantasma-da-opera/holds',
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
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalledWith(
      'Hold upstream responded with status 500',
    );
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ hold: { sectorSlug: 'plateia' } }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.error(),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });
});
