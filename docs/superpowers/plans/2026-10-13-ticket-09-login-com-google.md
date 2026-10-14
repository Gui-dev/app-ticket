# Ticket 09 — Login com Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O comprador com conta Google entra em um clique pelo botão "Entrar com Google" na página de login, caindo na mesma sessão do fluxo por e-mail — conta criada no primeiro acesso, reutilizada nos seguintes.

**Architecture:** Better Auth ganha o provider Google via `socialProviders` no `createAuth` do `apps/api` (sem plugin — em 1.7.7 a config é opção direta do `betterAuth()`). O endpoint `POST /api/auth/sign-in/social` devolve `200 + {url, redirect:true}` com `Location` para `accounts.google.com`; o client `redirectPlugin` (default do `createAuthClient`) navega o browser. O callback `GET /api/auth/callback/google` volta pelo proxy same-origin já existente (`/api/auth/[...all]`) — com `baseURL` estático configurado, better-auth não deriva URL de nenhum header da request, então o proxy é seguro (verificado no dist: `create-context.mjs:64`, `callback.mjs` usa só `ctx.baseURL` e o state armazenado). Usuário Google nasce com `emailVerified: true`; convergência por e-mail com conta de senha é comportamento de `link-account.mjs` (coberto por teste de integração com callback simulado).

**Tech Stack:** better-auth@1.7.7 (`socialProviders.google`, endpoints automáticos `/sign-in/social` e `/callback/google`, state strategy `database`), Fastify catch-all existente, Next proxy existente, vitest+MSW (web), vitest+Fastify inject+Postgres (api), Playwright (E2E modo simulado — aborta a navegação no domínio do Google).

---

## Fatos do better-auth@1.7.7 verificados no dist (não re-descobrir)

Todos confirmados em `apps/api/node_modules/better-auth/dist` e `@better-auth/core/dist` antes deste plano:

1. **Config sem plugin:** `betterAuth({ socialProviders: { google: { clientId, clientSecret } } })` — `context/create-context.mjs:98-106`. `clientId` vazio → só `logger.warn`; falha adia para request time (`BetterAuthError CLIENT_ID_AND_SECRET_REQUIRED` → 500 no `/sign-in/social`).
2. **Endpoints automáticos:** `POST /api/auth/sign-in/social` (`api/routes/sign-in.mjs:118-121`) e `GET|POST /api/auth/callback/:id` (`api/routes/callback.mjs:24-32`). Provider desconhecido → 404 `PROVIDER_NOT_FOUND`.
3. **Resposta do `/sign-in/social`:** **200** (não 302) com header `Location` + body `{ url, redirect: true }` (`sign-in.mjs:226-239`). Navegação é do client: `redirectPlugin` (`client/fetch-plugins.mjs:3-16`, default em `client/config.mjs:48-53`) faz `window.location.href = data.url` quando `data.url && data.redirect`.
4. **Authorize URL:** `https://accounts.google.com/o/oauth2/v2/auth` com `response_type=code`, `client_id`, `state` (32 chars, DB-backed: row `auth-state:<state>` + cookie `better-auth.state`), `scope=email profile openid`, `redirect_uri=${baseURL}/api/auth/callback/google`, PKCE S256 (`core/oauth2/create-authorization-url.mjs`, `core/social-providers/google.mjs:49-82`).
5. **`emailVerified: true` para Google:** novo usuário criado com `emailVerified: userInfo.emailVerified` (`oauth2/link-account.mjs:275-281`); usuário local existente com mesmo e-mail tem o flag atualizado ao linkar (`link-account.mjs:188,236`). `getUserInfo` decodes o `id_token` localmente (sem chamada ao userinfo) — `core/social-providers/google.mjs:108-124`.
6. **Account row:** `providerId: 'google'`, `accountId` = `sub` do Google, tokens OAuth, **sem** `password` (`link-account.mjs:264-288`).
7. **Origin/CSRF:** `originCheckMiddleware` roda em tudo (`api/index.mjs:159-162`) mas só valida Origin quando a request tem cookie (`middlewares/origin-check.mjs:108`); `callbackURL: '/'` relativo passa. O `formCsrfMiddleware` é só do e-mail sign-in. Nada muda no `trustedOrigins` existente.
8. **Proxy/callback seguro:** com `baseURL` estático setado (nosso caso), nenhuma URL do fluxo lê `request.url/host/x-forwarded-*` (`auth/base.mjs:31-45`, `callback.mjs` usa só `c.context.baseURL` + state). Cookies são host-only `localhost` — atribuídos ao web origin pelo proxy.
9. **Client sem plugin:** `authClient.signIn.social({ provider: 'google', callbackURL: '/' })` → `POST /api/auth/sign-in/social` (`client/proxy.mjs:34-50`, kebab-case). BaseURL relativa `/api/auth` resolve no origin do web (proxy).
10. **Testabilidade:** inject sem cookie pula origin-check mesmo com `disableOriginCheck: false`; token exchange é `fetch('https://oauth2.googleapis.com/token', …)` no request time (global fetch, stubável); state vem no param `state` da Location + cookie `better-auth.state`.

