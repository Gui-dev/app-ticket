# Ticket 04 — Seed de eventos + home (destaque + eventos em alta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O banco ganha schema Drizzle + fixtures versionadas (categorias, locais, 12 eventos), a API expõe `GET /events` validada pelo contrato Zod do `packages/shared` (integração testada contra Postgres real), e a home do `apps/web` consome a rota em server components com Suspense para renderizar o hero em destaque e o carrossel "Eventos em Alta" — com testes unitários de use-case, integração de rota e componentes web (RTL + MSW).

**Architecture:** Camada de dados nova no `apps/api` (Drizzle ORM + `pg`, migrações geradas por drizzle-kit, seed idempotente) seguindo o layout hexagonal já planejado nos docs (`modules/events/{domain,infra,use-cases,routes}` + `src/db/` para client/helpers). O contrato Zod (`eventSchema`, `listEventsQuerySchema`, `listEventsResponseSchema`) nasce no `packages/shared` — fonte única web↔api, como o `healthResponseSchema`. No `apps/web`, a home é um server component que busca eventos com `fetch` sem cache **dentro de `<Suspense>`** (exigência do `cacheComponents` do Next 16), mapeia DTOs formatados (pt-BR/BRL, fuso `America/Sao_Paulo`) para `HeroCard`/`EventsSection` (client component com setas), reaproveitando `Header`, `EventCard` e os primitivos do ticket 03. A home instaura o contrato de teste de frontend do repo: vitest + jsdom + RTL + MSW (chegam agora — `apps/web` está 100% greenfield em testes).

**Tech Stack:** Fastify 5, Drizzle ORM 0.45 + drizzle-kit 0.31 + pg 8, Zod 4, Vitest 5, PostgreSQL 16 (podman), Next.js 16 (`cacheComponents: true`), React Testing Library 16, MSW 2, jsdom 30, Biome 2 + Lefthook, Turborepo/pnpm.

**Testing strategy (spec-driven):** o ticket exige os três níveis: (a) **unitários do caso de uso** — `list-events.use-case.spec.ts` com repositório in-memory; (b) **integração da rota com Postgres real** — `events.routes.integration.spec.ts` contra o banco `ticketvibe_test` (criado/migrado/resetado por helpers novos; exige `pnpm infra:up`); (c) **componente da home com MSW** — `events-api.spec.ts` intercepta o `fetch` com MSW e os componentes `HeroCard`/`EventsSection` são testados em RTL com props. Contrato: testes de schema no `packages/shared`. E2E Playwright continua no ticket 05 (docs/TESTING.md:63). **Coverage tooling fica fora** (decisão registrada em Scope notes).

**Environment facts (verified 2026-10-08):**

- HEAD `13180d0`, branch `main`, árvore limpa **exceto** `apps/web/src/app/page.tsx` modificado (tinkering local do ticket 03, não commitado) — a Task 1 o descarta com `git restore`. Convenção do repo: executar direto na `main`, sem worktree; commits locais nunca são pushados.
- Infra podman `ticketvibe-{postgres,redis,mailpit}` está **UP**; banco único `ticketvibe` (user/pass/db = `ticketvibe`) em `127.0.0.1:5432`. **Não existe** banco `ticketvibe_test`, nem migrações, nem camada de dados — `drizzle-orm`/`pg` não estão em nenhum `package.json` nem no lockfile. Nunca rodar `pnpm infra:down`.
- Não existe **nenhum** arquivo `.env*` no repo — convenção nova: defaults em código iguais aos do `compose.yaml` (nenhum env obrigatório, como o README já documenta).
- `apps/api`: Fastify 5, seam de teste `buildApp()` + `app.inject` (1 teste), TS 7.0.2, scripts `dev/typecheck/test`. `packages/shared`: exports TS cru (`workspace:*`), Zod 4.6.5 — `z.uuid()` e `z.iso.datetime()` confirmados nos `.d.ts` instalados (`zod/v4/classic/external.d.ts:16-17`).
- `apps/web`: Next 16.4 com **`cacheComponents: true`** — `fetch`/dados sem cache **fora de `<Suspense>` quebra o build** ("Next.js encountered uncached or runtime data during prerendering"; solução oficial: envolver em Suspense com fallback — o fetch só executa em request time). `tsconfig` tem `paths { "@/*": ["./src/*"] }` (o vitest config precisa do mesmo alias). Testes: **zero** — sem vitest/jsdom/RTL/MSW, sem script `test`.
- `vitest@5.0.3` tem peer `vite: ^6.4.0 || ^7.0.0 || ^8.0.0` (compatível com o `vite@8.3.4` do Storybook) e `jsdom: *`. `@testing-library/jest-dom@7` exporta `./vitest` (confirmado). `@testing-library/react@16` pede `@testing-library/dom@^10` (incluído).
- **MSW: usar `^2.15`** — os docs do repo (`docs/skills/TESTING_FRONTEND_GUIDELINE.md`) ensinam a API v2 (`http` de `'msw'`, `setupServer` de `'msw/node'`, `onUnhandledRequest: 'bypass'`). O MSW 3.0 (2026-09-29) mudou entrypoints para `msw/http` e renomeou opções; adotar v2 evita churn documental (decisão registrada).
- Design system do ticket 03 pronto: `Badge` (default = neon + `uppercase`), `Button` (default = `bg-brand-gradient`, sizes `sm|default|lg|icon`), `EventCard` (props fechadas, gradiente fallback inline), `Header` (não montado em lugar nenhum ainda), tokens (`--background #0a0716`, `--primary #00ff87`, `--card #1c1335`, `--border #2e2054`, `--radius 1rem`, shadows `card/primary/glow`, `font-heading` Poppins). **`EventCard` ainda não exporta o tipo `EventCardProps`** (a task 11 o adiciona).
- Mockups: `docs/layout/home.png` (header + hero "EM DESTAQUE" + chips de categoria) e `docs/layout/home-2.png` (seção "Eventos em Alta" com setas) — fonte do layout; os cards do carrossel já são o `EventCard` do ticket 03.
- Biome: single quotes, trailing commas, indent 2, import order corrigido no pre-commit; lefthook pre-push = `pnpm typecheck` + `pnpm test` (portanto a integração de rota passa a exigir infra de pé no push — convenção já prevista nos docs de teste).
- Commits: Conventional Commits em inglês, imperativo, sem ponto final; escopos `feat(shared)/feat(api)/feat(web)/chore(web)/docs`.

**Scope notes (decisões travadas — YAGNI/DSG):**

