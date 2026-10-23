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
import { DELETE, GET, PATCH, POST } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function params(all: string[]) {
  return { params: Promise.resolve({ all }) };
}

describe('proxy /api/organizer/*', () => {
  it('encaminha GET /events com o cookie e devolve o JSON', async () => {
    let receivedCookie: string | null = null;
    server.use(
      http.get('http://localhost:3001/organizer/events', (info) => {
        receivedCookie = info.request.headers.get('cookie');
        return HttpResponse.json({
          events: [{ id: 'e1', slug: 'rock-night' }],
        });
      }),
    );

    const res = await GET(
      new Request('http://localhost:3000/api/organizer/events', {
        headers: { cookie: 'better-auth.session_token=abc' },
      }),
      params(['events']),
    );

    expect(res.status).toBe(200);
    expect(receivedCookie).toContain('better-auth.session_token=abc');
    expect(
      ((await res.json()) as { events: Array<{ slug: string }> }).events[0]
        .slug,
    ).toBe('rock-night');
  });

  it('encaminha POST com a query string e o body JSON', async () => {
    let receivedPath = '';
    let receivedBody: unknown;
    server.use(
      http.post('http://localhost:3001/organizer/events', async (info) => {
        receivedPath = `${new URL(info.request.url).pathname}?category=shows`;
        receivedBody = await info.request.json();
        return HttpResponse.json(
          { event: { slug: 'rock-night' } },
          {
            status: 201,
          },
        );
      }),
    );

    const res = await POST(
      new Request('http://localhost:3000/api/organizer/events?category=shows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Rock Night' }),
      }),
      params(['events']),
    );

    expect(res.status).toBe(201);
    expect(receivedPath).toBe('/organizer/events?category=shows');
    expect(receivedBody).toEqual({ title: 'Rock Night' });
  });

  it('encaminha PATCH e DELETE', async () => {
    const methods: string[] = [];
    server.use(
      http.patch('http://localhost:3001/organizer/events/:id', (info) => {
        methods.push(info.request.method);
        return HttpResponse.json({ ok: true });
      }),
      http.delete('http://localhost:3001/organizer/lots/:id', (info) => {
        methods.push(info.request.method);
        return HttpResponse.json({ ok: true });
      }),
    );

    const patchRes = await PATCH(
      new Request('http://localhost:3000/api/organizer/events/1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Novo título' }),
      }),
      params(['events', '1']),
    );
    expect(patchRes.status).toBe(200);

    const deleteRes = await DELETE(
      new Request('http://localhost:3000/api/organizer/lots/1', {
        method: 'DELETE',
      }),
      params(['lots', '1']),
    );
    expect(deleteRes.status).toBe(200);
    expect(methods).toEqual(['PATCH', 'DELETE']);
  });

  it('relança o erro do upstream com o status e o corpo', async () => {
    server.use(
      http.get('http://localhost:3001/organizer/events', () =>
        HttpResponse.json({ error: 'not_organizer' }, { status: 403 }),
      ),
    );

    const res = await GET(
      new Request('http://localhost:3000/api/organizer/events'),
      params(['events']),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_organizer' });
  });

  it('devolve 502 quando o upstream está fora', async () => {
    const res = await GET(
      new Request('http://localhost:3000/api/organizer/events'),
      params(['events']),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_error' });
    expect(console.error).toHaveBeenCalled();
  });
});
