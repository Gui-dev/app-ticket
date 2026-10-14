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
import { DELETE, GET, POST } from './route';

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

describe('proxy /api/auth/*', () => {
  it('encaminha GET get-session com o cookie e devolve o JSON', async () => {
    let receivedCookie: string | null = null;
    server.use(
      http.get('http://localhost:3001/api/auth/get-session', (info) => {
        receivedCookie = info.request.headers.get('cookie');
        return HttpResponse.json({
          session: { token: 'abc' },
          user: { email: 'maria@test.dev' },
        });
      }),
    );

    const res = await GET(
      new Request('http://localhost:3000/api/auth/get-session', {
        headers: { cookie: 'better-auth.session_token=abc' },
      }),
      params(['get-session']),
    );

    expect(res.status).toBe(200);
    expect(receivedCookie).toContain('better-auth.session_token=abc');
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(
      'maria@test.dev',
    );
  });

  it('encaminha POST com body JSON e propaga set-cookie', async () => {
    let receivedBody: unknown;
    server.use(
      http.post(
        'http://localhost:3001/api/auth/sign-in/email',
        async (info) => {
          receivedBody = await info.request.json();
          return HttpResponse.json(
            { token: 'tok', user: { email: 'maria@test.dev' } },
            {
              headers: {
                'set-cookie':
                  'better-auth.session_token=abc; Path=/; HttpOnly; SameSite=Lax',
              },
            },
          );
        },
      ),
    );

    const res = await POST(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'maria@test.dev', password: 'x' }),
      }),
      params(['sign-in', 'email']),
    );

    expect(res.status).toBe(200);
    expect(receivedBody).toEqual({
      email: 'maria@test.dev',
      password: 'x',
    });
    expect(res.headers.getSetCookie().join(' ')).toContain(
      'better-auth.session_token=abc',
    );
  });

  it('devolve 502 quando o upstream está fora', async () => {
    const res = await GET(
      new Request('http://localhost:3000/api/auth/get-session'),
      params(['get-session']),
    );

    expect(res.status).toBe(502);
  });

  it('DELETE também é suportado (sign-out)', async () => {
    server.use(
      http.delete('http://localhost:3001/api/auth/sign-out', () =>
        HttpResponse.json({ status: true }),
      ),
    );

    const res = await DELETE(
      new Request('http://localhost:3000/api/auth/sign-out', {
        method: 'DELETE',
      }),
      params(['sign-out']),
    );

    expect(res.status).toBe(200);
  });
});