- **Rota única:** `GET /events?view=all|featured|hot` (sem prefixo `/api`, como o `/health`). `view=featured` alimenta o hero, `view=hot` o carrossel, `view=all` fica pronto para o ticket 05 (busca/filtros). Query inválida → `400 { error: 'invalid_query', issues }`.
- **Fora de escopo:** chips de categoria da home (mockup home.png) = ticket 05; setas/dots do carrossel do **hero** (mockup mostra 4 dots — o critério diz "evento em destaque" singular; a API já retorna lista para suportar isso no futuro); assets de imagem (`imageUrl` é `nullable`, hero/cards usam o gradiente); montar `Header` no `layout.tsx` (fica só na home — o `/_not-found` claro é deferral já registrado); stories novos no Storybook (o critério de testes deste ticket é RTL+MSW); provider Zod/OpenAPI do Fastify e coverage tooling (F-transversal / decisão registrada); arquivos `.env`; CORS (a home busca server-side).
- **Formatação na borda de exibição:** a API devolve `startsAt` ISO-8601 + `priceFromCents` inteiros; o mapper do web formata (`22 de Outubro, 2026` com fuso `America/Sao_Paulo`, `R$ 120,00` com NBSP normalizado). Nada de formatação no servidor da API.
- **Banco de teste:** `ticketvibe_test` (mesmos creds do compose), criado automaticamente pelos helpers; `resetDatabase` só aceita URLs terminadas em `/ticketvibe_test` (guarda contra truncar o dev). Integração: migrate idempotente no `beforeAll` + truncate/seed no `beforeEach`.
- **`buildApp` mantém compatibilidade:** assinatura vira `buildApp(options?: { eventsRepository?: EventsRepository })` — default `InMemory` vazio até a task 8, depois `DrizzleEventsRepository(createDb())`. O teste de health existente (`buildApp()` sem args) não muda; o Pool do pg é lazy (não conecta sem query).
- **`page.tsx` descartado:** o `page.tsx` sujo do ticket 03 é tinkering descartável (task 1 restaura ao HEAD; task 14 reescreve por completo).
- **Ordem das tasks 4 e 5:** a task 4 cria `src/db/client.ts` junto (o seed dele depende); a task 5 acrescenta os test-helpers. Siga a numeração.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/index.ts` | Modify | Contrato: `categorySchema`, `venueSchema`, `eventSchema`/`EventDto`, `listEventsQuerySchema`, `listEventsResponseSchema` + types |
| `packages/shared/src/index.spec.ts` | Modify | Testes dos novos schemas (TDD) |
| `apps/api/drizzle.config.ts` | Create | Config do drizzle-kit (dialect, schema, out, dbCredentials com default do compose) |
| `apps/api/drizzle/**` | Create | Migrações SQL geradas (`0000_*.sql` + `meta/`) — versionadas |
| `apps/api/src/db/schema.ts` | Create | Tabelas `categories`, `venues`, `events` (Drizzle pg-core) |
| `apps/api/src/db/client.ts` | Create | `createDb()` (Pool pg + drizzle), `Db`, `DEFAULT_DATABASE_URL`, `TEST_DATABASE_URL` |
| `apps/api/src/db/fixtures.ts` | Create | Fixtures versionadas: 7 categorias, 5 locais, 12 eventos |
| `apps/api/src/db/seed-fixtures.ts` | Create | `seedFixtures(db)` — delete + insert idempotente em transaction |
| `apps/api/src/db/seed.ts` | Create | Script CLI (`db:seed`) |
| `apps/api/src/db/test-helpers.ts` | Create | `assertTestDatabaseUrl`, `ensureTestDatabase`, `migrateTestDatabase`, `resetDatabase` |
| `apps/api/src/db/test-helpers.spec.ts` | Create | Teste unitário da guarda (não toca em banco) |
| `apps/api/src/modules/events/domain/event-entity.ts` | Create | `EventEntity`, `EventView` (derivado do contrato shared) |
| `apps/api/src/modules/events/domain/events-repository.ts` | Create | Interface `EventsRepository` |
| `apps/api/src/modules/events/infra/in-memory-events-repository.ts` | Create | Repo em memória (unit tests) |
| `apps/api/src/modules/events/infra/drizzle-events-repository.ts` | Create | Repo Drizzle (joins + filtro por view + ordenação por data) |
| `apps/api/src/modules/events/use-cases/list-events.use-case.ts` | Create | `ListEventsUseCase` |
| `apps/api/src/modules/events/use-cases/list-events.use-case.spec.ts` | Create | Unit tests do use-case |
| `apps/api/src/modules/events/routes/events.routes.ts` | Create | `GET /events` + `toEventDto` + validação da query |
| `apps/api/src/modules/events/routes/events.routes.spec.ts` | Create | Testes da rota com repo in-memory (200/400/views) |
| `apps/api/src/modules/events/routes/events.routes.integration.spec.ts` | Create | Integração com Postgres real (`ticketvibe_test`) |
| `apps/api/src/app.ts` | Modify | Aceitar `eventsRepository` opcional + registrar `registerEventRoutes` |
| `apps/api/package.json` | Modify | Deps (`drizzle-orm`, `pg`), devDeps (`drizzle-kit`, `@types/pg`), scripts `db:generate`/`db:migrate`/`db:seed` |
| `apps/web/package.json` | Modify | DevDeps (vitest, jsdom, RTL, jest-dom, msw), dep `@ticketvibe/shared`, script `test` |
| `apps/web/vitest.config.ts` | Create | Config vitest (jsdom, alias `@`, JSX automático, setupFiles, include `*.spec.tsx`) |
| `apps/web/src/test/setup.ts` | Create | `@testing-library/jest-dom/vitest` + `cleanup` |
| `apps/web/src/components/ui/badge.spec.tsx` | Create | Smoke do harness (RTL render) |
| `apps/web/src/lib/format.ts` | Create | `formatDatePtBR` (fuso São Paulo), `formatBRL` |
| `apps/web/src/lib/format.spec.ts` | Create | Testes dos formatters (inclui teste de fuso) |
| `apps/web/src/app/globals.css` | Modify | Utility `.bg-event-gradient` (mesmo gradiente do fallback do EventCard) |
| `apps/web/src/components/event-card.tsx` | Modify | Usar `.bg-event-gradient` (task 10) + exportar `EventCardProps` (task 11) |
| `apps/web/src/components/home/hero-card.tsx` | Create | Hero de destaque (pills, meta, título, descrição, CTA + preço) |
| `apps/web/src/components/home/hero-card.spec.tsx` | Create | RTL do hero |
| `apps/web/src/components/home/events-section.tsx` | Create | Seção "Eventos em Alta" (client: setas + scroll + cards) |
| `apps/web/src/components/home/events-section.spec.tsx` | Create | RTL da seção |
| `apps/web/src/lib/events-api.ts` | Create | `fetchEvents(view)` com `no-store`, parse do contrato, fallback `[]` |
| `apps/web/src/lib/events-api.spec.ts` | Create | MSW intercepta `GET /events` (sucesso, erro, rede) |
| `apps/web/src/lib/event-mapper.ts` | Create | `toHeroCardProps`, `toEventCardProps` |
| `apps/web/src/lib/event-mapper.spec.ts` | Create | Testes do mapping (formatos pt-BR/BRL) |
| `apps/web/src/app/page.tsx` | Modify (rewrite) | Home: `Header` + `Suspense` com `FeaturedSection`/`HighlightsSection` + skeletons |
| `README.md` | Modify | Quickstart (migrate/seed), smoke `/events`, rows de scripts db:, vars `DATABASE_URL`/`API_URL`, linha da estrutura da api |
| `docs/TESTING.md` | Modify | Estado atual (web com testes, integração live, hex live, coverage diferido) |
| `docs/skills/TESTING_API_GUIDELINE.md` | Modify | Linhas de status "chega no ticket 04" → live |
| `docs/skills/TESTING_FRONTEND_GUIDELINE.md` | Modify | Linhas de status "RTL+MSW chegam no 04" → instalados |
| `.scratch/ticketvibe/issues/04-seed-de-eventos-e-home.md` | Modify | `Status: done` + 5 checkboxes |
| `.scratch/ticketvibe/issues/05-busca-e-filtros-de-eventos.md` | Modify | Seção "Deferrals do ticket 04" |

---

## Tasks

### Task 1 — Preparação do workspace

**Files:** `apps/web/src/app/page.tsx` (restore), working tree

- [ ] `git restore apps/web/src/app/page.tsx` (descarta o tinkering de layout do ticket 03 — será reescrito na task 14)
- [ ] `podman ps --format '{{.Names}}'` → `ticketvibe-postgres`, `ticketvibe-redis`, `ticketvibe-mailpit` (3 containers UP; se `ticketvibe-postgres` não estiver no ar, `podman start ticketvibe-postgres` — nunca `pnpm infra:down`)
- [ ] `git rev-parse --short HEAD` → `13180d0`

**Expected:** working tree limpo; infra de pé; este é o único passo sem commit (é preparação, não altera arquivos versionáveis além do restore).

---

### Task 2 — Contrato Zod do listing (shared, TDD)

**Files:** `packages/shared/src/index.spec.ts` (Modify), `packages/shared/src/index.ts` (Modify)

Ordem TDD: escreva os testes novos primeiro, rode `pnpm --filter @ticketvibe/shared test` (red), depois implemente.

- [ ] Testes novos em `index.spec.ts` (8 expectativas novas):
  - `eventSchema`: aceita evento válido completo; rejeita `id` fora de UUID; rejeita evento sem `venue`; rejeita `priceFromCents` negativo
  - `listEventsQuerySchema`: aceita objeto vazio (usa default `all`); aceita cada view suportada (`all`, `featured`, `hot`); rejeita `view` desconhecido
  - `listEventsResponseSchema`: rejeita resposta cujo evento viola `eventSchema`
- [ ] Implementação em `index.ts` (depois do bloco do health):

```ts
export const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const venueSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
});

export const eventSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: categorySchema,
  venue: venueSchema,
  startsAt: z.iso.datetime(),
  priceFromCents: z.number().int().min(0),
  imageUrl: z.string().nullable(),
  badgeLabel: z.string().nullable(),
});

export type EventDto = z.infer<typeof eventSchema>;

export const listEventsQuerySchema = z.object({
  view: z.enum(['all', 'featured', 'hot']).optional().default('all'),
});

export type ListEventsQuery = z.input<typeof listEventsQuerySchema>;

export const listEventsResponseSchema = z.object({
  events: z.array(eventSchema),
});

export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;

export type EventsView = z.infer<typeof listEventsQuerySchema>['view'];
```

  - `EventsView` fica pronta para o client do web (task 12); o domínio do api mantém seu próprio alias `EventView` (task 6) para não acoplar o domínio ao nome web — as duas uniões são `all | featured | hot`.

- [ ] `pnpm --filter @ticketvibe/shared test` → verde

**Commit:** `feat(shared): add event listing contract schemas`

---

### Task 3 — Schema Drizzle + migrações (api)

**Files:** `apps/api/package.json` (Modify), `apps/api/drizzle.config.ts` (Create), `apps/api/src/db/schema.ts` (Create), `apps/api/drizzle/**` (Create, gerado)

- [ ] `pnpm --filter @ticketvibe/api add drizzle-orm@^0.45.4 pg@^8.23.1 && pnpm --filter @ticketvibe/api add -D drizzle-kit@^0.31.11 @types/pg@^8.23.1`
- [ ] Scripts em `apps/api/package.json`:
  - `"db:generate": "drizzle-kit generate"`
  - `"db:migrate": "drizzle-kit migrate"`
  - `"db:seed": "tsx src/db/seed.ts"`
- [ ] `apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe',
  },
});
```

- [ ] `apps/api/src/db/schema.ts`:

```ts
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const venues = pgTable('venues', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
});

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  priceFromCents: integer('price_from_cents').notNull(),
  imageUrl: text('image_url'),
  badgeLabel: text('badge_label'),
  featured: boolean('featured').notNull().default(false),
  isHot: boolean('is_hot').notNull().default(false),
});
```

- [ ] `pnpm --filter @ticketvibe/api db:generate` → `drizzle/0000_*.sql` (3 tabelas) + `drizzle/meta/`
- [ ] `pnpm --filter @ticketvibe/api db:migrate` → sucesso
- [ ] Verificação: `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -c '\dt'` lista `categories`, `venues`, `events`

**Commit:** `feat(api): add drizzle schema and migrations for events catalog`

---

### Task 4 — Fixtures versionadas + seed idempotente (api)

**Files:** `apps/api/src/db/client.ts` (Create), `apps/api/src/db/fixtures.ts` (Create), `apps/api/src/db/seed-fixtures.ts` (Create), `apps/api/src/db/seed.ts` (Create)

**Ordem:** criar primeiro `client.ts` (o seed depende dele), depois fixtures/seed.

- [ ] `apps/api/src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

const { Pool } = pg;

export const DEFAULT_DATABASE_URL =
  'postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe';

export const TEST_DATABASE_URL =
  'postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe_test';

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL) {
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema });
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] `apps/api/src/db/fixtures.ts` — 7 categorias, 5 locais, 12 eventos (ISO com offset explícito):

| slug | categoria | local | startsAt | priceFromCents | flags | badgeLabel |
|---|---|---|---|---|---|---|
| `o-fantasma-da-opera` | shows | teatro-renault | `2026-10-22T20:00:00-03:00` | 12000 | featured+hot | `Espetáculo Internacional` |
| `derby-capital` | esportes | allianz-parque | `2026-10-25T16:00:00-03:00` | 25000 | hot | `Últimos ingressos` |
| `corpo-em-movimento` | danca | espaco-unimed | `2026-10-30T19:30:00-03:00` | 15000 | — | `null` |
| `standup-noite-de-verdades` | comedy | espaco-unimed | `2026-11-05T21:00:00-03:00` | 9000 | hot | `Estreia` |
| `corrida-de-rua-sp` | esportes | parque-olimpico | `2026-11-08T07:00:00-03:00` | 5000 | — | `null` |
| `pequeno-principe-musical` | infantil | teatro-renault | `2026-11-15T15:00:00-03:00` | 7000 | — | `null` |
| `neon-lights-world-tour` | shows | espaco-unimed | `2026-11-18T20:00:00-03:00` | 18000 | featured+hot | `Esgotando Lote` |
| `sertaneja-rio` | shows | vivo-rio | `2026-11-28T22:00:00-03:00` | 22000 | hot | `null` |
| `cyberpunk-electronic-festival` | festivais | parque-olimpico | `2026-12-05T14:00:00-03:00` | 29000 | featured+hot | `Festival 3 Dias` |
| `melhor-de-standup-grand-finale` | comedy | espaco-unimed | `2026-12-12T21:00:00-03:00` | 11000 | — | `null` |
| `a-hora-e-a-vez` | teatro | teatro-renault | `2026-12-18T20:00:00-03:00` | 14000 | — | `null` |
| `festival-de-verao` | festivais | vivo-rio | `2027-01-16T14:00:00-03:00` | 32000 | — | `null` |

  - Categorias: `shows` Shows, `esportes` Esportes, `teatro` Teatro, `festivais` Festivais, `comedy` Comédia, `infantil` Infantil, `danca` Dança.
  - Locais: `teatro-renault` (São Paulo/SP), `allianz-parque` (São Paulo/SP), `parque-olimpico` (São Paulo/SP), `espaco-unimed` (São Paulo/SP), `vivo-rio` (Rio de Janeiro/RJ). Todos `city`/`state` preenchidos; `slug` é chave natural.
  - Descrições curtas em pt-BR (1–2 frases) por evento; `imageUrl: null` em todos (assets são deferral).
  - **Invariante p/ testes:** `featured` em ordem de data = `['o-fantasma-da-opera', 'neon-lights-world-tour', 'cyberpunk-electronic-festival']`; `hot` em ordem de data = `['o-fantasma-da-opera', 'derby-capital', 'standup-noite-de-verdades', 'neon-lights-world-tour', 'sertaneja-rio', 'cyberpunk-electronic-festival']` (6 eventos).
- [ ] `apps/api/src/db/seed-fixtures.ts` — `seedFixtures(db: Db)`:

```ts
export async function seedFixtures(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(events);
    await tx.delete(venues);
    await tx.delete(categories);

    const insertedCategories = await tx
      .insert(categories)
      .values(categoryFixtures)
      .returning();
    const categoryIds = new Map(
      insertedCategories.map((row) => [row.slug, row.id]),
    );

    const insertedVenues = await tx
      .insert(venues)
      .values(venueFixtures)
      .returning();
    const venueIds = new Map(insertedVenues.map((row) => [row.slug, row.id]));

    for (const fixture of eventFixtures) {
      const categoryId = categoryIds.get(fixture.categorySlug);
      const venueId = venueIds.get(fixture.venueSlug);
      if (!categoryId || !venueId) {
        throw new Error(
          `Missing category or venue for event "${fixture.slug}"`,
        );
      }
      await tx.insert(events).values({
        slug: fixture.slug,
        title: fixture.title,
        description: fixture.description,
        categoryId,
        venueId,
        startsAt: new Date(fixture.startsAt),
        priceFromCents: fixture.priceFromCents,
        imageUrl: fixture.imageUrl,
        badgeLabel: fixture.badgeLabel,
        featured: fixture.featured,
        isHot: fixture.isHot,
      });
    }
  });
}
```

- [ ] `apps/api/src/db/seed.ts`:

```ts
import { createDb } from './client.js';
import { seedFixtures } from './seed-fixtures.js';

const db = createDb();

try {
  await seedFixtures(db);
  console.log('Seed completed: 7 categories, 5 venues, 12 events.');
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
```

- [ ] `pnpm --filter @ticketvibe/api db:seed` → mensagem de sucesso
- [ ] Idempotência: rodar de novo → mesmo sucesso; contagens via `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -c "SELECT (SELECT count(*) FROM categories), (SELECT count(*) FROM venues), (SELECT count(*) FROM events);"` → `7 | 5 | 12` nas duas execuções
- [ ] `pnpm lint` → verde

**Commit:** `feat(api): add versioned catalog seed fixtures`

---

### Task 5 — Database client + test helpers (api, TDD da guarda)

**Files:** `apps/api/src/db/test-helpers.spec.ts` (Create), `apps/api/src/db/test-helpers.ts` (Create)

- [ ] TDD: primeiro `test-helpers.spec.ts` — `assertTestDatabaseUrl('postgres://user:pass@127.0.0.1:5432/ticketvibe')` lança `/Refusing/`; `assertTestDatabaseUrl(TEST_DATABASE_URL)` não lança (2 testes). `pnpm --filter @ticketvibe/api test` → red.
- [ ] `apps/api/src/db/test-helpers.ts`:

```ts
import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { TEST_DATABASE_URL, type Db } from './client.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
```

  - `assertTestDatabaseUrl(url: string): void` — `if (!url.endsWith('/ticketvibe_test')) throw new Error('Refusing to run test helper against non-test database: ' + url)` (guarda anti-truncamento do dev)
  - `ensureTestDatabase(url = TEST_DATABASE_URL): Promise<void>` — `Client` admin apontando para o mesmo host/porta mas banco `postgres` (construir via `new URL(url)` → `pathname = '/postgres'`), `CREATE DATABASE "<nome>"`, catch e ignora erro PostgreSQL code `42P04` (database exists), `finally { client.end() }`
  - `migrateTestDatabase(db: Db): Promise<void>` — `await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })` (idempotente: a tabela `__drizzle_migrations` protege reexecução)
  - `resetDatabase(db: Db): Promise<void>` — chama `assertTestDatabaseUrl(db.$client.options.connectionString)`; `await db.execute(sql\`TRUNCATE TABLE events, venues, categories RESTART IDENTITY CASCADE\`)` (importar `sql` de `drizzle-orm`)
  - Import de módulo: `import { fileURLToPath } from 'node:url';` no topo (node prefix)
  - Nota: importar **apenas** `{ TEST_DATABASE_URL, type Db }` de `./client.js` — o Biome acusa import não usado (`createDb` é desnecessário aqui; os specs criam o db)
- [ ] `pnpm --filter @ticketvibe/api test` → verde (guarda)
- [ ] Smoke opcional mas recomendado: no `tsx`/repl ou num teste temporário, `await ensureTestDatabase()` + `createDb(TEST_DATABASE_URL)` + `migrateTestDatabase` — deve criar o banco `ticketvibe_test` (`podman exec ... psql -U ticketvibe -l | rg ticketvibe_test`) e as 3 tabelas. Remova o teste temporário antes do commit (o smoke real acontece na task 8).

**Commit:** `feat(api): add database client and test helpers`

---

### Task 6 — Domínio + repo in-memory + use-case (api, TDD)

**Files:** `apps/api/src/modules/events/domain/event-entity.ts` (Create), `domain/events-repository.ts` (Create), `infra/in-memory-events-repository.ts` (Create), `use-cases/list-events.use-case.ts` (Create), `use-cases/list-events.use-case.spec.ts` (Create)

- [ ] TDD: escrever primeiro `list-events.use-case.spec.ts` (4 testes) com 3 eventos in-memory: `featured` → só os marcados, ordenados por data; `hot` → só os marcados, ordenados por data; `all` → todos ordenados por data; default (query vazia) → igual a `all`. Ordenação esperada por data, p. ex. `['destaque', 'comum', 'em-alta']` conforme as datas dos stubs. → red.
- [ ] `domain/event-entity.ts`:

```ts
import type { ListEventsQuery } from '@ticketvibe/shared';

export type EventView = NonNullable<ListEventsQuery['view']>;

export interface EventEntity {
  id: string;
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  startsAt: Date;
  priceFromCents: number;
  imageUrl: string | null;
  badgeLabel: string | null;
  featured: boolean;
  isHot: boolean;
}
```

- [ ] `domain/events-repository.ts`: `export interface EventsRepository { findAll(view: EventView): Promise<EventEntity[]> }`
- [ ] `infra/in-memory-events-repository.ts`: classe com `constructor(private readonly items: EventEntity[])`; `findAll(view)` filtra (`all` → nada; `featured` → `featured === true`; `hot` → `isHot === true`) e retorna `[...filtered].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())` (cópia — não mutar o array do caller)
- [ ] `use-cases/list-events.use-case.ts`:

```ts
export class ListEventsUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  async execute(query: ListEventsQuery): Promise<EventEntity[]> {
    return this.eventsRepository.findAll(query.view ?? 'all');
  }
}
```

- [ ] `pnpm --filter @ticketvibe/api test` → verde; `pnpm lint` → verde (evite ternário aninhado; Biome reclama)

**Commit:** `feat(api): add list events use case`

---

### Task 7 — Rota GET /events (api, TDD com repo in-memory)

**Files:** `apps/api/src/modules/events/routes/events.routes.ts` (Create), `events.routes.spec.ts` (Create), `apps/api/src/app.ts` (Modify)

- [ ] TDD: `events.routes.spec.ts` usa `buildApp({ eventsRepository: new InMemoryEventsRepository([...]) })` + `app.inject` (4 testes):
  - `GET /events` → 200, todos os eventos (ordenados por data)
  - `GET /events?view=featured` → 200, só os marcados
  - `GET /events?view=hot` → 200, só os marcados
  - `GET /events?view=bogus` → 400, body com `error: 'invalid_query'` e `issues`
  - → red (rota ainda não existe; `app.ts` ainda não aceita opções)
- [ ] `routes/events.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import {
  listEventsQuerySchema,
  type EventDto,
} from '@ticketvibe/shared';

import type { EventEntity } from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';
import { ListEventsUseCase } from '../use-cases/list-events.use-case.js';

function toEventDto(entity: EventEntity): EventDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    category: { slug: entity.categorySlug, name: entity.categoryName },
    venue: { name: entity.venueName, city: entity.venueCity, state: entity.venueState },
    startsAt: entity.startsAt.toISOString(),
    priceFromCents: entity.priceFromCents,
    imageUrl: entity.imageUrl,
    badgeLabel: entity.badgeLabel,
  };
}
```

  - Obs.: `EventEntity` já tem `categorySlug` (definido na task 6) — o DTO exige `category: { slug, name }`.
  - `export async function registerEventRoutes(app: FastifyInstance, eventsRepository: EventsRepository): Promise<void>`:
    - `const useCase = new ListEventsUseCase(eventsRepository);`
    - `app.get('/events', async (request, reply) => {` … `const parsed = listEventsQuerySchema.safeParse(request.query);` se `!parsed.success` → `reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues })`; senão `const list = await useCase.execute(parsed.data); return { events: list.map(toEventDto) };` `});`
- [ ] `app.ts`: `buildApp(options: { eventsRepository?: EventsRepository } = {})` — `const eventsRepository = options.eventsRepository ?? new InMemoryEventsRepository([]);` (default provisório; a task 8 troca por Drizzle), `await app.register(registerEventRoutes, eventsRepository)`… na verdade chame `await registerEventRoutes(app, eventsRepository)` direto (o registro é função, não plugin — mantê-lo simples; se preferir plugin, `app.register(async (instance) => { await registerEventRoutes(instance, eventsRepository); })`). Preserve `GET /health` intacto.
- [ ] `pnpm --filter @ticketvibe/api test` → verde (health + 4 rota + use-case + guarda)

**Commit:** `feat(api): add GET /events route`

---

### Task 8 — Repositório Drizzle + integração com Postgres real (api, TDD)

**Files:** `apps/api/src/modules/events/infra/drizzle-events-repository.ts` (Create), `routes/events.routes.integration.spec.ts` (Create), `apps/api/src/app.ts` (Modify)

- [ ] TDD: `events.routes.integration.spec.ts`:

```ts
beforeAll(async () => {
  await ensureTestDatabase();
  testDb = createDb(TEST_DATABASE_URL);
  await migrateTestDatabase(testDb);
  await seedFixtures(testDb);
  app = buildApp({ eventsRepository: new DrizzleEventsRepository(testDb) });
  await app.ready();
});

beforeEach(async () => {
  await resetDatabase(testDb);
  await seedFixtures(testDb);
});

afterAll(async () => {
  await app.close();
  await testDb.$client.end();
});
```

  - 4 testes com arrays **exatos** de slugs (usa o invariante da task 4):
    - `GET /events` → 200, `events.length === 12`, ids/slug ordenados por data
    - `GET /events?view=featured` → slugs exatos `['o-fantasma-da-opera', 'neon-lights-world-tour', 'cyberpunk-electronic-festival']`
    - `GET /events?view=hot` → slugs exatos `['o-fantasma-da-opera', 'derby-capital', 'standup-noite-de-verdades', 'neon-lights-world-tour', 'sertaneja-rio', 'cyberpunk-electronic-festival']`
    - após reseed duplo (chamar `seedFixtures` mais uma vez) → continua 12 eventos (idempotência no caminho de teste)
  - → red primeiro (repo Drizzle não existe)
- [ ] `infra/drizzle-events-repository.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';

import { categories, events, venues } from '../../../db/schema.js';
import type { EventEntity, EventView } from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';

function buildViewCondition(view: EventView) {
  if (view === 'featured') return eq(events.featured, true);
  if (view === 'hot') return eq(events.isHot, true);
  return undefined;
}

export class DrizzleEventsRepository implements EventsRepository {
  constructor(private readonly db: Db) {}

  async findAll(view: EventView): Promise<EventEntity[]> {
    const condition = buildViewCondition(view);
    const rows = await this.db
      .select({ /* colunas nomeadas */ })
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(condition)
      .orderBy(asc(events.startsAt));
    return rows.map(toEventEntity);
  }
}
```

  - `where(condition)` com `undefined` é aceito pelo Drizzle (sem predicado). Se o lint reclamar, use `condition ? .where(condition) : ...` encadeado.
  - `toEventEntity(row)` mapeia `startsAt: Date` (modo `date` do Drizzle) e `categorySlug: row.categories.slug`, `categoryName: row.categories.name`, `venueName/city/state: row.venues.*`.
- [ ] `app.ts`: default passa a ser `new DrizzleEventsRepository(createDb())` (importar de `./modules/events/infra/drizzle-events-repository.js` e `createDb` de `./db/client.js`). O `buildApp()` sem args do teste de health continua funcionando (Pool lazy; sem query, sem conexão).
- [ ] `pnpm --filter @ticketvibe/api test` → verde (integração exige `ticketvibe-postgres` no ar — já está)
- [ ] Smoke manual: `pnpm --filter @ticketvibe/api dev` em background → `curl -s 'http://127.0.0.1:3001/events?view=featured' | head -c 400` (JSON com os 3 eventos); matar o `tsx watch` (ex.: `pkill -f '[t]sx.*api'` ou `kill <pid>`)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` (raiz) → todos verdes

