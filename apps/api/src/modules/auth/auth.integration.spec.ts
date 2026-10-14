import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../db/client.js';
import { user } from '../../db/schema.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../db/test-helpers.js';
import { createAuth, type SendEmailInput } from './auth.js';

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
});
