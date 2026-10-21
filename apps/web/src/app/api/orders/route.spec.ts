import { orderListResponseSchema } from '@ticketvibe/shared';
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

const upstreamUrl = 'http://localhost:3001/orders';

function request(cookie?: string): Request {
  return new Request('http://localhost:3000/api/orders', {
    headers: cookie ? { cookie } : {},
  });
}

const orderListResponse = {
  orders: [
    {
      id: orderId,
      eventSlug: 'o-fantasma-da-opera',
      eventTitle: 'O Fantasma da Ópera',
      eventStartsAt: '2026-11-20T23:00:00.000Z',
      status: 'paid',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      itemCount: 1,
      createdAt: '2026-10-18T12:00:00.000Z',
    },
  ],
};

describe('proxy GET /api/orders', () => {
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
        return HttpResponse.json(orderListResponse);
      }),
    );

    const res = await GET(request('better-auth.session_token=abc'));
    expect(res.status).toBe(200);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('retorna 200 com um payload que satisfaz orderListResponseSchema', async () => {
    server.use(
      http.get(upstreamUrl, () => HttpResponse.json(orderListResponse)),
    );

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = orderListResponseSchema.parse(await res.json());
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].id).toBe(orderId);
  });

  it('repassa o 401', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await GET(request());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('retorna 502 quando o payload do upstream viola o schema', async () => {
    server.use(
      http.get(upstreamUrl, () =>
        HttpResponse.json({ orders: [{ id: orderId }] }),
      ),
    );

    const res = await GET(request());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('retorna 502 quando a requisição ao upstream falha', async () => {
    server.use(http.get(upstreamUrl, () => HttpResponse.error()));

    const res = await GET(request());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });
});