**Commit:** `feat(api): integrate events route with postgres`

---

### Task 9 — Harness de testes do web + formatters (TDD, 2 commits)

**Files:** `apps/web/package.json` (Modify), `apps/web/vitest.config.ts` (Create), `apps/web/src/test/setup.ts` (Create), `apps/web/src/components/ui/badge.spec.tsx` (Create), `apps/web/src/lib/format.ts` (Create), `apps/web/src/lib/format.spec.ts` (Create)

**Commit 9a — `chore(web): set up vitest with react testing library`:**

- [ ] `pnpm --filter @ticketvibe/web add @ticketvibe/shared@workspace:*`
- [ ] `pnpm --filter @ticketvibe/web add -D vitest@^5.0.3 jsdom@^30.1.2 @testing-library/react@^16.3.3 @testing-library/dom@^10.4.2 @testing-library/jest-dom@^7.0.1 msw@^2.15.0`
- [ ] Script `"test": "vitest run"` em `apps/web/package.json`
- [ ] `apps/web/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

  - Alias idêntico ao `paths { "@/*": ["./src/*"] }` do tsconfig; `jsx: 'automatic'` evita dependência do tsconfig do Next dentro do vitest.
- [ ] `apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] Smoke `src/components/ui/badge.spec.tsx`: render de `<Badge>TicketVibe</Badge>` → `expect(screen.getByText('TicketVibe')).toBeInTheDocument()` (valida o harness, não a feature)
- [ ] `pnpm --filter @ticketvibe/web test` → 1 teste verde