## Arquitetura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `apps/api/src/modules/auth/auth.ts` | `createAuth`: adiciona bloco `socialProviders.google` com defaults de dev (placeholders) sobre `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` | Modify |
| `apps/api/src/modules/auth/auth.integration.spec.ts` | Integração: `/sign-in/social` (URL+cookie) e callback simulado (token stub → usuário/sessão/convergência) | Modify |
| `apps/web/src/components/login-form.tsx` | Botão "Entrar com Google" (type=button, divider "ou") no mesmo form, reusando o `error`/`pending` do form | Modify |
| `apps/web/src/components/login-form.spec.tsx` | MSW: click → POST `/sign-in/social` com `{provider:'google', callbackURL:'/'}`; falha → alert | Modify |
| `apps/web/tests/e2e/google.spec.ts` | E2E modo simulado: click → navegador para authorize URL do Google (abortado pelo Playwright) | Create |
| `README.md` | Env vars Google + como criar credenciais reais no Cloud Console | Modify |

**Decisões:**
- **D1 — Defaults de dev no código:** `GOOGLE_CLIENT_ID`/`SECRET` têm placeholders exportados (`ticketvibe-dev-client` / `ticketvibe-dev-secret`). Sem env real, o fluxo monta a authorize URL e o Google rejeita no consent — E2E/integração rodam sem segredos e sem `vi.stubEnv` (o `createAuth` do spec principal já nasce com Google configurado). Credenciais reais são env de deploy/dev humano.
- **D2 — Só a página de login** recebe o botão (critério do ticket); `/cadastro` continua só e-mail — deferral se o fluxo de signup com Google for pedido depois.
- **D3 — E2E "modo simulado"** = Playwright intercepta `**accounts.google.com/**` com `route.abort()` e asserções na authorize URL (origin, `redirect_uri`, `client_id`). O consentimento real do Google não é automatizável sem credenciais — callback real é coberto pela integração com token stub (Task 2).
- **D4 — Callback simulado** na integração: stub de `globalThis.fetch` intercepta só `oauth2.googleapis.com/token` devolvendo `access_token` + `id_token` JWT fake (payload base64url; better-auth decodes sem verificar assinatura — fato 5). Demais URLs caem no fetch real.

---

### Task 1: API — provider Google no `createAuth` + integração do `/sign-in/social`

**Files:**
- Modify: `apps/api/src/modules/auth/auth.ts`
- Modify: `apps/api/src/modules/auth/auth.integration.spec.ts`

- [ ] **Step 1: Escrever o teste falhante**

Acrescente ao final de `apps/api/src/modules/auth/auth.integration.spec.ts` (mesmo arquivo; o `app` do `beforeAll` passa a nascer com Google configurado pelo Step 2):

```ts
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
    expect(authorizeUrl.searchParams.get('client_id')).toBe(DEV_GOOGLE_CLIENT_ID);
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
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts`
Expected: FAIL — `DEV_GOOGLE_CLIENT_ID is not defined` (e, após import, `body.url`/`accounts.google.com` ausentes porque o provider não está configurado).

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/auth/auth.ts`, adicione os exports de defaults e o bloco `socialProviders` (e o import de `vi` não é necessário aqui — só no spec):

```ts
export const DEV_GOOGLE_CLIENT_ID = 'ticketvibe-dev-client';
export const DEV_GOOGLE_CLIENT_SECRET = 'ticketvibe-dev-secret';
```

Dentro de `betterAuth({ ... })`, depois da linha de `baseURL`/`trustedOrigins` (antes de `emailAndPassword`):

```ts
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? DEV_GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? DEV_GOOGLE_CLIENT_SECRET,
      },
    },
