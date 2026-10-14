# Ticket 08 — Conta: e-mail e senha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro com e-mail+senha via Better Auth sobre o Postgres, confirmação de e-mail pelo Mailpit, login/logout/recuperação de senha e sessão reconhecida no cabeçalho.

**Architecture:** A instância Better Auth (`drizzleAdapter` sobre o pool existente) vive no `apps/api` e é montada no Fastify em `/api/auth/*`. O browser conversa com ela por um proxy catch-all no Next (`/api/auth/[...all]`) — cookies same-origin, zero CORS. O Header ganha um componente cliente `AuthMenu` que reflete a sessão (`useSession`); e-mails de confirmação/recuperação saem por nodemailer para o SMTP do Mailpit (`127.0.0.1:1025`, UI em `:8025`).

**Tech Stack:** Better Auth 1.7.7 (drizzle adapter + react client) · Fastify 5 · Drizzle ORM (Postgres) · nodemailer · Next.js 16 App Router · Vitest (unit + MSW + integração Postgres) · Playwright E2E + API do Mailpit.

**Repo conventions (do not violate):**
- Commits em inglês, Conventional Commits, imperativo, sem ponto final. Um commit por task. **Nunca push** (decisão do usuário: manter local).
- pt-BR para UI, testes e docs; código/identificadores em inglês.
- Comandos via `pnpm --filter @ticketvibe/api|web ...`; raiz só para `pnpm lint|typecheck|test|infra:up|build`.
- Migrações sempre via `pnpm --filter @ticketvibe/api db:generate` — **nunca editar SQL de migração já gerada**.
- TDD por task: escrever teste falhante → ver falhar → implementar → ver passar → commit.
- `pnpm infra:up` antes de testes de integração/E2E. **Nunca** `pnpm infra:down`.

---

## Contexto do codebase (para quem chega agora)