**Commit 9b — `feat(web): add pt-br date and currency formatters`:**

- [ ] TDD: `src/lib/format.spec.ts` primeiro (5 testes), red → implementar `format.ts` → green:
  - `formatDatePtBR('2026-10-22T20:00:00-03:00')` → `'22 de Outubro, 2026'`
  - fuso: `formatDatePtBR('2026-10-23T02:00:00Z')` → `'22 de Outubro, 2026'` (UTC 02:00 = 23h de 22/10 em São Paulo — valida `timeZone: 'America/Sao_Paulo'`)
  - `formatDatePtBR('2026-12-05T14:00:00-03:00')` → `'05 de Dezembro, 2026'`
  - `formatBRL(12000)` → `'R$ 120,00'`
  - `formatBRL(18990)` → `'R$ 189,90'`
- [ ] `apps/web/src/lib/format.ts`:

```ts
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDatePtBR(isoDate: string): string {
  const formatted = dateFormatter.format(new Date(isoDate));
  const [day, month, year] = formatted.split(' de ');
  return `${day} de ${capitalize(month)}, ${year}`;
}

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100).replace(/\u00a0/g, ' ');
}
```

  - `.replace(/\u00a0/g, ' ')` — o Intl emite NBSP entre "R$" e o número; normaliza para espaço comum (assert de igualdade simples nos testes).