```

No topo do spec `auth.integration.spec.ts`, ajuste o import de `./auth.js`:

```ts
import {
  createAuth,
  DEV_GOOGLE_CLIENT_ID,
  type SendEmailInput,
} from './auth.js';
```

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts
pnpm --filter @ticketvibe/api exec vitest run
pnpm --filter @ticketvibe/api exec tsc --noEmit
```
Expected: auth spec 11/11 (9 prévios — inclui o teste de trustedOrigins do fechamento do 08 — + 2 novos); suíte API completa PASS (85); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(api): add google social provider to better auth"
```

---

### Task 2: API — integração do callback simulado (criação de conta, relogin, convergência)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.integration.spec.ts`

**Cobertura do ticket:** "Primeiro login cria usuário e sessão; logins seguintes reutilizam a conta (mesmo e-mail)" e "Contas por e-mail e por Google convergem no mesmo usuário" — via callback com token exchange stubado (fato D4).

- [ ] **Step 1: Escrever os testes falhantes**

Acrescente ao spec (após o describe da Task 1). Helpers no topo do arquivo, junto dos demais (junto de `extractUrl`, linhas ~22-28):

```ts
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
```

No topo do spec, ajuste o import de `vitest` (acrescente `afterEach` e `vi` — `afterEach` é usado no novo describe e ainda não existe no arquivo):

```ts
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
```

Novo describe (final do arquivo):

```ts
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
    return { state: state as string, cookieHeader: `${stateCookie?.name}=${stateCookie?.value}` };
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
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts`
Expected: os 4 novos FAIL (hoje o callback sem state válido/DB não cria usuário; `afterEach`/helpers ainda não existem — o import de `vi` faltando pode derrubar o arquivo inteiro; nesse caso implemente primeiro os helpers do Step 1 para chegar ao red real dos asserts).

- [ ] **Step 3: Implementar**

**Nenhum código de produção novo.** O callback, state DB-backed e link-account já existem no Better Auth montado na Task 3 do ticket 08; a Task 1 deste ticket habilitou o provider. Se algum teste falhar por comportamento real (ex.: formato do `location` de erro, nome do cookie), leia a saída e ajuste **o assert** apenas quando o comportamento observado estiver correto e documentado no comentário do teste — nunca afrouxe o sentido (ex.: continue exigindo 302, `emailVerified: true`, 1 row).

Pontos de fricção conhecidos ao rodar (verificados no dist antes deste plano):
- `startGoogleSignIn` grava state na tabela `verification` — o `resetDatabase` do `beforeEach` externo limpa entre testes; cada teste faz o seu próprio fluxo completo.
- O stub de fetch é global e só intercepta Google; `pg` e o resto da request não usam fetch. `vi.unstubAllGlobals()` no `afterEach` do describe (herdado pelo `beforeEach` externo — ok).
- `callback.headers.location` para sucesso é `'/'` (o `callbackURL` relativo do state, `callback.mjs:204-210`).
- Melhor-auth pode devolver o erro com `location` variando (`/api/auth/error` com query). Se o teste de erro falhar, inspecione `callback.headers.location` real e ajuste o `toContain` para o prefixo observado mantendo a asserção de 302 e de "nenhum usuário criado".

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts
pnpm --filter @ticketvibe/api exec vitest run
pnpm --filter @ticketvibe/api exec tsc --noEmit
```
Expected: auth spec 15/15 (11 + 4 novos); suíte API PASS (89); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.integration.spec.ts
git commit -m "test(api): cover simulated google oauth callback against postgres"
```

---

### Task 3: Web — botão "Entrar com Google" no formulário de login

**Files:**
- Modify: `apps/web/src/components/login-form.tsx`
- Modify: `apps/web/src/components/login-form.spec.tsx`

- [ ] **Step 1: Escrever os testes falhantes**

Adicione dois testes ao `describe('LoginForm')` existente em `login-form.spec.tsx` (o spec já tem o padrão de import dinâmico após `server.listen` — fato 10 do ticket 08; não mude o topo do arquivo):

```tsx
  it('envia o signIn.social para o Google ao clicar no botão', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/auth\/sign-in\/social$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({
          url: 'https://accounts.google.com/o/oauth2/v2/auth?fake=1',
          redirect: false,
        });
      }),
    );

    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    await waitFor(() => {
      expect(received).toEqual({ provider: 'google', callbackURL: '/' });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('mostra alerta quando o signIn.social falha', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/social$/, () =>
        HttpResponse.json(
          { code: 'PROVIDER_NOT_FOUND', message: 'Not found', status: 404 },
          { status: 404 },
        ),
      ),
    );

    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível continuar. Tente novamente.',
    );
  });
```

