import { orderResponseSchema } from '@ticketvibe/shared';
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

const orderId = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

const upstreamUrl = `http://localhost:3001/orders/${orderId}`;

const context = { params: Promise.resolve({ id: orderId }) };

function request(cookie?: string): Request {
  return new Request(`http://localhost:3000/api/orders/${orderId}`, {
    headers: cookie ? { cookie } : {},
  });
}

const orderResponse = {
  order: {
    id: orderId,
    eventSlug: 'o-fantasma-da-opera',
    status: 'pending',
    paymentMethod: 'card',
    subtotalCents: 12000,
    serviceFeeCents: 1200,
    totalCents: 13200,
    items: [],
    createdAt: '2026-10-18T12:00:00.000Z',
    paidAt: null,
  },
};

describe('GET /api/orders/[id]', () => {
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
      http.get(upstreamUrl, ({ request: upstream }) => {
        forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
        return HttpResponse.json(orderResponse);
      }),
    );

    const res = await GET(request('better-auth.session_token=abc'), context);
    expect(res.status).toBe(200);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('returns 200 with a payload that satisfies orderResponseSchema', async () => {
    server.use(http.get(upstreamUrl, () => HttpResponse.json(orderResponse)));

    const res = await GET(request(), context);
    expect(res.status).toBe(200);
    const body = orderResponseSchema.parse(await res.json());
    expect(body.order.id).toBe(orderId);
  });

  it('passes 401 through', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await GET(request(), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('passes 404 order_not_found through', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ error: 'order_not_found' }, { status: 404 }),
      ),
    );

    const res = await GET(request(), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('order_not_found');
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ order: { id: orderId } }),
      ),
    );

    const res = await GET(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(http.get(upstreamUrl, () => HttpResponse.error()));

    const res = await GET(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