- [ ] `pnpm --filter @ticketvibe/web test` → verdes

---

### Task 10 — HeroCard (web, TDD)

**Files:** `apps/web/src/app/globals.css` (Modify), `apps/web/src/components/event-card.tsx` (Modify), `apps/web/src/components/home/hero-card.tsx` (Create), `hero-card.spec.tsx` (Create)

- [ ] `globals.css`: dentro de `@layer components`, adicionar a utility (mesmo gradiente do fallback do EventCard, agora compartilhado):

```css
.bg-event-gradient {
  background-image: linear-gradient(
    135deg,
    #2e2054 0%,
    #1c1335 55%,
    #0a2a1e 100%
  );
}
```

  - `event-card.tsx`: trocar a classe arbitrária `bg-[linear-gradient(135deg,#2e2054_0%,#1c1335_55%,#0a2a1e_100%)]` (linha do fallback, hoje hardcoded no JSX) pela utility `bg-event-gradient` (DRY; gradiente idêntico — sem mudança visual).
- [ ] TDD: `hero-card.spec.tsx` primeiro (4 testes), red:
  1. render com `badgeLabel: 'Espetáculo Internacional'` → pill `'EM DESTAQUE'` (Badge default) **e** o badge customizado aparecem
  2. `h1` com o título exato; sem `badgeLabel` → pill mostra `categoryName`
  3. data (`'22 de Outubro, 2026'`), local (`'Teatro Renault, SP'`), descrição presentes
  4. preço (`'A partir de R$ 120,00'`) e botão `'Garantir Ingressos'` presentes
- [ ] `apps/web/src/components/home/hero-card.tsx`:

```tsx
import { CalendarDays, MapPin, Ticket } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface HeroCardProps {
  badgeLabel?: string;
  categoryName: string;
  dateLabel: string;
  venueLabel: string;
  title: string;
  description: string;
  priceLabel: string;
  imageSrc?: string;
}

export function HeroCard(props: HeroCardProps): React.ReactElement {
  return (
    <section className="relative isolate min-h-[26rem] overflow-hidden rounded-2xl border border-border p-6 shadow-card sm:p-10">
      <div aria-hidden className="bg-event-gradient absolute inset-0 -z-10" />
      {props.imageSrc ? (
        <img
          src={props.imageSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/60 to-background/10"
      />
      <div className="flex min-h-[20rem] flex-col">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>EM DESTAQUE</Badge>
          <Badge variant="secondary">{props.badgeLabel ?? props.categoryName}</Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            {props.dateLabel}
          </span>
          <span aria-hidden>•</span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-primary" aria-hidden />
            {props.venueLabel}
          </span>
        </div>
        <h1 className="mt-6 font-heading text-4xl font-bold sm:text-5xl lg:text-6xl">
          {props.title}
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{props.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-4 pt-8">
          <Button size="lg" className="shadow-primary">
            <Ticket aria-hidden />
            Garantir Ingressos
          </Button>
          <span className="rounded-full border border-border bg-card/70 px-4 py-1.5 text-sm">
            A partir de{' '}
            <span className="font-semibold text-primary">{props.priceLabel}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

export type { HeroCardProps };
```

  - **Não importe `cn`** (não usado — Biome acusa); `img` com `alt=""` + `aria-hidden` (decorativo).
  - Sem controles de carrossel/dots (fora de escopo — API já retorna lista; deferral registrado na task 16).
