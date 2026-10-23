# Ticket 17 — Papel organizador + área do organizador — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O usuário ganha o papel `organizer` na mesma conta Better Auth, tem uma ferramenta local para ser promovido, e uma área `/organizador` com layout próprio protegida por papel — negando (403/denial) compradores e anônimos.

**Architecture:** Coluna `role` no `user` do mesmo banco (`'buyer' | 'organizer'`, default `'buyer'`), exposta no servidor via `additionalFields` do Better Auth com `input: false` (só servidor escreve) e no cliente via `inferAdditionalFields` manual (web e api são packages separados). O wrapper `createGetSession` propaga o papel; o módulo `organizer` da API recebe a rota `GET /organizer/session` protegida pelo guard puro `guardOrganizer` — é o alvo dos testes de integração de papel e o home dos endpoints F4. No web, `/organizador` usa um layout client-side com guard de papel (splash → redirect `/entrar` → denial), navegação própria e link no `AuthMenu` visível só para organizadores. Promoção via CLI local `pnpm --filter @ticketvibe/api db:promote-organizer <email>`.

**Tech Stack:** Better Auth 1.7 (`additionalFields` + `inferAdditionalFields`), drizzle-kit (migração única do ticket), Fastify 5, Next App Router client components, Playwright (helpers `podman psql` existentes).

**Spec:** `.scratch/ticketvibe/issues/17-papel-organizador-e-area-do-organizador.md` + `.scratch/ticketvibe/spec.md` (história 36; nota de produto: "um único usuário com papel `organizer` para o backoffice — sem sistema de contas separado")

## Global Constraints

- Idioma português; commits Conventional em inglês, imperativo; nada de `--no-verify`.
- Sem comentários de código.
- Testes API/web descritos em pt-BR.
- Migração única do ticket gerada por `pnpm --filter @ticketvibe/api db:generate` (drizzle-kit é a fonte do SQL — NÃO usar o CLI do Better Auth para gerar migration); conferir `drizzle-kit check` limpo.
- Sem nova dependência em nenhum package.
- `playwright.config.ts` / `global-setup.ts` do web NUNCA são tocados.
- `pnpm infra:down` PROIBIDO (infra de pé: postgres/redis/mailpit).
- Não tocar em `.github/`.
- Gatels: `pnpm lint`, `pnpm typecheck`, `pnpm test --force`, `pnpm --filter @ticketvibe/web test:e2e`, `pnpm build`.

## Review Focus

1. `additionalFields` ausente/errada na config do Better Auth → o papel nunca sai no objeto de sessão e o guard nunca vê `organizer` — **teste:** Task 1 (getSession reflete `buyer` no signup e `organizer` após a promoção no banco).
2. Campo com `input: true` por acidente → signup parametrizado se auto-promove — **teste:** Task 1 (signup com `role` no payload resulta `'buyer'`).
3. Sessão anônima nas rotas do backoffice → tratada como não-organizador (403, mesma resposta do comprador), nunca estoura/crash — **teste:** Task 2 (rota `/organizer/session` com sessão anônima → 403).
4. Flash do painel do organizador enquanto `isPending` antes do guard resolver — comprador vê conteúdo protegido por um instante — **teste:** Task 4 (durante pending a área renderiza splash, sem conteúdo do painel).
5. Promoção com e-mail inexistente termina em silêncio/sucesso mudo — **teste:** Task 3 (toool devolve `not_found` e o binário sai com exit ≠ 0 e mensagem clara).

---

### Task 1: Papel `organizer` no usuário Better Auth

**Files:**
- Modify: `apps/api/src/db/schema.ts` (tabela `user`, ~linhas 260-273)
- Modify: `apps/api/src/modules/auth/auth.ts` (config `createAuth`)
- Modify: `apps/api/src/modules/auth/get-session.ts`
- Create: `apps/api/drizzle/0012_<slug_gerado>.sql` (via drizzle-kit generate)
- Test: `apps/api/src/modules/auth/auth.integration.spec.ts` (extensões)

**Interfaces:**
- Consumes: tabela `user` existente; `createGetSession` (retorna `SessionUser`).
- Produces (consumido por Tasks 2–4):

```ts
// apps/api/src/modules/auth/get-session.ts
export type UserRole = 'buyer' | 'organizer';
export interface SessionUser {
  userId: string;
  email?: string | null;
  isAnonymous?: boolean;
  role: UserRole; // default 'buyer' quando o row não tem
}
```