- **`apps/api` é Fastify 5** (não Express). `buildApp(options)` em `apps/api/src/app.ts` usa **inyeção de dependência** nos options (`eventsRepository?`, `categoriesRepository?`, ...) e DB lazy (`getDefaultDb()`); `onClose` encerra o pool default. Rotas registradas via `register*Routes(app, repo)`. Erros são inline por rota: `reply.code(404).send({ error: 'event_not_found' })`. **Não existe** handler global de erros e **não existe nenhuma rota POST** hoje — auth introduz a primeira.
- **DB:** `apps/api/src/db/client.ts` exporta `createDb(url?)` (pg.Pool + drizzle com `import * as schema`), `DEFAULT_DATABASE_URL` (`/ticketvibe`) e `TEST_DATABASE_URL` (`/ticketvibe_test`). Schema único em `apps/api/src/db/schema.ts` (uuid PKs, `timestamp(..., { withTimezone: true })`). Migrações em `apps/api/drizzle/` — atual `0003_polite_the_initiative.sql`; a próxima gerada será `0004_*`.
- **Testes de integração** (`*.integration.spec.ts`): `ensureTestDatabase()` + `createDb(TEST_DATABASE_URL)` + `migrateTestDatabase` + `buildApp({...repos de drizzle no testDb})` + `app.ready()`; `beforeEach` → `resetDatabase` (+ `seedFixtures` quando o teste precisa de eventos); requests via `app.inject`. `vitest.config.ts` da API tem `fileParallelism: false` (specs compartilham o mesmo DB — **não remover**).
- **`resetDatabase`** (`apps/api/src/db/test-helpers.ts:60`) faz TRUNCATE de 6 tabelas — **a lista deve crescer** com as tabelas de auth.
- **`seed-fixtures.ts`** deleta apenas as tabelas de eventos (`sectors, event_artists, events, artists, venues, categories`) — **não mexer** (usuários de auth não são seed).
- **Web:** Next 16 App Router, React 19, `cacheComponents: true`, **sem** `middleware.ts`, **sem** server actions. Cada página importa `<Header />` individualmente (não há slot no root layout). `header.tsx` é server component e hoje renderiza `<Button variant="default"><User/>Entrar</Button>` **sem href** (linha ~49-52). `Button` (shadcn) suporta `asChild` via Radix `Slot`. `Input` em `src/components/ui/input.tsx`.
- **Padrão de proxy existente:** `apps/web/src/app/api/suggest/route.ts` (GET, `API_URL ?? 'http://localhost:3001'`, trata erro upstream → 502). Spec dele (`route.spec.ts`) chama o handler `GET(new Request(...))` diretamente com MSW.
- **Fetchers server-only** (`src/lib/events-api.ts`, `profiles-api.ts`): `import 'server-only'`, `cache: 'no-store'`, 404→null.
- **MSW nos specs web:** `setupServer` local, `onUnhandledRequest: 'error'` (componentes) ou `'bypass'` (fetchers), `vi.mock('next/navigation')` com `vi.hoisted` (ver `header-search.spec.tsx`). jsdom + `@testing-library/react`.
- **Playwright:** `tests/e2e/`, `workers: 1`, `baseURL: http://127.0.0.1:3000`, `globalSetup` roda `db:seed`, `webServer` sobe api (:3001) e web (:3000). **Playwright navega por `127.0.0.1`; e-mails de auth apontarão para `http://localhost:3000` (ver decisão D4) — o E2E de auth usa URLs absolutas de `localhost`.**
- **Mailpit:** `compose.yaml` já roda `ticketvibe-mailpit` — SMTP `127.0.0.1:1025`, API/UI `127.0.0.1:8025` (`GET /api/v1/messages`, `GET /api/v1/message/:id` com campo `Text`, `DELETE /api/v1/messages`).
- **Sem `.env*` no repo.** Vars lidas hoje: `PORT`, `DATABASE_URL`, `API_URL`, `REDIS_URL`. Auth adiciona leitura de `BETTER_AUTH_URL`, `SMTP_HOST`, `SMTP_PORT`, `BETTER_AUTH_SECRET` (todos com default local — nenhum exige criar arquivo de env).
- **Não existem** `GLOSSARY.md` nem `docs/adr/` — seguir silenciosamente (decisão anterior).
- Gates: `pnpm lint` (biome), `pnpm typecheck` (turbo 5), `pnpm test` (shared 43 / api 71 / web 110 hoje), `pnpm --filter @ticketvibe/web exec playwright test` (16 hoje), `pnpm build`, `pnpm --filter @ticketvibe/api exec drizzle-kit check`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/src/modules/auth/email.ts` | Tipo `SendEmailFn` + `sendEmail` nodemailer (SMTP Mailpit) |
| `apps/api/src/modules/auth/email.spec.ts` | Unit: transporter e payload (nodemailer mockado) |
| `apps/api/src/modules/auth/auth.ts` | `createAuth(db, { sendEmail })` — instância Better Auth |
| `apps/api/src/modules/auth/routes/auth.routes.ts` | `registerAuthRoutes(app, auth)` — catch-all Fastify `/api/auth/*` |
| `apps/api/src/modules/auth/auth.integration.spec.ts` | Fluxos completos em Postgres real via `app.inject` |
| `apps/api/src/db/schema.ts` | + tabelas `user`, `session`, `account`, `verification` |
| `apps/api/drizzle/0004_*.sql` | Migração gerada (drizzle-kit) |
| `apps/api/src/db/test-helpers.ts` | `resetDatabase` TRUNCATE + tabelas de auth |
| `apps/api/src/app.ts` | + `options.auth` + `registerAuthRoutes` |
| `apps/web/src/lib/auth-client.ts` | `createAuthClient()` (better-auth/react, base same-origin) |
| `apps/web/src/app/api/auth/[...all]/route.ts` | Proxy browser→API (métodos + cookie + set-cookie) |
| `apps/web/src/app/api/auth/[...all]/route.spec.ts` | Unit do proxy (MSW no upstream :3001) |
| `apps/web/src/components/auth-menu.tsx` (+`.spec.tsx`) | Estado de sessão no Header (useSession, Entrar/Sair) |
| `apps/web/src/components/login-form.tsx` (+`.spec.tsx`) | Formulário de login (client) |
| `apps/web/src/components/signup-form.tsx` (+`.spec.tsx`) | Formulário de cadastro (client) |
| `apps/web/src/components/recover-password-form.tsx` (+`.spec.tsx`) | Esqueci a senha (client) |
| `apps/web/src/components/reset-password-form.tsx` (+`.spec.tsx`) | Redefinir com token (client) |
| `apps/web/src/app/entrar/page.tsx` | Página de login |
| `apps/web/src/app/cadastro/page.tsx` | Página de cadastro |
| `apps/web/src/app/recuperar-senha/page.tsx` | Página esqueci a senha |
| `apps/web/src/app/redefinir-senha/page.tsx` | Página redefinir (lê `?token=`) |
| `apps/web/src/components/header.tsx` | Botão Entrar → `<AuthMenu />` |
| `apps/web/tests/e2e/helpers/mailpit.ts` | Polling/caixa do Mailpit para E2E |
| `apps/web/tests/e2e/auth.spec.ts` | E2E: cadastro → confirmação via Mailpit → login → logout |
| `README.md` | Seção "Autenticação local" (comando Mailpit documentado) |

## Decisões travadas (não rediscutir)

- **D1 — Better Auth vive no `apps/api`.** Instância via factory `createAuth(db, { sendEmail })` (DI de DB e de e-mail), montada no Fastify em `/api/auth/*` (GET/POST/PUT/PATCH/DELETE). Web não fala com o banco.
- **D2 — Proxy same-origin no web.** `apps/web/src/app/api/auth/[...all]/route.ts` encaminha para `${API_URL}/api/auth/*`, repassa `cookie`/`content-type`, propaga status + **todos** os `set-cookie` (via `getSetCookie()`), `redirect: 'manual'`. Sem CORS, sem cookie cross-origin.
- **D3 — `authClient = createAuthClient()`** (`better-auth/react`) sem `baseURL` → resolve para o origin do browser + `/api/auth` (o proxy).
- **D4 — `baseURL` da instância = `process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'`.** Todos os links nos e-mails (verificação) apontam para a origem `localhost:3000` (proxy). E2E de auth usa URLs absolutas `http://localhost:3000/...` para o cookie domínio bater com o link.
- **D5 — `requireEmailVerification: true`, `minPasswordLength: 8`.** Sign-up com e-mail já existente **não vaza erro** (resposta de sucesso — Better Auth anti-enumeration). Login bloqueado com `EMAIL_NOT_VERIFIED` antes da confirmação.
- **D6 — E-mail de recuperação aponta para a NOSSA página** `${BETTER_AUTH_URL}/redefinir-senha?token=...` (URL construída dentro do callback `sendResetPassword`, ignorando a URL interna do Better Auth). E-mail de confirmação usa a `url` que o Better Auth forjou (`.../api/auth/verify-email?token=...&callbackURL=/`).
- **D7 — Header reconhece sessão via cliente.** `AuthMenu` (`'use client'`) usa `authClient.useSession()`; sem `cookies()` em server components (zero risco com `cacheComponents`). `router.refresh()` após `signOut`.
- **D8 — Testes de integração capturam o link do e-mail** via `sendEmail` injetado (coletor no teste) — não consulta tabela `verification` para o token de verificação (token de verificação é assinado/HMAC, não é armazenado; o de reset **é** armazenado, mas o coletor é o caminho único e determinístico para ambos).
- **D9 — Seed não toca tabelas de auth.** E-mails no E2E sempre únicos (`e2e-${Date.now()}@ticketvibe.test`).
- **D10 — Nenhum schema novo em `packages/shared`** (YAGNI: erros de auth são mapeados no client; sessão vem do Better Auth).

---

### Task 1: API — dependências + envio de e-mail (nodemailer)

**Files:**
- Modify: `apps/api/package.json` (via pnpm add)
- Create: `apps/api/src/modules/auth/email.ts`
- Create: `apps/api/src/modules/auth/email.spec.ts`

- [ ] **Step 1: Instalar dependências**

```bash
pnpm --filter @ticketvibe/api add better-auth nodemailer
pnpm --filter @ticketvibe/api add -D @types/nodemailer
```

Expected: `better-auth@^1.7.7` e `nodemailer@^10.1.0` no `package.json` da API. Commit isso junto no final da task.

- [ ] **Step 2: Escrever o teste falhante**

`apps/api/src/modules/auth/email.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(async () => ({ messageId: 'test' }));
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

const { sendEmail } = await import('./email.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendEmail', () => {
  it('cria o transporter apontando para o Mailpit por default', async () => {
    await sendEmail({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
    });
  });

  it('envia o e-mail com from, to, subject e text', async () => {
    await sendEmail({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'TICKETVIBE <no-reply@ticketvibe.local>',
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });
  });
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/email.spec.ts`
Expected: FAIL — `Cannot find module './email.js'`.

- [ ] **Step 4: Implementar**

`apps/api/src/modules/auth/email.ts`:

```ts
import nodemailer from 'nodemailer';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmailFn = (input: SendEmailInput) => Promise<void>;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? '127.0.0.1',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
});

export const sendEmail: SendEmailFn = async ({ to, subject, text }) => {
  await transporter.sendMail({
    from: 'TICKETVIBE <no-reply@ticketvibe.local>',
    to,
    subject,
    text,
  });
};
```

- [ ] **Step 5: Rodar para ver passar + gates rápidos**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/email.spec.ts
pnpm --filter @ticketvibe/api exec tsc --noEmit
```
Expected: 2/2 PASS e tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/auth pnpm-lock.yaml
git commit -m "feat(api): add email sender backed by nodemailer"
```

---

### Task 2: API — tabelas de auth, migração e resetDatabase

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0004_*.sql` (gerada)
- Modify: `apps/api/src/db/test-helpers.ts:60`

- [ ] **Step 1: Adicionar as tabelas ao schema**

Em `apps/api/src/db/schema.ts`, após as tabelas existentes (mantendo o estilo do arquivo: `timestamp('x', { withTimezone: true })`), adicione **exatamente** (nomes de tabela e colunas são exigidos pelo adapter Better Auth):

```ts
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
```

`text` e `boolean` já estão importados no topo do arquivo; `index` também.

- [ ] **Step 2: Gerar e aplicar a migração**

```bash
pnpm --filter @ticketvibe/api db:generate
pnpm --filter @ticketvibe/api db:migrate
```

Expected: cria `apps/api/drizzle/0004_*.sql` com `CREATE TABLE "user"|"session"|"account"|"verification"` + índices + FKs `ON DELETE CASCADE`; `db:migrate` aplica no DB dev (`ticketvibe`) sem erro. `git status apps/api/drizzle` mostra só a 0004 nova (nunca editar).

- [ ] **Step 3: Atualizar o resetDatabase**

`apps/api/src/db/test-helpers.ts:60` — a `user` é palavra reservada; aspas obrigatórias:

```ts
    sql`TRUNCATE TABLE "user", session, account, verification, event_artists, sectors, events, artists, venues, categories RESTART IDENTITY CASCADE`,
```

- [ ] **Step 4: Verificar migração no banco de teste**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/api exec vitest run src/db
```
Expected: PASS (specs existentes de db continuam verdes — o migrateTestDatabase aplica a 0004 automaticamente lendo a pasta `drizzle/`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/test-helpers.ts apps/api/drizzle
git commit -m "feat(api): add better-auth tables with migration"
```

---

### Task 3: API — instância Better Auth, montagem Fastify e fluxos de cadastro/confirmação/login

**Files:**
- Create: `apps/api/src/modules/auth/auth.ts`
- Create: `apps/api/src/modules/auth/routes/auth.routes.ts`
- Create: `apps/api/src/modules/auth/auth.integration.spec.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever o teste de integração falhante (parte 1)

`apps/api/src/modules/auth/auth.integration.spec.ts`:

```ts
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
    const rows = await testDb.select().from(user).where(eq(user.email, payload.email));
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
    const cookieHeader = setCookie
      .split(',')
      .map((part) => part.split(';')[0])
      .filter((part) => part.includes('='))
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
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts`
Expected: FAIL — `Cannot find module './auth.js'` (ou buildApp sem option `auth`).

- [ ] **Step 3: Implementar**

`apps/api/src/modules/auth/auth.ts`:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import * as schema from '../../db/schema.js';
import type { Db } from '../../db/client.js';
import type { SendEmailFn } from './email.js';

export type { SendEmailInput } from './email.js';

const DEFAULT_WEB_URL = 'http://localhost:3000';

function webUrl(): string {
  return process.env.BETTER_AUTH_URL ?? DEFAULT_WEB_URL;
}

export function createAuth(db: Db, deps: { sendEmail: SendEmailFn }) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    baseURL: webUrl(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, token }) => {
        const url = `${webUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
        await deps.sendEmail({
          to: user.email,
          subject: 'Recupere sua senha do TICKETVIBE',
          text: `Olá ${user.name}, redefina sua senha acessando: ${url}`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await deps.sendEmail({
          to: user.email,
          subject: 'Confirme seu e-mail do TICKETVIBE',
          text: `Olá ${user.name}, confirme seu e-mail acessando: ${url}`,
        });
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
```

`apps/api/src/modules/auth/routes/auth.routes.ts`:

```ts
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';

type AuthHandler = {
  handler: (request: Request) => Promise<Response>;
};

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthHandler,
): void {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/auth/*',
    async handler(request, reply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const headers = fromNodeHeaders(request.headers);
        headers.delete('content-length');
        headers.delete('host');

        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const response = await auth.handler(
          new Request(url.toString(), {
            method: request.method,
            headers,
            ...(hasBody ? { body: JSON.stringify(request.body ?? {}) } : {}),
          }),
        );

        reply.status(response.status);
        for (const [key, value] of response.headers.entries()) {
          if (key !== 'set-cookie') {
            reply.header(key, value);
          }
        }
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length > 0) {
          reply.header('set-cookie', setCookies);
        }
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'auth_upstream_error' });
      }
    },
  });
}
```

Em `apps/api/src/app.ts`:

```ts
import { sendEmail } from './modules/auth/email.js';
import { createAuth } from './modules/auth/auth.js';
import { registerAuthRoutes } from './modules/auth/routes/auth.routes.js';
```

No options do `buildApp`, acrescente:

```ts
    auth?: ReturnType<typeof createAuth>;
```

Antes do `app.get('/health', ...)`:

```ts
  const authInstance = options.auth ?? createAuth(getDefaultDb(), { sendEmail });
  registerAuthRoutes(app, authInstance);
```

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts
pnpm --filter @ticketvibe/api exec vitest run
pnpm --filter @ticketvibe/api exec tsc --noEmit
```
Expected: spec 4/4 PASS; suíte API completa PASS (73 após a Task 1, 77 com esta task); tsc limpo.

> **Risco da versão (D8):** se a better-auth instalada divergir do esperado (código de erro, forma do corpo do sign-up, status do verify-email), os asserts falham com a resposta real visível no output do vitest — ajuste o assert para o comportamento observado **sem afrouxar o sentido do teste** (ex.: se `EMAIL_NOT_VERIFIED` vier como `EMAIL_NOT_VERIFIED_OR_NO_PASSWORD`, atualize o literal; se o sign-up duplicado devolver 4xx, troque o assert do 2º teste para contar linhas === 1 apenas).

- [ ] **Step 5: Sanity check manual de rota**

```bash
pnpm infra:up && pnpm --filter @ticketvibe/api dev
# em outro terminal:
curl -s -X POST http://localhost:3001/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"name":"Sanity","email":"sanity-'$RANDOM'@test.dev","password":"senha-segura-1"}'
```
Expected: JSON 200 com `user`. (SMTP pode logar erro no console se o Mailpit estiver fora — irrelevante aqui; o Mailpit local está no ar.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/app.ts
git commit -m "feat(api): expose better-auth email and password endpoints"
```

---

### Task 4: API — recuperação de senha (esqueci → redefino → login novo)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.integration.spec.ts`

- [ ] **Step 1: Escrever os testes falhantes**

Acrescente ao final do mesmo spec file:

```ts
describe('recuperação de senha', () => {
  async function signUpAndVerify(email: string) {
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
  }

  it('esqueci → e-mail com token → redefino → login só com a senha nova', async () => {
    const email = 'reset@test.dev';
    await signUpAndVerify(email);

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
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
      url: '/api/auth/forget-password',
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
      url: '/api/auth/forget-password',
      payload: { email: 'ninguem@test.dev' },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts`
Expected: FAIL — endpoints `/forget-password` e `/reset-password` ainda não respondem (404 do catch-all? na verdade o catch-all Better Auth os possui: o teste pode **passar parcialmente já** — se passar tudo de primeira, valide que os asserts cobrem o comportamento real e siga; o TDD aqui se manifesta pela captura do token no e-mail, que depende do callback `sendResetPassword` da Task 3).

- [ ] **Step 3: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts`
Expected: 7/7 PASS (4 da parte 1 + 3 novos). Se `sendResetPassword` ainda não estiver disparando (ex.: esquecido na Task 3), implemente-o em `auth.ts` conforme a decisão D6 (código já fornecido na Task 3).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/auth.integration.spec.ts
git commit -m "test(api): cover password recovery flows against postgres"
```

---

### Task 5: Web — proxy `/api/auth/[...all]`

**Files:**
- Modify: `apps/web/package.json` (via pnpm add)
- Create: `apps/web/src/app/api/auth/[...all]/route.ts`
- Create: `apps/web/src/app/api/auth/[...all]/route.spec.ts`

- [ ] **Step 1: Instalar o client**

```bash
pnpm --filter @ticketvibe/web add better-auth
```

- [ ] **Step 2: Escrever o teste falhante**

`apps/web/src/app/api/auth/[...all]/route.spec.ts`:

```ts
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
afterEach(() => server.resetHandlers());
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
      http.post('http://localhost:3001/api/auth/sign-in/email', async (info) => {
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
      }),
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
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/auth`
Expected: FAIL — módulo `./route` não existe.

- [ ] **Step 4: Implementar**

`apps/web/src/app/api/auth/[...all]/route.ts`:

```ts
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function proxy(request: Request, all: string[]): Promise<Response> {
  const url = new URL(request.url);
  const target = `${API_URL}/api/auth/${all.join('/')}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      ...(hasBody ? { body: await request.text() } : {}),
    });
  } catch (error) {
    console.error('Auth proxy upstream failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-length');

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}

type AuthProxyContext = { params: Promise<{ all: string[] }> };

async function handle(
  request: Request,
  context: AuthProxyContext,
): Promise<Response> {
  const { all } = await context.params;
  return proxy(request, all);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
```

- [ ] **Step 5: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/app/api/auth
pnpm --filter @ticketvibe/web exec tsc --noEmit
```
Expected: 4/4 PASS; tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/app/api pnpm-lock.yaml
git commit -m "feat(web): proxy auth routes to the api"
```

---

### Task 6: Web — auth-client, `AuthMenu` no Header e estado de sessão

**Files:**
- Create: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/components/auth-menu.tsx`
- Create: `apps/web/src/components/auth-menu.spec.tsx`
- Modify: `apps/web/src/components/header.tsx`

- [ ] **Step 1: Escrever o teste falhante**

`apps/web/src/components/auth-menu.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthMenu } from './auth-menu';

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
  refresh.mockReset();
});
afterAll(() => server.close());

describe('AuthMenu', () => {
  it('mostra o link Entrar quando não há sessão', async () => {
    server.use(
      http.get(/\/api\/auth\/get-session$/, () =>
        HttpResponse.json(null, { status: 401 }),
      ),
    );

    render(<AuthMenu />);

    const link = await screen.findByRole('link', { name: /Entrar/ });
    expect(link).toHaveAttribute('href', '/entrar');
  });

  it('mostra o nome do usuário e o botão Sair quando há sessão', async () => {
    server.use(
      http.get(/\/api\/auth\/get-session$/, () =>
        HttpResponse.json({
          session: { token: 'abc' },
          user: { id: 'u1', name: 'Maria Silva', email: 'maria@test.dev' },
        }),
      ),
    );

    render(<AuthMenu />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/auth-menu.spec.tsx`
Expected: FAIL — módulo `./auth-menu` não existe.

- [ ] **Step 3: Implementar**

`apps/web/src/lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
```

`apps/web/src/components/auth-menu.tsx`:

```tsx
'use client';

import { User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';

function AuthMenu() {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) {
    return (
      <Button variant="default" disabled aria-label="Carregando sessão">
        <User className="size-4" aria-hidden="true" />
        Entrar
      </Button>
    );
  }

  if (!data?.user) {
    return (
      <Button variant="default" asChild>
        <Link href="/entrar">
          <User className="size-4" aria-hidden="true" />
          Entrar
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-40 truncate text-sm font-medium text-foreground sm:inline">
        {data.user.name}
      </span>
      <Button
        variant="outline"
        onClick={async () => {
          await authClient.signOut();
          router.refresh();
        }}
      >
        Sair
      </Button>
    </div>
  );
}

export { AuthMenu };
```

Em `apps/web/src/components/header.tsx`, substitua o bloco final `<Button variant="default">...Entrar</Button>` por:

```tsx
          <AuthMenu />
```

Ajuste os imports: remova `User` de lucide (só era usado ali) e adicione:

```tsx
import { AuthMenu } from './auth-menu';
```

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components/auth-menu.spec.tsx src/components
pnpm --filter @ticketvibe/web exec tsc --noEmit
```
Expected: 2/2 novos PASS; demais specs de componentes continuam PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth-client.ts apps/web/src/components/auth-menu.tsx apps/web/src/components/auth-menu.spec.tsx apps/web/src/components/header.tsx
git commit -m "feat(web): reflect auth session in the header"
```

---

### Task 7: Web — formulário de login + página `/entrar`

**Files:**
- Create: `apps/web/src/components/login-form.tsx`
- Create: `apps/web/src/components/login-form.spec.tsx`
- Create: `apps/web/src/app/entrar/page.tsx`

- [ ] **Step 1: Escrever o teste falhante**

`apps/web/src/components/login-form.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
  refresh.mockReset();
});
afterAll(() => server.close());

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Senha'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginForm', () => {
  it('loga com sucesso e navega para a home', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/email$/, () =>
        HttpResponse.json({ token: 'tok', user: { email: 'maria@test.dev' } }),
      ),
    );

    render(<LoginForm />);
    fillAndSubmit('maria@test.dev', 'senha-segura-1');

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/');
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra mensagem pt-BR quando as credenciais são inválidas', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/email$/, () =>
        HttpResponse.json(
          {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password',
            status: 401,
          },
          { status: 401 },
        ),
      ),
    );

    render(<LoginForm />);
    fillAndSubmit('maria@test.dev', 'senha-errada-9');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail ou senha inválidos.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('orienta a confirmar o e-mail quando ainda não verificado', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/email$/, () =>
        HttpResponse.json(
          {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Email not verified',
            status: 403,
          },
          { status: 403 },
        ),
      ),
    );

    render(<LoginForm />);
    fillAndSubmit('maria@test.dev', 'senha-segura-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail ainda não confirmado. Verifique sua caixa de entrada.',
    );
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/login-form.spec.tsx`
Expected: FAIL — módulo `./login-form` não existe.

- [ ] **Step 3: Implementar**

`apps/web/src/components/login-form.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function formatAuthError(code: string | null | undefined): string {
  switch (code) {
    case 'EMAIL_NOT_VERIFIED':
      return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'E-mail ou senha inválidos.';
    case 'PASSWORD_TOO_SHORT':
      return 'A senha deve ter pelo menos 8 caracteres.';
    default:
      return 'Não foi possível continuar. Tente novamente.';
  }
}

function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { error: authError } = await authClient.signIn.email({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    setPending(false);
    if (authError) {
      setError(formatAuthError(authError.code));
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Entrar</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <Input type="email" name="email" required autoComplete="email" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Senha
        <Input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link href="/recuperar-senha" className="text-primary hover:underline">
          Esqueci a senha
        </Link>
      </p>
      <p className="text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link href="/cadastro" className="text-primary hover:underline">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}

export { LoginForm };
```

`apps/web/src/app/entrar/page.tsx`:

```tsx
import { Header } from '@/components/header';
import { LoginForm } from '@/components/login-form';

export const instant = false;

export default function EntrarPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <LoginForm />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components/login-form.spec.tsx
pnpm --filter @ticketvibe/web exec tsc --noEmit
```
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/login-form.tsx apps/web/src/components/login-form.spec.tsx apps/web/src/app/entrar
git commit -m "feat(web): add login page"
```

---

### Task 8: Web — formulário de cadastro + página `/cadastro`

**Files:**
- Create: `apps/web/src/components/signup-form.tsx`
- Create: `apps/web/src/components/signup-form.spec.tsx`
- Create: `apps/web/src/app/cadastro/page.tsx`

- [ ] **Step 1: Escrever o teste falhante**

`apps/web/src/components/signup-form.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SignupForm } from './signup-form';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
});
afterAll(() => server.close());

describe('SignupForm', () => {
  it('cria a conta e mostra o aviso de confirmação por e-mail', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/auth\/sign-up\/email$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ token: null, user: { email: 'novo@test.dev' } });
      }),
    );

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Novo Usuário' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'novo@test.dev' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha-segura-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByRole('heading', { name: 'Verifique seu e-mail' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/novo@test\.dev/)).toBeInTheDocument();
    expect(received).toEqual({
      name: 'Novo Usuário',
      email: 'novo@test.dev',
      password: 'senha-segura-1',
    });
  });

  it('mostra erro pt-BR quando a senha é curta', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-up\/email$/, () =>
        HttpResponse.json(
          {
            code: 'PASSWORD_TOO_SHORT',
            message: 'Password too short',
            status: 400,
          },
          { status: 400 },
        ),
      ),
    );

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Novo Usuário' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'novo@test.dev' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'curta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A senha deve ter pelo menos 8 caracteres.',
    );
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/signup-form.spec.tsx`
Expected: FAIL — módulo `./signup-form` não existe.

- [ ] **Step 3: Implementar**

`apps/web/src/components/signup-form.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { formatAuthError } from './login-form';
import { Button } from './ui/button';
import { Input } from './ui/input';

function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const { error: authError } = await authClient.signUp.email({
      name: String(form.get('name') ?? ''),
      email,
      password: String(form.get('password') ?? ''),
    });
    setPending(false);
    if (authError) {
      setError(formatAuthError(authError.code));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">
          Verifique seu e-mail
        </h1>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de confirmação para <strong>{sentTo}</strong>. Acesse
          o link para ativar sua conta e depois faça login.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/entrar" className="text-primary hover:underline">
            Já tenho conta — Entrar
          </Link>
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Criar conta</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nome
        <Input type="text" name="name" required autoComplete="name" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <Input type="email" name="email" required autoComplete="email" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Senha
        <Input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Criando conta…' : 'Criar conta'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/entrar" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export { SignupForm };
```

`apps/web/src/app/cadastro/page.tsx`:

```tsx
import { Header } from '@/components/header';
import { SignupForm } from '@/components/signup-form';

export const instant = false;

export default function CadastroPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <SignupForm />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components/signup-form.spec.tsx
pnpm --filter @ticketvibe/web exec tsc --noEmit
```
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/signup-form.tsx apps/web/src/components/signup-form.spec.tsx apps/web/src/app/cadastro
git commit -m "feat(web): add signup page with email confirmation notice"
```

---

### Task 9: Web — `/recuperar-senha` e `/redefinir-senha`

**Files:**
- Create: `apps/web/src/components/recover-password-form.tsx` (+`.spec.tsx`)
- Create: `apps/web/src/components/reset-password-form.tsx` (+`.spec.tsx`)
- Create: `apps/web/src/app/recuperar-senha/page.tsx`
- Create: `apps/web/src/app/redefinir-senha/page.tsx`

- [ ] **Step 1: Escrever os testes falhantes**

`apps/web/src/components/recover-password-form.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RecoverPasswordForm } from './recover-password-form';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('RecoverPasswordForm', () => {
  it('envia o pedido e mostra mensagem anti-enumeration', async () => {
    server.use(
      http.post(/\/api\/auth\/forget-password$/, () =>
        HttpResponse.json({ status: true }),
      ),
    );

    render(<RecoverPasswordForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'maria@test.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(
      await screen.findByText(/Se o e-mail existir/),
    ).toBeInTheDocument();
  });
});
```

`apps/web/src/components/reset-password-form.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './reset-password-form';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
});
afterAll(() => server.close());

describe('ResetPasswordForm', () => {
  it('redefina a senha e mostra confirmação', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/auth\/reset-password$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ status: true });
      }),
    );

    render(<ResetPasswordForm token="tok-123" />);
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-nova-456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(
      await screen.findByRole('heading', { name: 'Senha alterada' }),
    ).toBeInTheDocument();
    expect(received).toEqual({ token: 'tok-123', newPassword: 'senha-nova-456' });
  });

  it('sem token mostra aviso de link inválido', () => {
    render(<ResetPasswordForm token={null} />);

    expect(screen.getByText(/Solicite um novo link/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/recover-password-form.spec.tsx src/components/reset-password-form.spec.tsx`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

`apps/web/src/components/recover-password-form.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';
import { Input } from './ui/input';

function RecoverPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await authClient.forgetPassword({
      email: String(form.get('email') ?? ''),
      redirectTo: '/redefinir-senha',
    });
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Link enviado</h1>
        <p className="text-sm text-muted-foreground">
          Se o e-mail existir em nossa base, você receberá um link de
          recuperação. Confira também a caixa de spam.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/entrar" className="text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Recuperar senha</h1>
      <p className="text-sm text-muted-foreground">
        Informe o e-mail da sua conta. Enviaremos um link para criar uma nova
        senha.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <Input type="email" name="email" required autoComplete="email" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar link'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Lembrou a senha?{' '}
        <Link href="/entrar" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export { RecoverPasswordForm };
```

`apps/web/src/components/reset-password-form.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { formatAuthError } from './login-form';
import { Button } from './ui/button';
import { Input } from './ui/input';

type ResetPasswordFormProps = { token: string | null };

function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { error: authError } = await authClient.resetPassword({
      token,
      newPassword: String(form.get('newPassword') ?? ''),
    });
    setPending(false);
    if (authError) {
      setError(formatAuthError(authError.code));
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Link inválido</h1>
        <p className="text-sm text-muted-foreground">
          Solicite um novo link de recuperação de senha.
        </p>
        <Link
          href="/recuperar-senha"
          className="text-sm font-medium text-primary hover:underline"
        >
          Recuperar senha
        </Link>
      </section>
    );
  }

  if (done) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Senha alterada</h1>
        <p className="text-sm text-muted-foreground">
          Sua senha foi atualizada. Faça login com a nova senha.
        </p>
        <Button onClick={() => router.push('/entrar')}>Ir para o login</Button>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Nova senha</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nova senha
        <Input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar nova senha'}
      </Button>
    </form>
  );
}

export { ResetPasswordForm };
```

`apps/web/src/app/recuperar-senha/page.tsx`:

```tsx
import { Header } from '@/components/header';
import { RecoverPasswordForm } from '@/components/recover-password-form';

export const instant = false;

export default function RecuperarSenhaPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <RecoverPasswordForm />
      </main>
    </>
  );
}
```

`apps/web/src/app/redefinir-senha/page.tsx`:

```tsx
import { Header } from '@/components/header';
import { ResetPasswordForm } from '@/components/reset-password-form';

export const instant = false;

type RedefinirSenhaPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function RedefinirSenhaPage({
  searchParams,
}: RedefinirSenhaPageProps) {
  const { token } = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <ResetPasswordForm token={token ?? null} />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components/recover-password-form.spec.tsx src/components/reset-password-form.spec.tsx
pnpm --filter @ticketvibe/web exec tsc --noEmit
```
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/recover-password-form.tsx apps/web/src/components/recover-password-form.spec.tsx apps/web/src/components/reset-password-form.tsx apps/web/src/components/reset-password-form.spec.tsx apps/web/src/app/recuperar-senha apps/web/src/app/redefinir-senha
git commit -m "feat(web): add password recovery pages"
```

---

### Task 10: Docs — seção de autenticação local no README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Documentar o fluxo dev**

Acrescente ao README (próxima à seção de portas/ambiente local existente):

```markdown
### Autenticação local (e-mail e senha)

1. `pnpm infra:up` — sobe Postgres, Redis e Mailpit (SMTP `:1025`, interface `:8025`).
2. Crie a conta em <http://localhost:3000/cadastro>.
3. Abra o **Mailpit** em <http://localhost:8025> — os e-mails de **confirmação de cadastro** e de **recuperação de senha** chegam lá (em produção seria o SMTP real; localmente o container `ticketvibe-mailpit` recebe tudo).
4. Após confirmar o e-mail pelo link da mensagem, entre em <http://localhost:3000/entrar>.

Variáveis opcionais (defaults valem para o ambiente local):

| Variável | Default | Uso |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `http://localhost:3000` | origem dos links nos e-mails |
| `SMTP_HOST` / `SMTP_PORT` | `127.0.0.1` / `1025` | servidor de e-mail (Mailpit) |
| `BETTER_AUTH_SECRET` | valor de dev do Better Auth | em produção é obrigatório |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document local auth and mailpit workflow"
```

---

### Task 11: E2E de cadastro → confirmação via Mailpit → login → logout + gates completos

**Files:**
- Create: `apps/web/tests/e2e/helpers/mailpit.ts`
- Create: `apps/web/tests/e2e/auth.spec.ts`

- [ ] **Step 1: Helper do Mailpit**

`apps/web/tests/e2e/helpers/mailpit.ts`:

```ts
import type { APIRequestContext } from '@playwright/test';

const MAILPIT_API = 'http://127.0.0.1:8025/api/v1';

type MailpitListItem = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

export async function clearMailbox(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT_API}/messages`);
}

export async function waitForEmailLink(
  request: APIRequestContext,
  to: string,
  subjectFragment: string,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const listResponse = await request.get(`${MAILPIT_API}/messages?limit=20`);
    const body = (await listResponse.json()) as { messages?: MailpitListItem[] };
    const match = (body.messages ?? []).find(
      (message) =>
        message.Subject.includes(subjectFragment) &&
        message.To.some((recipient) => recipient.Address === to),
    );
    if (match) {
      const fullResponse = await request.get(
        `${MAILPIT_API}/message/${match.ID}`,
      );
      const full = (await fullResponse.json()) as { Text?: string };
      const urlMatch = full.Text?.match(/https?:\/\/\S+/);
      if (urlMatch) {
        return urlMatch[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `E-mail para ${to} com assunto "${subjectFragment}" não chegou em 15s`,
  );
}
```

- [ ] **Step 2: Escrever o E2E**

`apps/web/tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { clearMailbox, waitForEmailLink } from './helpers/mailpit';

const WEB = 'http://localhost:3000';

test('cadastro, confirmação de e-mail via Mailpit, login, persistência e logout', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';

  await clearMailbox(request);

  await page.goto(`${WEB}/cadastro`);
  await page.getByLabel('Nome').fill('Comprador E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Verifique seu e-mail')).toBeVisible();

  const verifyUrl = await waitForEmailLink(request, email, 'Confirme seu e-mail');
  await page.goto(verifyUrl);

  await page.goto(`${WEB}/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL(`${WEB}/`);
  await expect(page.getByText('Comprador E2E')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Comprador E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: /Entrar/ })).toBeVisible();
});
```

> **Nota (D4):** este spec usa URLs absolutas `http://localhost:3000` porque o link do e-mail aponta para `localhost` (cookie domínio). Os demais E2Es continuam em `127.0.0.1` via `baseURL` — não altere o `playwright.config.ts`.

- [ ] **Step 3: Rodar o E2E novo**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/web exec playwright test auth
```
Expected: 1/1 PASS.

> Se o teste falhar por comportamento do Better Auth (ex.: subject do e-mail, forma do redirect de verificação, cookie name), ajuste o spec/helper conforme o comportamento real observado (Mailpit API: `curl -s http://127.0.0.1:8025/api/v1/messages | jq`).

- [ ] **Step 4: Gates completos**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test
pnpm build
pnpm --filter @ticketvibe/api exec drizzle-kit check
git status --short apps/api/drizzle
```

Expected:
- lint: exit 0 (1 info pré-existente de `test-helpers.ts` ok — se o `sql` da Task 2 gerar novo lint do mesmo tipo, avalie extrair a string para constante)
- typecheck: 5/5
- test: shared 43, api ≥ 80 (71 + 4 integração parte 1 + 3 recuperação + 2 email unit), web ≥ 123 (110 + 4 proxy + 2 auth-menu + 3 login + 3 signup + 2 recover + 2 reset)
- playwright: 16 anteriores + 1 novo = 17
- build: OK (rotas `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` e `/api/auth/[...all]` no output)
- drizzle-kit check: limpo; git status drizzle: limpo (0004 já commitada)

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e
git commit -m "test(web): cover signup to login journey with mailpit"
```

Depois do commit, **reportar ao usuário** para o checkpoint visual (páginas de login/cadastro, header logado/deslogado) — o controller roda o playwright script e os screenshots, como no ticket 07.

---

## Critérios de aceitação (ticket 08) → tasks

| Critério | Tasks |
|---|---|
| Better Auth configurado sobre o Postgres, provider e-mail+senha | 1, 2, 3 |
| Cadastro com confirmação de e-mail; e-mails visíveis no Mailpit (comando de dev documentado) | 3, 7, 8, 10, 11 |
| Login, logout e recuperação de senha funcionais | 3, 4, 6, 7, 9 |
| Sessão persistida e reconhecida pelo web (estado de "Entrar" no cabeçalho) | 6, 11 |
| Testes: integração (Postgres real), componente de login/cadastro com MSW, E2E cadastro → confirmação via Mailpit → login | 3, 4, 5–9, 11 |

## Fora de escopo (não fazer)

- Login com Google (ticket 09).
- Proteção de rotas/checkout por sessão (tickets 11–13).
- Rate limiting, brute-force protection, CSRF custom (Better Auth embute CSRF), 2FA, "lembrar de mim".
- Tabelas de auth no seed; GLOSSARY.md / docs/adr (arquivos inexistentes por decisão anterior).
- Alterar `playwright.config.ts`, `global-setup.ts` ou o `baseURL` 127.0.0.1.
- CORS na API (proxy same-origin elimina a necessidade).

## Riscos conhecidos

1. **better-auth@1.7.7 pode divergir** de docs genéricas (literal de código de erro, corpo do sign-up, status do `verify-email`). Os specs de integração são a rede: falham com a resposta real visível — ajustar asserts sem afrouxar o sentido.
2. **Token de verificação é assinado (HMAC), não fica na tabela `verification`** — por isso o DI de `sendEmail` (D8); não "resolver" lendo o banco.
3. **Múltiplos `set-cookie`** no proxy (web) e no mount Fastify (api) dependem de `getSetCookie()` — o E2E de "sessão persiste após reload" é a prova real; se cair, inspecione `curl -i` nos dois saltos.
4. **`user` é palavra reservada** no Postgres — drizzle cita na migração; o TRUNCATE de teste precisa de `"user"` entre aspas.
5. **`cacheComponents` + Header com AuthMenu (client)** — build gate obrigatório; se o build reclamar de rota estática com fetch do client, nada de server-side session foi adicionado justamente para evitar isso (D7).
6. **Host do e-mail vs E2E:** links apontam para `http://localhost:3000` (D4); o E2E de auth é o único que usa `localhost` em URLs absolutas — não unificar/quebrar os outros specs por causa disso.
7. **SMTP fora do ar não quebra testes:** erros de envio são logados; integração usa coletor injetado, não o nodemailer.