- [ ] `pnpm --filter @ticketvibe/web test` → verde; `pnpm build` (web) → verde (gate do buildComponents — o hero ainda não é montado na página, mas o componente precisa compilar)

**Commit:** `feat(web): add home hero card`

---

### Task 11 — EventsSection "Eventos em Alta" (web, TDD)

**Files:** `apps/web/src/components/event-card.tsx` (Modify — export do tipo), `apps/web/src/components/home/events-section.tsx` (Create), `events-section.spec.tsx` (Create)

- [ ] `event-card.tsx`: adicionar `export` ao tipo já declarado — `export type EventCardProps = { ... }` (a task 11 importa esse tipo)
- [ ] TDD: `events-section.spec.tsx` (3 testes), red — no `beforeEach`, espiar o scroll: `vi.spyOn(Element.prototype, 'scrollBy').mockImplementation(() => {})` (o jsdom não implementa `scrollBy`; `vi.restoreAllMocks()` no `afterEach`):
  1. heading `'Eventos em Alta'` + subtítulo `'Os ingressos mais procurados nas últimas 24 horas'`
  2. `fireEvent.click(screen.getByRole('button', { name: 'Rolar para a direita' }))` → `scrollBy` chamado com `{ left: 344, behavior: 'smooth' }`; e a seta esquerda idem com `left: -344`
  3. `cards: []` → mensagem `'Nenhum evento em alta no momento.'` e setas **ausentes**
- [ ] `apps/web/src/components/home/events-section.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { ArrowLeft, ArrowRight, Zap } from 'lucide-react';

import { EventCard, type EventCardProps } from '@/components/event-card';
import { Button } from '@/components/ui/button';

const CARD_STEP_PX = 344;

export function EventsSection({ cards }: { cards: EventCardProps[] }) {
  const rowRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    rowRef.current?.scrollBy({ left: direction * CARD_STEP_PX, behavior: 'smooth' });
  };

  return (
    <section aria-labelledby="highlights-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="highlights-heading"
            className="flex items-center gap-3 font-heading text-3xl font-bold"
          >
            <Zap className="size-7 fill-primary text-primary" aria-hidden />
            Eventos em Alta
          </h2>
          <p className="mt-2 text-muted-foreground">
            Os ingressos mais procurados nas últimas 24 horas
          </p>
        </div>
        {cards.length > 0 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Rolar para a esquerda"
              onClick={() => scrollBy(-1)}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Rolar para a direita"
              onClick={() => scrollBy(1)}
            >
              <ArrowRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      {cards.length > 0 ? (
        <div
          ref={rowRef}
          className="flex gap-6 overflow-x-auto pb-2 [scrollbar-width:none]"
        >
          {cards.map((card) => (
            <EventCard key={card.title} {...card} className="shrink-0" />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Nenhum evento em alta no momento.</p>
      )}
    </section>
  );
}
```

  - A prop `className` já existe em `EventCardProps` (desde o ticket 03) e é aplicada via `cn(...)` — nenhum cambio necessário no componente além do export do tipo (passo 1 desta task).
- [ ] `pnpm --filter @ticketvibe/web test` → verde

**Commit:** `feat(web): add highlights carousel section`

---

### Task 12 — Client fetchEvents + MSW (web, TDD)

**Files:** `apps/web/src/lib/events-api.ts` (Create), `events-api.spec.ts` (Create)

- [ ] TDD: `events-api.spec.ts` primeiro (3 testes), red — `setupServer` do `msw/node` com `server.listen({ onUnhandledRequest: 'bypass' })`, `afterEach(() => server.close())` (ou `resetHandlers`), `vi.spyOn(console, 'error').mockImplementation(() => {})` + `afterEach(vi.restoreAllMocks)`:
  1. handler `http.get('http://localhost:3001/events', ({ request }) => { const view = new URL(request.url).searchParams.get('view'); if (view === 'featured') return HttpResponse.json({ events: [validEventFixture] }); if (view === 'hot') return HttpResponse.json({ events: [] }); return new HttpResponse(null, { status: 404 }); })` → `fetchEvents('featured')` retorna o evento parseado pelo contrato
  2. `fetchEvents('hot')` → `[]` (resposta válida vazia)
  3. handler padrão (fora dos `if`) → 404 → `fetchEvents('all')` lança? **Não** — 404 dispara o `catch` → `console.error` chamado e retorna `[]`. Assert: `expect(result).toEqual([])` + `expect(console.error).toHaveBeenCalled()`
  - Fixture do evento: objeto válido para `listEventsResponseSchema` (pode reutilizar o shape dos specs do shared, com `startsAt: '2026-10-22T23:00:00Z'` etc.)
- [ ] `apps/web/src/lib/events-api.ts`:

```ts
import { listEventsResponseSchema, type EventDto, type EventsView } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type { EventDto };

export async function fetchEvents(view: EventsView): Promise<EventDto[]> {
  try {
    const response = await fetch(`${API_URL}/events?view=${view}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Unexpected status ${response.status}`);
    const payload = listEventsResponseSchema.parse(await response.json());
    return payload.events;
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return [];
  }
}
```

  - `EventsView` vem do shared (exportada na task 2) — `EventView` do domínio do api é o mesmo literal; manter os dois nomes (web x domínio) é intencional.
  - `cache: 'no-store'` — obrigatório para o conteúdo não ficar stale no RSC (e compatível com `cacheComponents` dentro de Suspense).
- [ ] `pnpm --filter @ticketvibe/web test` → verde

**Commit:** `feat(web): add events api client`

---

### Task 13 — Mapper DTO → view models (web, TDD)

**Files:** `apps/web/src/lib/event-mapper.ts` (Create), `event-mapper.spec.ts` (Create)

- [ ] (O `EventCardProps` já é exportado desde a task 11 — nada a fazer no componente.)
- [ ] TDD: `event-mapper.spec.ts` primeiro (4 testes), red:
  1. `toHeroCardProps(eventoFeatured)` → `{ categoryName: 'Shows', dateLabel: '22 de Outubro, 2026', venueLabel: 'Teatro Renault, SP', priceLabel: 'R$ 120,00', title, description, badgeLabel: 'Espetáculo Internacional', imageSrc: undefined }` (com `imageUrl: null` → `imageSrc: undefined`; com imageUrl → a string)
  2. sem `badgeLabel` → `badgeLabel: undefined` (o hero faz fallback p/ `categoryName`)
  3. `toEventCardProps(evento)` → `{ category: 'Shows', venue: 'Teatro Renault', date: '22 de Outubro, 2026', price: 'R$ 120,00', title, description }`
  4. evento com `startsAt` em UTC véspera → dateLabel do fuso de SP (usa o mesmo fixture do teste de fuso do format)
- [ ] `apps/web/src/lib/event-mapper.ts`:

```ts
import type { EventDto } from '@ticketvibe/shared';

import { formatBRL, formatDatePtBR } from '@/lib/format';
import type { EventCardProps } from '@/components/event-card';

export function toHeroCardProps(event: EventDto) {
  return {
    badgeLabel: event.badgeLabel ?? undefined,
    categoryName: event.category.name,
    dateLabel: formatDatePtBR(event.startsAt),
    venueLabel: `${event.venue.name}, ${event.venue.state}`,
    title: event.title,
    description: event.description,
    priceLabel: formatBRL(event.priceFromCents),
    imageSrc: event.imageUrl ?? undefined,
  };
}

export function toEventCardProps(event: EventDto): EventCardProps {
  return {
    category: event.category.name,
    venue: event.venue.name,
    date: formatDatePtBR(event.startsAt),
    price: formatBRL(event.priceFromCents),
    title: event.title,
    description: event.description,
  };
}
```

  - Valide os nomes reais das props de `EventCardProps` (leia o componente antes; se forem `dateLabel`/`priceLabel`, ajuste o mapper **e** os testes — a regra é: nomes vindos do `EventCard` do ticket 03, formatação pt-BR/BRL, `venueLabel = nome + UF`).
- [ ] `pnpm --filter @ticketvibe/web test` → verde

**Commit:** `feat(web): map event dto to view models`

---

### Task 14 — Home composta (web)

**Files:** `apps/web/src/app/page.tsx` (Modify — rewrite completo)

