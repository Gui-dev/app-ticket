import { eq } from 'drizzle-orm';
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
import { buildApp } from '../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../db/client.js';
import { user } from '../../db/schema.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../db/test-helpers.js';
import {
  createAuth,
  DEV_GOOGLE_CLIENT_ID,
  type SendEmailInput,
} from './auth.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let testDb: Db;
let sentEmails: SendEmailInput[];

function collectEmail(input: SendEmailInput): Promise<void> {
  sentEmails.push(input);
  return Promise.resolve();
}

function extractUrl(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error(`Nenhuma URL encontrada no e-mail: ${text}`);
  }
  return match[0];
}

async function findUserByEmail(email: string) {
  const rows = await testDb.select().from(user).where(eq(user.email, email));
  return rows[0];
}

function fakeIdToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.fake-signature`;
}

function stubGoogleTokenEndpoint(sub: string, email: string) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'ya29-fake-access-token',
            refresh_token: 'fake-refresh-token',
            id_token: fakeIdToken({
              sub,
              email,
              email_verified: true,
              name: 'Usuário Google',
            }),
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    },
  );
}

beforeAll(async () => {
  await ensureTestDatabase();
  testDb = createDb(TEST_DATABASE_URL);
  await migrateTestDatabase(testDb);
  sentEmails = [];
  app = await buildApp({
    auth: createAuth(testDb, { sendEmail: collectEmail }),
  });
  await app.ready();
});

beforeEach(async () => {
  await resetDatabase(testDb);
  sentEmails = [];
});

afterAll(async () => {
  await app.close();
  await testDb.$client.end();
});

describe('POST /api/auth/sign-up/email', () => {
  it('cria o usuário, envia o e-mail de confirmação e não loga ainda', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Maria Silva',
        email: 'maria@test.dev',
        password: 'senha-segura-1',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { email: string } };
    expect(body.user.email).toBe('maria@test.dev');
    expect((body as { token?: unknown }).token ?? null).toBeNull();
    expect(res.headers['set-cookie']).toBeUndefined();

    const created = await findUserByEmail('maria@test.dev');
    expect(created?.emailVerified).toBe(false);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('maria@test.dev');
    expect(sentEmails[0].subject).toContain('Confirme seu e-mail');
    expect(sentEmails[0].text).toContain('/api/auth/verify-email');
  });

  it('não cria duplicata quando o e-mail já existe (anti-enumeration)', async () => {
    const payload = {
      name: 'Maria Silva',
      email: 'maria@test.dev',
      password: 'senha-segura-1',
    };
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload,
    });

    expect(second.statusCode).toBe(200);
    const rows = await testDb
      .select()
      .from(user)
      .where(eq(user.email, payload.email));
    expect(rows).toHaveLength(1);
  });
});

describe('POST /api/auth/sign-in/email', () => {
  it('retorna EMAIL_NOT_VERIFIED antes da confirmação', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Maria Silva',
        email: 'maria@test.dev',
        password: 'senha-segura-1',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'maria@test.dev', password: 'senha-segura-1' },
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('retorna 401 INVALID_EMAIL_OR_PASSWORD com senha errada', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Maria Silva',
        email: 'maria@test.dev',
        password: 'senha-segura-1',
      },
    });
    const verifyUrl = extractUrl(sentEmails[0].text);
    const parsed = new URL(verifyUrl);
    await app.inject({
      method: 'GET',
      url: `${parsed.pathname}${parsed.search}`,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'maria@test.dev', password: 'senha-errada-9' },
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { code: string }).code).toBe(
      'INVALID_EMAIL_OR_PASSWORD',
    );
  });

  it('depois da confirmação, loga e devolve a sessão no cookie', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Maria Silva',
        email: 'maria@test.dev',
        password: 'senha-segura-1',
      },
    });
    const verifyUrl = extractUrl(sentEmails[0].text);
    const parsed = new URL(verifyUrl);
    const verify = await app.inject({
      method: 'GET',
      url: `${parsed.pathname}${parsed.search}`,
    });
    expect([300, 302]).toContain(verify.statusCode);

    const verified = await findUserByEmail('maria@test.dev');
    expect(verified?.emailVerified).toBe(true);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'maria@test.dev', password: 'senha-segura-1' },
    });
    expect(login.statusCode).toBe(200);

    const rawSetCookie = login.headers['set-cookie'];
    const setCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie.join('; ')
      : String(rawSetCookie);
    expect(setCookie).toContain('better-auth.session_token');
    const cookieHeader = login.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieHeader },
    });
    expect(session.statusCode).toBe(200);
    const sessionBody = session.json() as { user?: { email: string } };
    expect(sessionBody.user?.email).toBe('maria@test.dev');
  });

  it('aceita sign-in com Origin 127.0.0.1 (trustedOrigins)', async () => {
    const email = 'origin127@test.dev';
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Origin Test', email, password: 'senha-segura-1' },
    });
    const parsed = new URL(extractUrl(sentEmails[0].text));
    await app.inject({
      method: 'GET',
      url: `${parsed.pathname}${parsed.search}`,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: 'http://127.0.0.1:3000' },
      payload: { email, password: 'senha-segura-1' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('recuperação de senha', () => {
  async function signUpAndVerify(email: string) {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Maria Silva', email, password: 'senha-segura-1' },
    });
    expect(signUp.statusCode).toBe(200);
    const parsed = new URL(extractUrl(sentEmails[0].text));
    const verify = await app.inject({
      method: 'GET',
      url: `${parsed.pathname}${parsed.search}`,
    });
    expect([300, 302]).toContain(verify.statusCode);
  }

  it('esqueci → e-mail com token → redefino → login só com a senha nova', async () => {
    const email = 'reset@test.dev';
    await signUpAndVerify(email);

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email },
    });
    expect(forgot.statusCode).toBe(200);

    const resetEmail = sentEmails.at(-1);
    expect(resetEmail?.subject).toContain('Recupere sua senha');
    expect(resetEmail?.text).toContain('/redefinir-senha?token=');
    const token = new URL(extractUrl(resetEmail?.text ?? '')).searchParams.get(
      'token',
    );
    expect(token).toBeTruthy();

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword: 'senha-nova-456' },
    });
    expect(reset.statusCode).toBe(200);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password: 'senha-segura-1' },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password: 'senha-nova-456' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('token de reset é de uso único', async () => {
    const email = 'reset2@test.dev';
    await signUpAndVerify(email);

    await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email },
    });
    const token = new URL(
      extractUrl(sentEmails.at(-1)?.text ?? ''),
    ).searchParams.get('token');

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword: 'senha-nova-456' },
    });
    expect(first.statusCode).toBe(200);

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword: 'outra-senha-789' },
    });
    expect(reuse.statusCode).toBe(400);
  });

  it('esqueci com e-mail inexistente responde 200 (anti-enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email: 'ninguem@test.dev' },
    });
    expect(res.statusCode).toBe(200);
    expect(sentEmails).toHaveLength(0);
  });
});

describe('POST /api/auth/sign-in/social (Google)', () => {
  it('devolve 200 com Location para o authorize do Google e cookie de state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google', callbackURL: '/' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; redirect: boolean };
    expect(body.redirect).toBe(true);

    const authorizeUrl = new URL(body.url);
    expect(authorizeUrl.origin).toBe('https://accounts.google.com');
    expect(authorizeUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('client_id')).toBe(
      DEV_GOOGLE_CLIENT_ID,
    );
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/google',
    );
    expect(authorizeUrl.searchParams.get('scope')).toContain('email');
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
    expect(res.headers.location).toBe(body.url);

    const stateCookie = res.cookies.find(
      (cookie) => cookie.name === 'better-auth.state',
    );
    expect(stateCookie).toBeDefined();
    expect(stateCookie?.httpOnly).toBe(true);
  });

  it('devolve 404 PROVIDER_NOT_FOUND para provider desconhecido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'não-existe', callbackURL: '/' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('callback do Google (simulado)', () => {
  async function startGoogleSignIn() {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google', callbackURL: '/' },
    });
    expect(res.statusCode).toBe(200);
    const { url } = res.json() as { url: string };
    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();
    const stateCookie = res.cookies.find(
      (cookie) => cookie.name === 'better-auth.state',
    );
    expect(stateCookie).toBeDefined();
    return {
      state: state as string,
      cookieHeader: `${stateCookie?.name}=${stateCookie?.value}`,
    };
  }

  async function hitCallback(state: string, cookieHeader: string) {
    return app.inject({
      method: 'GET',
      url: `/api/auth/callback/google?code=fake-code&state=${encodeURIComponent(state)}`,
      headers: { cookie: cookieHeader },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('primeiro callback cria usuário verificado, conta google e sessão', async () => {
    stubGoogleTokenEndpoint('sub-google-1', 'ana.google@test.dev');
    const { state, cookieHeader } = await startGoogleSignIn();

    const callback = await hitCallback(state, cookieHeader);

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/');

    const sessionCookie = callback.cookies.find(
      (cookie) => cookie.name === 'better-auth.session_token',
    );
    expect(sessionCookie).toBeDefined();

    const created = await findUserByEmail('ana.google@test.dev');
    expect(created).toBeDefined();
    expect(created?.emailVerified).toBe(true);
    expect(created?.name).toBe('Usuário Google');
  });

  it('segundo login reutiliza a mesma conta (mesmo sub)', async () => {
    stubGoogleTokenEndpoint('sub-google-1', 'ana.google@test.dev');

    const first = await startGoogleSignIn();
    await hitCallback(first.state, first.cookieHeader);

    const second = await startGoogleSignIn();
    const callback = await hitCallback(second.state, second.cookieHeader);
    expect(callback.statusCode).toBe(302);

    const rows = await testDb
      .select()
      .from(user)
      .where(eq(user.email, 'ana.google@test.dev'));
    expect(rows).toHaveLength(1);
  });

  it('converge com conta de e-mail existente de mesmo e-mail', async () => {
    const email = 'convergente@test.dev';

    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Maria Silva', email, password: 'senha-segura-1' },
    });
    const parsed = new URL(extractUrl(sentEmails[0].text));
    await app.inject({
      method: 'GET',
      url: `${parsed.pathname}${parsed.search}`,
    });

    stubGoogleTokenEndpoint('sub-google-2', email);
    const { state, cookieHeader } = await startGoogleSignIn();
    const callback = await hitCallback(state, cookieHeader);
    expect(callback.statusCode).toBe(302);

    const rows = await testDb.select().from(user).where(eq(user.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.emailVerified).toBe(true);
  });

  it('devolve redirect de erro quando o token exchange falha', async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
        return realFetch(input, init);
      },
    );

    const { state, cookieHeader } = await startGoogleSignIn();
    const callback = await hitCallback(state, cookieHeader);

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain('/api/auth/error');
    expect(await findUserByEmail('nunca-criado@test.dev')).toBeUndefined();
  });
});