Regras fixadas:
- Coluna: `role: text('role').notNull().default('buyer')` na tabela `user`.
- `createAuth`: `user: { additionalFields: { role: { type: 'string', required: false, defaultValue: 'buyer', input: false } } }` (`returned` fica no default `true` — o papel precisa sair na sessão).
- `createGetSession` propaga `role: session.user.role ?? 'buyer'` (normaliza ausente/valor fora do enum? NÃO normaliza outros valores — o papel vem da coluna confinada ao enum `'buyer' | 'organizer'`).

- [ ] **Step 1: Migração:** `pnpm --filter @ticketvibe/api db:generate` → novo arquivo `0012_*.sql` com a coluna; `pnpm --filter @ticketvibe/api db:migrate` em cima da infra de pé; `pnpm --filter @ticketvibe/api db:check`? (o comando de conferência é `drizzle-kit check` — rodar como `pnpm exec drizzle-kit check` no package) → limpo
- [ ] **Step 2: Testes que falham (pt-BR)** — extensões em `auth.integration.spec.ts` (seguir o padrão do arquivo para criar usuários):
  - "sessão de novo usuário traz papel buyer": signup → `getSession(headers)` ⇒ `{ ..., role: 'buyer' }`.
  - "signup não aceita papel no payload": signup com `role: 'organizer'` em `additionalData`/body ⇒ sessão continua `'buyer'`.
  - "promoção no banco reflete na sessão": `db.update(user).set({ role: 'organizer' }).where(email = ...)` → `getSession` ⇒ `'organizer'`.
  - "sessão anônima tem papel buyer": signup anônimo ⇒ `role: 'buyer'`.
- [ ] **Step 3:** Rodar `pnpm vitest run src/modules/auth/auth.integration.spec.ts` → FAIL (role ausente) → implementar coluna/config/wrapper → PASS
- [ ] **Step 4:** `pnpm --filter @ticketvibe/api test` →suíte da API passa (nenhum outro teste quebrado pelo novo campo `role`)
- [ ] **Step 5:** Commit: `feat(api): add organizer role to users`

---

### Task 2: Guard de papel + rota `GET /organizer/session`

**Files:**
- Create: `apps/api/src/modules/auth/role-guard.ts`
- Create: `apps/api/src/modules/organizer/routes/organizer.routes.ts`
- Modify: `apps/api/src/app.ts` (registrar `registerOrganizerRoutes`)
- Test: `apps/api/src/modules/auth/role-guard.spec.ts` (unit)
- Test: `apps/api/src/modules/organizer/routes/organizer.routes.integration.spec.ts`

**Interfaces:**
- Consumes: `SessionUser`/`GetSessionFn` (Task 1).
- Produces (Tasks 4/5 só via HTTP; Tickets 18–22 reusam o guard e o módulo):

```ts
// apps/api/src/modules/auth/role-guard.ts
export type OrganizerGuardResult =
  | { kind: 'ok' }
  | { kind: 'not_authenticated' }
  | { kind: 'not_organizer' };
export function guardOrganizer(session: SessionUser | null): OrganizerGuardResult
```

```ts
// apps/api/src/modules/organizer/routes/organizer.routes.ts
export function registerOrganizerRoutes(
  app: FastifyInstance,
  deps: { getSession: GetSessionFn },
): void
// GET /organizer/session:
//   not_authenticated → 401 { error: 'not_authenticated' }
//   not_organizer → 403 { error: 'not_organizer' }   // anônimo cai aqui (só a ausência total de sessão é 401)
//   ok → 200 { user: { id, email, role } }
```

- [ ] **Step 1: Testes unitários que falham (pt-BR)** — `role-guard.spec.ts`: `null` → `not_authenticated`; `isAnonymous: true` com `role: 'buyer'` → `not_organizer`; `role: 'buyer'` → `not_organizer`; `role: 'organizer'` → `ok`.
- [ ] **Step 2:** `pnpm vitest run src/modules/auth/role-guard.spec.ts` → FAIL → implementar guard → PASS
- [ ] **Step 3: Testes de integração que falham (pt-BR)** — `organizer.routes.integration.spec.ts` (seguir o padrão do spec de rotas de pedidos) com `buildApp`:
  - "organizador vê a própria sessão": usuário promovido chama `GET /organizer/session` com cookie ⇒ 200 + `{ user: { id, email, role: 'organizer' } }`.
  - "comprador é negado com 403": usuário comum ⇒ 403 `{ error: 'not_organizer' }`.
  - "sessão anônima é negada com 403": sessão anônima ⇒ 403 (mesmo corpo do comprador).
  - "sem sessão é 401": sem cookie ⇒ 401.