- [ ] Reescrever `page.tsx` (server component; `Header` já é server-safe, `EventsSection` é client — compose):

```tsx
import { Suspense } from 'react';

import { EventsSection } from '@/components/home/events-section';
import { Header } from '@/components/header';
import { HeroCard } from '@/components/home/hero-card';
import { fetchEvents } from '@/lib/events-api';
import { toEventCardProps, toHeroCardProps } from '@/lib/event-mapper';
```

  - `HeroSkeleton` / `HighlightsSkeleton` — skeleton simples com `animate-pulse` em blocos `bg-card` (altura ~`min-h-[26rem]` no hero; 3 blocos de card na seção)
  - `async function FeaturedSection()` → `const [featured] = await fetchEvents('featured'); if (!featured) return null; return <HeroCard {...toHeroCardProps(featured)} />;`
  - `async function HighlightsSection()` → `const events = await fetchEvents('hot'); return <EventsSection cards={events.map(toEventCardProps)} />;`
  - JSX:

```tsx
export default function HomePage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<HeroSkeleton />}>
          <FeaturedSection />
        </Suspense>
        <Suspense fallback={<HighlightsSkeleton />}>
          <HighlightsSection />
        </Suspense>
      </main>
    </>
  );
}
```

  - **Por que Suspense:** `cacheComponents: true` — sem um boundary acima do fetch sem cache, o build falha com "uncached or runtime data during prerendering". Os skeletons cumprem o fallback + UX. Não usar `use cache` (dados frescos).
- [ ] Gates (a API pode estar fora do ar — o build não deve depender de rede): `pnpm lint && pnpm typecheck && pnpm build` → verdes
- [ ] Smoke end-to-end local:
  1. `pnpm --filter @ticketvibe/api db:seed` (garante dados)
  2. `pnpm --filter @ticketvibe/api dev` (background) e `pnpm --filter @ticketvibe/web dev` (background)
  3. `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000` → `200`
  4. `curl -s http://127.0.0.1:3000 | rg -o 'O Fantasma da Ópera|Eventos em Alta|Garantir Ingressos|Neon Lights World Tour' | sort -u` → 4 linhas (hero + seção renderizam os dados do banco)
  5. Matar os dois dev servers (`pkill -f '[t]sx watch'`, `pkill -f '[n]ext dev'`; confirmar com `pgrep -af 'next dev|tsx'` vazio)
- [ ] `pnpm --filter @ticketvibe/web test` → verde

**Commit:** `feat(web): compose home with hero and highlights`

---

### Task 15 — Sincronização de documentação

**Files:** `README.md`, `docs/TESTING.md`, `docs/skills/TESTING_API_GUIDELINE.md`, `docs/skills/TESTING_FRONTEND_GUIDELINE.md` (Modify)

Aplique as substituições old→new exatas (confira com `git diff` ao final — nada além destas linhas deve mudar):

**`README.md`:**

1. Quickstart — trocar o bloco por:

```bash
pnpm install
pnpm infra:up     # Postgres, Redis, Mailpit (apenas 127.0.0.1)
pnpm --filter @ticketvibe/api db:migrate   # migrações Drizzle (idempotente)
pnpm --filter @ticketvibe/api db:seed      # categorias, locais e 12 eventos (idempotente)
pnpm dev          # web :3000 · api :3001 · worker BullMQ
```

2. Smoke test — adicionar a linha do listing entre `/health` e o web:

```bash
curl -s http://127.0.0.1:3001/health                            # {"status":"ok"}
curl -s 'http://127.0.0.1:3001/events?view=featured'            # {"events":[…3 eventos…]}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000  # 200
```

3. Row da tabela de scripts: `| \`pnpm test\` | testes unitários (vitest: shared + api) |` → `| \`pnpm test\` | testes (vitest: shared + api + web; a integração exige \`pnpm infra:up\`) |`
4. Inserir 3 rows de db **após** a row do Storybook:

```
| `pnpm --filter @ticketvibe/api db:generate` | gera migrações Drizzle a partir do schema |
| `pnpm --filter @ticketvibe/api db:migrate` | aplica as migrações no Postgres |
| `pnpm --filter @ticketvibe/api db:seed` | popula categorias, locais e eventos (idempotente) |
```

5. Tabela "Variáveis de ambiente" — adicionar 2 rows após a row de `REDIS_URL`:

```
| `DATABASE_URL` | `postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe` | api (Drizzle client + drizzle-kit) |
| `API_URL` | `http://localhost:3001` | web (`fetchEvents` no servidor) |
```

6. Estrutura — linha da api: `apps/api          Fastify 5 — rota /health compatível com o contrato do shared (validado em app.spec.ts)` → `apps/api          Fastify 5 + Drizzle/Postgres — rotas /health e /events validadas pelo shared (unit + integração)`

**`docs/TESTING.md`:**

1. `## Current state (after ticket 01)` → `## Current state (after ticket 04)`
2. Row shared: `2 tests (\`healthResponseSchema\`)` → número real do `vitest run` (será 10: 2 health + 8 listing) — use o valor exato do runner, não chute.
3. Row api: status `1 test (GET /health via app.inject, validated against the shared contract)` → `health (unit) + events module (use case, route, integration vs ticketvibe_test — requires \`pnpm infra:up\`)`
4. Row web: `| \`apps/web\` | — | no \`test\` script yet | component tests (RTL + MSW) arrive with the first feature tickets |` → `| \`apps/web\` | Vitest + RTL + MSW | \`pnpm --filter @ticketvibe/web test\` | home components (HeroCard, EventsSection), formatters, fetch client |`
5. Bloco "Existing test layout" — acrescentar (mantendo o comentário style):

```
apps/api/src/db/{schema,client,fixtures,seed-fixtures}.ts  # Drizzle schema + seed versionado
apps/api/src/db/test-helpers.ts        # ensure/migrate/reset (guarda: só ticketvibe_test)
apps/api/src/modules/events/…          # hexagonal live: domain, infra, use-cases, routes
apps/api/src/modules/events/routes/events.routes.integration.spec.ts  # Postgres real
apps/web/src/lib/events-api.ts         # fetchEvents + MSW (spec ao lado)
apps/web/src/components/home/*.spec.tsx # RTL do hero e da seção de destaques
```

6. Commands: comentário do `pnpm test` → `# turbo test (shared + api + web; pacotes sem script de teste são ignorados)`; acrescentar linha `pnpm --filter @ticketvibe/web test  # só os testes do web`
7. Tabela "Three levels": row Unit → `**live** — \`packages/shared\`, \`apps/api\`, \`apps/web\``; row Integration → `| Integration (routes + real Postgres) | Vitest against local \`ticketvibe_test\`; helpers \`ensureTestDatabase\` / \`migrateTestDatabase\` / \`resetDatabase\` | **live** (requires \`pnpm infra:up\`; first module: \`events\`) |`
8. Parágrafo `Planned hexagonal layout ... no module exists yet:` → `Hexagonal layout (live since ticket 04 — \`modules/events\`):`
9. Coverage: `Coverage tooling is **not installed yet**; the gate is expected to start with ticket 04+.` → `Coverage tooling is **not installed yet**; ticket 04 explicitly deferred it (recorded in the ticket 04 deferrals — see \`issues/05\`).`

**`docs/skills/TESTING_API_GUIDELINE.md`:**

