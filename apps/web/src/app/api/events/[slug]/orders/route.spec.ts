import { createOrderResponseSchema } from '@ticketvibe/shared';
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

const upstreamUrl = 'http://localhost:3001/events/o-fantasma-da-opera/orders';

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

const order = {
  id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
  eventSlug: 'o-fantasma-da-opera',
  status: 'pending',
  paymentMethod: 'card',
  subtotalCents: 12000,
  serviceFeeCents: 1200,
  totalCents: 13200,
  items: [],
  createdAt: '2026-10-18T12:00:00.000Z',
  paidAt: null,
};

const createdOrder = {
  order,
  payment: {
    provider: 'stripe',
    providerRef: 'pi_123',
    clientSecret: 'pi_123_secret',
  },
};

function request(body: unknown = { paymentMethod: 'card' }): Request {
  return new Request(
    'http://localhost:3000/api/events/o-fantasma-da-opera/orders',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    },
  );
}

describe('POST /api/events/[slug]/orders', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('forwards the payment method and the session cookie', async () => {
    let forwardedCookie = '';
    let forwardedBody: unknown;
    server.use(
      http.post(upstreamUrl, async ({ request: upstream }) => {
        forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
        forwardedBody = await upstream.json();
        return HttpResponse.json(createdOrder, { status: 201 });
      }),
    );

    const res = await POST(request({ paymentMethod: 'boleto' }), context);
    expect(res.status).toBe(201);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
    expect(forwardedBody).toEqual({ paymentMethod: 'boleto' });
  });

  it('returns 201 with a payload that satisfies createOrderResponseSchema', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json(createdOrder, { status: 201 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(201);
    const body = createOrderResponseSchema.parse(await res.json());
    expect(body.payment.providerRef).toBe('pi_123');
  });

  it('returns 400 without calling upstream when the body is invalid', async () => {
    let called = false;
    server.use(
      http.post(upstreamUrl, () => {
        called = true;
        return HttpResponse.json(createdOrder, { status: 201 });
      }),
    );

    const res = await POST(request({ paymentMethod: 'pix' }), context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_body');
    expect(body.issues).toBeInstanceOf(Array);
    expect(called).toBe(false);
  });

  it('returns 400 without calling upstream when the body is not json', async () => {
    let called = false;
    server.use(
      http.post(upstreamUrl, () => {
        called = true;
        return HttpResponse.json(createdOrder, { status: 201 });
      }),
    );

    const res = await POST(
      new Request(
        'http://localhost:3000/api/events/o-fantasma-da-opera/orders',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not-json',
        },
      ),
      context,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
    expect(called).toBe(false);
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

  it('passes 409 empty_cart through', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'empty_cart' }, { status: 409 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('empty_cart');
  });

  it('passes 409 seat_unavailable through with the seat', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json(
          { error: 'seat_unavailable', seat: 'plateia A 6' },
          { status: 409 },
        ),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'seat_unavailable',
      seat: 'plateia A 6',
    });
  });

  it('passes 502 payment_failed through', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'payment_failed' }, { status: 502 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('payment_failed');
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ order: { id: 'nope' } }, { status: 201 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream failure body is not an error object', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ boom: true }, { status: 500 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(http.post(upstreamUrl, () => HttpResponse.error()));

    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