- [ ] **Step 4:** `pnpm vitest run src/modules/organizer/routes/organizer.routes.integration.spec.ts` → PASS
- [ ] **Step 5:** `pnpm --filter @ticketvibe/api test` → suíte inteira PASS
- [ ] **Step 6:** Commit: `feat(api): add organizer role guard and session route`

---

### Task 3: Ferramenta local de promoção

**Files:**
- Create: `apps/api/src/db/promote-organizer.ts`
- Modify: `apps/api/package.json` (script)
- Test: `apps/api/src/db/promote-organizer.integration.spec.ts`

**Interfaces:**
- Consumes: tabela `user` (Task 1).
- Produces:

```ts
// apps/api/src/db/promote-organizer.ts
export async function promoteOrganizerByEmail(
  db: Db,
  email: string,
): Promise<{ kind: 'promoted'; userId: string } | { kind: 'not_found' }>
// idempotente: usuário já organizer → { kind: 'promoted', userId } de novo
```

- Binário: no fim do arquivo, `loadEnvFile()` + `createDb()` + `promoteOrganizerByEmail(db, process.argv[2] ?? '')`; `not_found` → `console.error('Organizador não encontrado: <email>')` e `process.exitCode = 1`; `promoted` → `console.log('Usuário <email> agora é organizer')`; fechar `db.$client.end()`.
- Script no `apps/api/package.json`: `"db:promote-organizer": "tsx src/db/promote-organizer.ts"`.
- Uso: `pnpm --filter @ticketvibe/api db:promote-organizer <email>`.

- [ ] **Step 1: Testes de integração que falham (pt-BR)**:
  - "promove um usuário existente a organizer": inserir usuário com `role` default → promote ⇒ `{ kind: 'promoted', userId }` + row com `role: 'organizer'`.
  - "promoção é idempotente": promover duas vezes ⇒ segundo retorno igual ao primeiro, nada quebra.
  - "e-mail inexistente devolve not_found": promote com e-mail que não existe ⇒ `{ kind: 'not_found' }`.
- [ ] **Step 2:** `pnpm vitest run src/db/promote-organizer.integration.spec.ts` → FAIL → implementar → PASS
- [ ] **Step 3: Evidência manual do binário** (incluir no report): criar um usuário temporário por SQL helper, rodar `pnpm --filter @ticketvibe/api db:promote-organizer <email>` → log de sucesso e exit 0; rodar com e-mail inexistente → mensagem de erro e exit ≠ 0.
- [ ] **Step 4:** Commit: `feat(api): add organizer promotion tool`

---

### Task 4: Área `/organizador` no web com guard de papel

**Files:**
- Modify: `apps/web/src/lib/auth-client.ts` (plugin de inferência)
- Create: `apps/web/src/app/organizador/layout.tsx`
- Create: `apps/web/src/app/organizador/page.tsx`
- Create: `apps/web/src/components/organizador-nav.tsx`
- Create: `apps/web/src/components/acesso-negado.tsx`
- Modify: `apps/web/src/components/auth-menu.tsx` (link condicional)
- Test: `apps/web/src/components/organizador-nav.spec.tsx`
- Test: `apps/web/src/app/organizador/layout.spec.tsx`
- Test: `apps/web/src/components/auth-menu.spec.tsx` (novo)

**Interfaces:**
- Consumes: `authClient.useSession()` com `data.user.role` (plugin abaixo).
- Produces:

```ts
// apps/web/src/lib/auth-client.ts
plugins: [inferAdditionalFields({ user: { role: { type: 'string' } } }), anonymousClient()],
// forma manual porque web e api são packages separados (documentação Better Auth "Separate Client-Server Projects")
```

```ts
// apps/web/src/components/organizador-nav.tsx
function OrganizerNav(): ReactNode
// <nav aria-label="Navegação do organizador"> com links de um array constante; item único por agora: [{ href: '/organizador', label: 'Painel' }]
// destaque do link ativo via usePathname (mesmo padrão dos componentes de navegação existentes no repo)

// apps/web/src/app/organizador/layout.tsx ('use client')
function OrganizerLayout({ children }): ReactNode
// isPending → <p role="status">Carregando área do organizador...</p> (SEM conteúdo protegido)
// sem usuário → redirect('/entrar') e splash equivalente
// usuário com role !== 'organizer' → <AcessoNegado /> (sem redirect, sem children)
// organizer → children com <OrganizadorNav /> no layout

// apps/web/src/components/acesso-negado.tsx
function AcessoNegado(): ReactNode
// título "Acesso restrito", texto "Somente organizadores têm acesso a esta área." + link "Voltar para a home" → '/'
```