Notas dos asserts:
- `redirect: false` no mock evita o `window.location.href` do `redirectPlugin` no jsdom (fato 3) — o que queremos provar aqui é o **contrato da requisição**, não a navegação (a navegação é E2E, Task 4).
- `name: 'Entrar com Google'` é accessibility name exato; não colide com o submit `name: 'Entrar'` (testing-library casa nome completo).

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/login-form.spec.tsx`
Expected: FAIL — nenhum botão "Entrar com Google" (`Unable to find role="button" with name /Entrar com Google/`).

- [ ] **Step 3: Implementar**

Em `apps/web/src/components/login-form.tsx`, acrescente o handler (depois de `handleSubmit`) e a UI (entre o `<h1>` e o bloco de error/alert):

```tsx
  async function handleGoogle() {
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
      if (authError) {
        setError(formatAuthError(authError.code));
      }
      // Em sucesso o redirectPlugin do better-auth navega o browser para o Google.
    } catch {
      setError(formatAuthError(undefined));
    } finally {
      setPending(false);
    }
  }
```

UI — imediatamente após `<h1 className="font-heading text-2xl font-bold">Entrar</h1>` e **antes** do bloco `{error ? … : null}`:

```tsx
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogle}
        disabled={pending}
      >
        <svg
          className="size-4"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M21.35 11.1h-9.17v2.98h5.3c-.23 1.4-1.63 4.1-5.3 4.1-3.19 0-5.8-2.64-5.8-5.88s2.61-5.88 5.8-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.8 3.86 14.68 2.9 12.18 2.9 7.03 2.9 2.85 7.08 2.85 12.23s4.18 9.33 9.33 9.33c5.39 0 8.95-3.78 8.95-9.11 0-.61-.07-1.08-.18-1.35z"
          />
        </svg>
        Entrar com Google
      </Button>
      <div className="relative text-center text-sm text-muted-foreground">
        <span className="relative z-10 bg-card px-2">ou com e-mail</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden="true" />
      </div>
```

(O divider usa `bg-card` — confira a variável de fundo do form na página (`page.tsx`/`layout.tsx`); se o card do form não usar `bg-card`, use a classe de fundo equivalente que esconda a linha atrás do texto. Acessibilidade: o divider é decorativo com `aria-hidden`.)

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components
pnpm --filter @ticketvibe/web exec tsc --noEmit
```
Expected: login-form 6/6 (4 prévios + 2 novos); suíte web completa PASS (130); tsc limpo. Os testes prévios do LoginForm (que clicam `name: 'Entrar'`) continuam verdes — nome de acessibilidade distinto.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/login-form.tsx apps/web/src/components/login-form.spec.tsx
git commit -m "feat(web): add google sign-in button to login form"
```

---

### Task 4: E2E do botão Google (modo simulado) + README + gates completos

**Files:**
- Create: `apps/web/tests/e2e/google.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Escrever o E2E**

`apps/web/tests/e2e/google.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const WEB = 'http://localhost:3000';

test('botão Google leva à authorize URL do Google (modo simulado)', async ({
  page,
}) => {
  await page.route('**://accounts.google.com/**', (route) => route.abort());

  await page.goto(`${WEB}/entrar`);
  await page.getByRole('button', { name: 'Entrar com Google' }).click();

  await page.waitForURL(/accounts\.google\.com/);
  const authorizeUrl = new URL(page.url());
  expect(authorizeUrl.pathname).toBe('/o/oauth2/v2/auth');
  expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
  expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
    `${WEB}/api/auth/callback/google`,
  );
  expect(authorizeUrl.searchParams.get('client_id')).toBeTruthy();
  expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
});
```

> **Modo simulado (D3):** o Playwright aborta a request para o domínio do Google — o teste prova a cadeia real botão → POST `/sign-in/social` (web) → proxy → API → authorize URL, sem consentimento externo. O consent/callback reais exigem credenciais Google de verdade (README, Step 3) e são cobertos pela integração simulada da Task 2.

- [ ] **Step 2: Rodar o E2E novo**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/web exec playwright test google
```
Expected: 1/1 PASS. API e web dev servers precisam estar no ar (mesmo setup do `auth.spec.ts` do ticket 08 — se a API subir manualmente, ela já nasce com o placeholder `DEV_GOOGLE_CLIENT_ID`, sem env extra).

- [ ] **Step 3: Documentar no README**

Em `README.md`, na seção "### Autenticação local (e-mail e senha)" (adicionada no ticket 08), acrescente ao final:

```markdown
#### Login com Google

