import { orderDetailResponseSchema } from '@ticketvibe/shared';
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
  event: {
    slug: 'o-fantasma-da-opera',
    title: 'O Fantasma da Ópera',
    startsAt: '2026-11-20T23:00:00.000Z',
  },
};

describe('proxy GET /api/orders/[id]', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('repassa o cookie de sessão', async () => {
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

  it('retorna 200 com um payload que satisfaz orderDetailResponseSchema', async () => {
    server.use(http.get(upstreamUrl, () => HttpResponse.json(orderResponse)));

    const res = await GET(request(), context);
    expect(res.status).toBe(200);
    const body = orderDetailResponseSchema.parse(await res.json());
    expect(body.order.id).toBe(orderId);
    expect(body.event?.title).toBe('O Fantasma da Ópera');
  });

  it('repassa o 401', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await GET(request(), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('repassa o 404 order_not_found', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ error: 'order_not_found' }, { status: 404 }),
      ),
    );

    const res = await GET(request(), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('order_not_found');
  });

  it('retorna 502 quando o payload do upstream viola o schema', async () => {
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

  it('retorna 502 quando a requisição ao upstream falha', async () => {
    server.use(http.get(upstreamUrl, () => HttpResponse.error()));

    const res = await GET(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