- `page.tsx` (server component): heading `Painel do organizador` + parágrafo vazio do dashboard (as páginas de gestão chegam nos tickets 18+); `<Header />` NÃO entra (a área tem layout próprio).
- `auth-menu.tsx`: quando `data.user.role === 'organizer'`, link adicional `Painel do organizador` → `/organizador` antes de "Minha conta".

- [ ] **Step 1: Auth plugin (tinta)**: ajustar `auth-client.ts` com `inferAdditionalFields` (formato manual acima) — `pnpm --filter @ticketvibe/web typecheck` limpo e web suite atual existente verde
- [ ] **Step 2: Testes que falham (pt-BR)** — `organizador-nav.spec.tsx`: renderiza um link 'Painel' com `aria-current="page"` em `/organizador` (e sem, em outra rota). `layout.spec.tsx` (com `vi.mock('@/lib/auth-client')`): pending → splash sem conteúdo; user buyer → `AcessoNegado` (heading "Acesso restrito") sem children; user organizer → children renderizados; sem usuário → chamou redirect '/entrar' (mock do `next/navigation`). `auth-menu.spec.tsx`: organizer vê link 'Painel do organizador'; buyer não vê.
- [ ] **Step 3:** Implementar componentes/páginas conforme acima seguindo os padrões estilísticos do repo (Tailwind, `cn`, `Button`)
- [ ] **Step 4:** `pnpm --filter @ticketvibe/web test` → PASS (suíte web completa)
- [ ] **Step 5:** Commit: `feat(web): gate organizer area by role`

---

### Task 5: E2E — organizador acessa, comprador é bloqueado

**Files:**
- Modify: `apps/web/tests/e2e/helpers/db.ts` (novo helper de promoção)
- Create: `apps/web/tests/e2e/organizer.spec.ts`

**Interfaces:**
- Consumes: `registerVerifiedBuyer` (helpers/auth.ts), helper `query(sql: string): string` de `helpers/db.ts` (executa via `podman exec ticketvibe-postgres psql` — mesmo padrão de `restoreSeat`/`backdateHold`).
- Produces:

```ts
// apps/web/tests/e2e/helpers/db.ts
export function promoteOrganizerByEmail(email: string): void
// query(`update "user" set role = 'organizer' where email = '<email>'`)
```

Roteiro fixado (um único `test`, dois contextos):
1. Contexto A: `registerVerifiedBuyer` com e-mail próprio do teste; `promoteOrganizerByEmail`; reload da página; `getByRole('link', { name: 'Painel do organizador' })` visível no header.
2. A navega para `/organizador` → heading `Painel do organizador` e `<nav aria-label="Navegação do organizador">` com o link 'Painel'.
3. Contexto B (novo `browser.newContext()`): outro comprador via `registerVerifiedBuyer` (SEM promoção); header sem link 'Painel do organizador'; navega `/organizador` → heading `Acesso restrito` e link 'Voltar para a home' visível.
4. Anonymous: contexto C limpo (sem login) navega `/organizador` → termina em `/entrar?...` (redirect do guard; usar `expect(page).toHaveURL(/entrar/)`).

- [ ] **Step 1:** Escrever helper + suíte conforme roteiro
- [ ] **Step 2:** `pnpm --filter @ticketvibe/web test:e2e organizer` → PASS
- [ ] **Step 3:** `pnpm --filter @ticketvibe/web test:e2e` → suíte completa PASS (nada regressou)
- [ ] **Step 4:** Commit: `test(web): verify organizer access and buyer denial end to end`

---

### Task 6: Gates finais + fechar a issue

**Files:**
- Modify: `.scratch/ticketvibe/issues/17-papel-organizador-e-area-do-organizador.md` (status done, checkboxes, tabelas, gates, deferrals)

- [ ] **Step 1:** `pnpm lint` → 0 erros
- [ ] **Step 2:** `pnpm typecheck` → todos os packages pass
- [ ] **Step 3:** `pnpm test --force` (infra de pé) → API/web/shared pass
- [ ] **Step 4:** `pnpm --filter @ticketvibe/web test:e2e` → todas pass
- [ ] **Step 5:** `pnpm build` → ok
- [ ] **Step 6:** Atualizar a issue 17 (checkboxes ✓, tabela de implementação/commits, tabela de gates com números reais, deferrals) — formato conforme issue 16 fechada
- [ ] **Step 7:** Commit: `docs: close ticket 17 organizer role and backoffice area`

## Deferrals conhecidos

- Nenhuma API de administração de papéis (painel para promover usuários) — a promoção é ferramenta local de ambiente de estudo por design deste ticket.
- Campos de organizador por evento (ex.: dono do evento, vínculo organizador↔evento) chegam com o CRUD de eventos (ticket 18).