O botão "Entrar com Google" usa Better Auth + provider social. Sem credenciais reais, o
redirect é montado com placeholders de dev (`ticketvibe-dev-client`) e o Google rejeita no
consentimento — suficiente para E2E e testes.

Para usar contas Google de verdade:

1. Crie um projeto em <https://console.cloud.google.com/apis/credentials> → OAuth client ID (tipo "Web application").
2. Em "Authorized redirect URIs", adicione `http://localhost:3000/api/auth/callback/google`.
3. Exporte as variáveis antes de subir a API:

| Variável | Default | Uso |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | `ticketvibe-dev-client` | client ID do OAuth (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | `ticketvibe-dev-secret` | client secret correspondente |
```

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
- lint: exit 0 (1 info pré-existente de `test-helpers.ts`)
- typecheck: 5/5
- test: shared 43, api **89** (83 atuais + 2 sign-in/social + 4 callback), web **130** (128 + 2)
- playwright: **18** (17 + 1 google)
- build: OK (sem rota nova — `login-form` modificado; `/entrar` continua ○)
- drizzle-kit check: limpo; git status drizzle: limpo

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/google.spec.ts README.md
git commit -m "test(web): cover google sign-in redirect end-to-end"
```

---

## Critérios de aceitação (ticket 09) → tasks

| Critério | Tasks |
|---|---|
| Provider Google configurado no Better Auth com credenciais de dev locais | 1 (placeholders D1) + 4 (README para credenciais reais) |
| Botão "Entrar com Google" na UI de login | 3 |
| Primeiro login cria usuário e sessão; logins seguintes reutilizam a conta (mesmo e-mail) | 2 (callback simulado: criação + reuse por sub) |
| Contas por e-mail e por Google convergem no mesmo usuário | 2 (teste de convergência) |
| Testes: integração do callback de auth, componente do botão, E2E com o provider em modo de teste/simulado | 2 (callback), 3 (componente), 4 (E2E simulado) |

## Fora de escopo (não fazer)

- Botão Google no `/cadastro` (deferral — critério fala em UI de login).
- Login social de outros providers (Apple, GitHub…); `socialProviders` aceita mas só google é configurado.
- Proteção de rotas/checkout por sessão (tickets 11–13).
- UI de "erro no callback" (`/api/auth/error`); o callback de erro do Better Auth redireciona sem página nossa dedicada.
- Ajuste de `playwright.config.ts`/`global-setup.ts` (D4 do ticket 08 preservado).
- Migração nova (nenhuma coluna nova — `user`/`account` do ticket 08 cobrem OAuth).
- Conta linking UI ("vincular Google à minha conta já logada") — Better Auth suporta internamente; UI fica para quando houver página de conta.

## Riscos conhecidos

1. **Better-auth 1.7.7 responde `/sign-in/social` com 200+Location (não 302)** — asserts da Task 1 fixam esse contrato; se um upgrade mudar, o teste quebra ruidosamente (bom).
2. **id_token fake sem assinatura** — `google.getUserInfo` decodes sem verificar (fato 5, dist `google.mjs:108-124`); se um upgrade começar a verificar, o teste de callback falhará e a Task 2 instrui inspecionar o comportamento real.
3. **`fetch` global stubado na Task 2** — só intercepta `oauth2.googleapis.com`; se better-auth ganhar outra chamada HTTP no callback (ex.: userinfo), ela cai no fetch real (fora do ar no CI? o teste falharia com erro claro — ajustar stub estendendo o matcher).
4. **Convergência por e-mail** depende de `link-account.mjs` do better-auth (biblioteca); o teste da Task 2 trava o comportamento observable (1 row, `emailVerified` upgradado) — se a lib mudar semântica, o teste falha antes do usuário.
5. **Placeholder no bundle de produção** (D1) — client id `ticketvibe-dev-client` não é segredo e não funciona fora do dev; quando houver deploy real, setar env é obrigatório (README).
6. **`afterEach` externo do spec** reseta o DB entre todos os testes — os helpers da Task 2 assumem fluxo completo por teste (não reaproveitam state entre its).
7. **Double-header pré-existente** (deferral do ticket 07) — o E2E da Task 4 não depende do header; nenhum locator novo colide.