1. Linha 5 (banner de status): `...; the hexagonal module layout and the Drizzle/integration layer arrive with ticket 04 (see ...).` → `...; the hexagonal module layout, Drizzle repositories and route integration tests are live since ticket 04 (first module: \`events\` — see ...).`
2. Linha ~26: `Planned module example (first module arrives with ticket 04):` → `Module example (live since ticket 04 — \`modules/events\`):`
3. Linha ~174: `*(The Drizzle layer does not exist yet — the first hexagonal module arrives with ticket 04. Until then, only unit tests exist: \`packages/shared\` contract tests and the \`apps/api\` health route.)*` → `*(The Drizzle layer is live since ticket 04: \`modules/events\` ships in-memory + Drizzle repositories and \`events.routes.integration.spec.ts\` runs against \`ticketvibe_test\`.)*`
4. Linha 331 (Test database): `- **Test database:** integration tests will use (planned) a local \`ticketvibe_test\` database (Postgres via \`pnpm infra:up\`); helpers (\`resetDatabase\`, \`seedTestData\`) arrive with ticket 04.` → `- **Test database:** local \`ticketvibe_test\` — created/migrated/reset by \`apps/api/src/db/test-helpers.ts\` (\`ensureTestDatabase\`, \`migrateTestDatabase\`, \`resetDatabase\`; the last one refuses any non-test URL). Requires \`pnpm infra:up\`.`
5. Linha 334 (Module layout): `hexagonal \`modules/<domain>/{domain,infra,use-cases,schemas,routes}\` per spec; first module arrives with ticket 04.` → `hexagonal \`modules/<domain>/{domain,infra,use-cases,schemas,routes}\` per spec — live with \`modules/events\` (table schemas live in \`src/db/schema.ts\`, shared with the seed).`
6. (Opcional, mesmo diff) bullet "Contract seam": acrescentar \`eventSchema\`/\`listEventsResponseSchema\` ao lado de \`healthResponseSchema\`.

**`docs/skills/TESTING_FRONTEND_GUIDELINE.md`:**

1. Linha 5 (banner): `React Testing Library, MSW and Playwright are **not installed yet** — they arrive with the first component/E2E tickets (component tests: ticket 04+, E2E: ticket 05+; see ...). Sections below describe the conventions to follow when that tooling lands; only the \`## Commands (this project)\` section lists project commands runnable today.` → `React Testing Library and MSW are installed since ticket 04 (\`apps/web\`); Playwright arrives with E2E (ticket 05+; see ...). Sections below remain the conventions to follow; \`## Commands (this project)\` lists project commands runnable today.`
2. Linhas ~7–9 (bullets da Tech Stack): `*(not installed yet)*` de **Component rendering** e **Network mocking** → `*(installed since ticket 04)*`; deixar **user-event** como `*(not installed yet)*` (não foi instalado).
3. Linha 373 (Coverage Gate): `Coverage tooling is not installed yet (it starts with the first component tests, ticket 04+).` → `Coverage tooling is not installed yet (ticket 04 explicitly deferred it — see the deferrals in \`issues/05\`).`
4. Linha 401: `# unit suite today = shared + api (apps/web has no test script yet)` → `# unit suite = shared + api + web`
5. Linha 470: `apps/web has **no \`test\` script** until RTL + MSW land — never document \`test:watch\` / \`test:coverage\` / \`test:e2e\` before those scripts exist.` → `apps/web has a \`test\` script since ticket 04 (\`vitest run\`) — still never document \`test:watch\` / \`test:coverage\` / \`test:e2e\` before those scripts exist.`
6. Linha 471 (Tooling status): `Vitest ✅ (installed) · RTL + MSW ⏳ first component test (ticket 04+) · Playwright ⏳ first E2E (ticket 05+).` → `Vitest ✅ · RTL ✅ · MSW ✅ (since ticket 04) · Playwright ⏳ first E2E (ticket 05+).`

- [ ] Verificação: `rg -n "arrives with ticket 04|no \`test\` script yet|after ticket 01" README.md docs/TESTING.md docs/skills/TESTING_*.md` → **zero** matches (todos os "chega no 04" resolvidos); `pnpm lint` verde (biome cobre md? não — apenas garantir árvore saneável)

**Commit:** `docs: sync tooling status and commands with ticket 04`

---

### Task 16 — Verificação final e fechamento do ticket

**Files:** gates (repo todo), `.scratch/ticketvibe/issues/04-seed-de-eventos-e-home.md`, `.scratch/ticketvibe/issues/05-busca-e-filtros-de-eventos.md`, este plano

- [ ] Gates na raiz: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → todos em 0
- [ ] Smoke subindo os 3 processos de novo (`db:seed` → api dev → web dev): web `HTTP=200`, `curl -s http://127.0.0.1:3000 | rg -o 'O Fantasma da Ópera|Eventos em Alta' | sort -u` → 2 hits; `curl -s 'http://127.0.0.1:3001/events?view=hot' | rg -o '"slug"' | wc -l` → `6`; matar processos e confirmar `pgrep -af 'next dev|tsx'` vazio
- [ ] Critérios por asserção de arquivo:
  - `rg -c 'featured: true' apps/api/src/db/fixtures.ts` → `3` e `rg -c 'isHot: true' apps/api/src/db/fixtures.ts` → `6`
  - `rg 'fetchEvents' apps/web/src/app/page.tsx` → hits presentes (chamadas em `FeaturedSection`/`HighlightsSection`)
  - `rg 'listEventsResponseSchema' apps/web/src/lib/events-api.ts` → hit (contrato compartilhado)
  - `rg 'db:seed' README.md` → hit
  - `rg 'ticketvibe_test' apps/api/src/db/test-helpers.ts` → hit
- [ ] **Fechar o issue 04** (`.scratch/ticketvibe/issues/04-seed-de-eventos-e-home.md`):
  - `**Status:** ready-for-agent` → `**Status:** done`
  - os 5 checkboxes `- [ ]` → `- [x]` (textos intactos: Schema…/Fixtures seed…/Rota REST…/Home consumindo…/Testes: integração…)
- [ ] **Deferrals do ticket 04 → issue 05**: anexar ao final de `.scratch/ticketvibe/issues/05-busca-e-filtros-de-eventos.md` a seção:

```markdown
## Deferrals do ticket 04 (registrados no fechamento do 04)

- **Chips de categoria da home** (mockup home.png) — UI nova sobre o mesmo seed; entra com a busca/filtros do 05.
- **Carrossel do hero (dots/controles)** — API já retorna lista de featured (`array`); controles ficam para polish posterior (06 ou 07).
- **Assets de imagem** — `imageUrl` é `nullable` no contrato e `null` em todas as fixtures; hero/cards usam o gradiente. Trabalho de imagem = 06/07.
- **`Header` no `layout.tsx`** — segue só na home (o `/_not-found` claro continua aberto; `not-found.tsx` com tokens = 04+).
- **Provider Zod/OpenAPI do Fastify** — F-transversal, fora do escopo de rota do 04.
- **Coverage tooling** — decisão registrada no 04: não instalar; política vive em docs/TESTING.md.
- **Sign-off do contraste `--border: #2e2054`** — pendência herdada do 03, ainda sem decisão de design.
```

- [ ] Tickar os checkboxes deste plano: `sed -i 's/^- \[ \]/- [x]/' docs/superpowers/plans/2026-10-08-ticket-04-seed-de-eventos-e-home.md` (após concluir; os steps são `- [ ]` no corpo — se algum `- [ ]` for literal dentro de bloco de código, rever manualmente antes de commitar)
- [ ] Sweep: `git status` limpo após commits; `pgrep -af 'next dev|tsx|vitest'` sem processos órfãos; `podman ps` com os 3 containers UP; nenhum push (convenção da casa)

**Commits (nesta ordem):**

1. `docs: mark ticket 04 as done`
2. `docs: tick executed steps in ticket 04 plan`

**Expected:** ticket 04 `done` com 5/5; deferrals do 04 gravados no 05; plano com steps executados marcados; working tree limpo; infra de pé.

---

## Final Verification Review (a executar ao concluir todas as tasks)

1. **Spec coverage:** os 5 checkboxes do issue 04 mapeados 1:1 para tasks — schema+migrações (3), fixtures seed (4), rota REST Zod (2+7), home hero+carrossel (10+11+14), testes integração/use-case/home-MSW (6+8+10/11/12). ✓
2. **Type consistency:** `EventView` (api, task 6) e `EventsView` (shared, task 2) = mesma união `all | featured | hot`; `EventEntity.categorySlug` existe desde a task 6 (DTO depende dele na task 7); `EventEntity.startsAt: Date` ↔ `EventDto.startsAt: string (ISO)`; `EventCardProps` exportado na task 11, antes do uso no mapper (13) e na seção (11).
3. **Placeholders:** nenhum "TBD"/"definir depois" — tudo especificado.
4. **Comandos:** todos com caminho/filter corretos (`pnpm --filter @ticketvibe/...`).

---

## Execution

After writing the plan: self-review (spec coverage → placeholder/type scan), commit `docs: add ticket 04 implementation plan`, then offer the choice:

1. **Subagent-Driven (recomendado)** — dispatch implementor por task + spec review por task (superpowers:subagent-driven-development)
2. **Inline Execution** — executar as tasks na sessão atual com checkpoints (superpowers:executing-plans)
