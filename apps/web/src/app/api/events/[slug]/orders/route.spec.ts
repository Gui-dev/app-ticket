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
  refundCents: null,
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

describe('proxy POST /api/events/[slug]/orders', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('repassa o meio de pagamento e o cookie de sessão', async () => {
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

  it('retorna 201 com um payload que satisfaz createOrderResponseSchema', async () => {
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

  it('retorna 400 sem chamar o upstream quando o corpo é inválido', async () => {
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

  it('retorna 400 sem chamar o upstream quando o corpo não é json', async () => {
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

  it('repassa o 401', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('repassa o 409 empty_cart', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'empty_cart' }, { status: 409 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('empty_cart');
  });

  it('repassa o 409 seat_unavailable com o seat', async () => {
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

  it('repassa o 502 payment_failed', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'payment_failed' }, { status: 502 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('payment_failed');
  });

  it('repassa o 503 order_in_progress', async () => {
    server.use(
      http.post(upstreamUrl, () =>
        HttpResponse.json({ error: 'order_in_progress' }, { status: 503 }),
      ),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('order_in_progress');
  });

  it('retorna 502 quando o payload do upstream viola o schema', async () => {
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

  it('retorna 502 quando o corpo de falha do upstream não é um objeto de erro', async () => {
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

  it('retorna 502 quando a requisição ao upstream falha', async () => {
    server.use(http.post(upstreamUrl, () => HttpResponse.error()));

    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
