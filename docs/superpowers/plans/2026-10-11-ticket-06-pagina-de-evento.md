# Ticket 06 — Página de evento — Implementation Plan

> **For the implementing agent:** This plan is executed task-by-task with the `subagent-driven-development` skill (implementer → spec reviewer → code quality reviewer per task). Every step is bite-sized: 2–5 minutes of work, a commit at the end of each task. Do not skip the "Run" steps — evidence before assertions.
>
> **Repo facts:** branch `main` (commits are made directly on `main`, never pushed). Comments and commit messages in **English**; prompts and docs in **pt-BR** where already pt-BR. Conventional Commits, imperative, no trailing period. Infra via podman (`pnpm infra:up`); Postgres 16-alpine; dev DB `ticketvibe`, test DB `ticketvibe_test`. All the code below was checked against the installed versions on 2026-10-11.

## Goal

O visitante abre um evento e encontra tudo o que precisa para decidir a compra: descrição, data, local (com cidade), categorias, faixa de preço **por setor**, e o caminho (CTA) para escolher ingressos. Entrega o endpoint `GET /events/:slug` com setores (contrato Zod compartilhado, tabela `sectors`, seed), a página de evento no web com estados de carregamento/erro/inexistente, a página placeholder de ingressos (próxima fase), e a cobertura (unitários, integração, componentes com MSW/RTL, E2E home → evento e 404).

## Architecture

- **Contrato primeiro:** `packages/shared` ganha `sectorSchema` (`slug`, `name`, `priceFromCents`), `eventDetailSchema = eventSchema.extend({ sectors })` e `eventDetailResponseSchema = { event: eventDetailSchema }`. API e web consomem os mesmos tipos.
- **Domínio:** `SectorEntity`; `EventDetailEntity extends EventEntity { sectors: SectorEntity[] }`; `EventsRepository.findBySlug(slug): Promise<EventDetailEntity | null>` implementado no in-memory (unit) e no Drizzle (SQL). Use case fino `GetEventDetailUseCase`. Ordenação de setores é **contrato**: preço asc, slug asc.
- **Banco:** tabela `sectors` (`event_id` FK → `events`, unique `(event_id, slug)`), migração 0002 via `db:generate`. O seed insere 2 setores por evento (24 no total) com o invariante `min(setores) === event.priceFromCents`. `resetDatabase` já cobre `sectors` via `TRUNCATE … CASCADE` (sem mudança).
- **Rota:** `GET /events/:slug` → 200 `{ event }` ou 404 `{ error: 'event_not_found' }`. Slug **não** tem validação Zod (path param não vazio por natureza; qualquer string → lookup → 404 se ausente — YAGNI).
- **Web:** `fetchEventBySlug` devolve `EventDetailDto | null` (404 → `null` sem `console.error`; demais falhas lançam — divergido do resultado discriminado do plano original, revisado na execução da Task 7). Página `app/events/[slug]/page.tsx` espelha a home (Header + `<main>`) e é uma **rota bloqueante** (`export const instant = false`, revisado na execução da Task 10): o fetch fica na própria página dentro de um `try/catch` (o `error.tsx` do app não existe — o try/catch é obrigatório), `null` → `notFound()` chamado **fora** do `try` (dentro do `catch` o erro do `notFound()` seria engolido e viraria o estado de erro), throw → `<EventDetailError />`. O plano original com `<Suspense fallback={EventDetailSkeleton}>` foi abandonado: **qualquer fronteira de streaming (Suspense inline ou `loading.tsx`) fixa o status em 200 no primeiro flush**, tornando o status 404 impossível — ver a Nota de execução da Task 10 (skeleton/`loading.tsx` e o status 404 de produção ficaram como follow-up do `proxy.ts`). `notFound()` renderiza o `app/not-found.tsx` (primeiro 404 do app). CTA "Escolher ingressos" aponta para a rota placeholder `app/events/[slug]/ingressos/page.tsx` (sem acesso a `params` → estática; substituída pelo mapa de assentos na F2). `EventCard` ganha `href` obrigatório → "Ver Ingressos" vira link (`Button asChild`), conectando home → evento.
- **E2E:** dois fluxos novos em `tests/e2e/event.spec.ts` — card da home navega para `/events/o-fantasma-da-opera` (setores + CTA) e slug inexistente responde **status 404** com a heading do `not-found`.

## Tech Stack

Fastify 5 · Drizzle ORM 0.45 + drizzle-kit 0.31 · Postgres 16 (`unaccent`) · Zod 4 · Vitest 5 (api/shared) · Vitest 5 + RTL 16 + jsdom 30 + MSW 2 (web) · Next 16.4 App Router (`cacheComponents`) · React 19.3 · Tailwind v4 · lucide-react 1.53 · Playwright 1.64 (Chromium, já instalado).

## Environment facts (verified 2026-10-11)

- Migrações existentes: `0000_red_adam_warlock`, `0001_events_search_vector` (journal `meta/_journal.json`). A próxima é `0002_*` (nome aleatório gerado pelo drizzle-kit — descobrir com `ls apps/api/drizzle/0002_*.sql`).
- `apps/api` **não** tem `vitest.config.ts` → paralelismo default → **só** `events.routes.integration.spec.ts` toca `ticketvibe_test`. Toda integração nova vai para **esse mesmo arquivo**.
- `resetDatabase` usa `TRUNCATE TABLE events, venues, categories RESTART IDENTITY CASCADE` → `sectors` (FK de `events`) é truncada automaticamente. **Nenhuma mudança** em `test-helpers.ts`.
- `seedFixtures` faz delete→insert; com `sectors`, o delete de `events` violaria a FK → `tx.delete(sectors)` deve vir **antes** de `tx.delete(events)`.
- `InMemoryEventsRepository` recebe o array dos stubs; o construtor passa a aceitar `EventDetailEntity[]` → os stubs de `events.routes.spec.ts` (3) e `list-events.use-case.spec.ts` (5) ganham `sectors: []` (o stub `comum` da rota ganha setores reais para o teste 200).
- `button.tsx`/`badge.tsx` usam cva + `Slot` (radix-ui) → `asChild` disponível e tipado para `<Link>`.
- `shadow-primary` e `shadow-card` existem como tokens (`globals.css`).
- Playwright: `baseURL http://127.0.0.1:3000`, webServer api `:3001/health` + web `:3000`, `workers: 1`, `trace: 'retain-on-failure'`, `globalSetup` roda `db:seed` **apenas** (migração já aplicada pelo Task 2 no DB dev). `allowedDevOrigins: ['127.0.0.1']` já está no `next.config.ts`.
- `next build` valida rotas App Router (`LayoutProps`); a página de evento é dinâmica (`fetch` `no-store` + `await params`) e não é pré-renderizada no build.
- RTL: `getByText` é exato por padrão; `fireEvent` (sem `user-event`); specs de componente importam de `@/…` (alias `@/*` → `./src/*`).
- Biome: preset recommended, printWidth 80, single quotes, trailing commas all. Regras que já nos pegaram: `a11y/useSemanticElements` (nada de `role="search"`/`"group"` — usar `<search>`/`<fieldset>`) e `a11y/useAriaPropsSupportedByRole`. Sem `biome-ignore`.
- Seed atual: 7 categorias, 5 locais, 12 eventos; slugs e preços em `apps/api/src/db/fixtures.ts`. Invariante dos setores: `min(priceFromCents dos setores) === priceFromCents do evento`.

## Scope decisions (YAGNI)

- **Sem** disponibilidade/lotes/assentos por setor (F2 — ticket 10/11); setor hoje só tem `slug`, `name`, `priceFromCents`.
- **Sem** validação Zod no path param `slug` (qualquer string → 404 se não existir).
- **Sem** trigger de banco para setores; o seed mantém tudo (mesma política do `search_vector`).
- **Sem** story de `EventDetail` (composição de página com dado; EventCard/Header/Badge têm stories por renderizarem com props puras).
- **Sem** mudança no `resetDatabase` (CASCADE já cobre).
- **Sem** header no `layout.tsx` (segue duplicado em home e página de evento — deferral herdados do 04/05; registrado de novo no fechamento).
- Página de ingressos é **placeholder estático** (sem `params`) — será substituída pelo mapa de assentos na F2.
- `app/not-found.tsx` é genérico do app (hoje única origem de `notFound()` é a página de evento; copy é voltada a evento por ser o único caso).

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `packages/shared/src/index.ts` | editar | `sectorSchema`, `eventDetailSchema`, `eventDetailResponseSchema` + tipos |
| `packages/shared/src/index.spec.ts` | editar | Testes dos contratos novos |
| `apps/api/src/db/schema.ts` | editar | Tabela `sectors` |
| `apps/api/drizzle/0002_*.sql` + `meta/` | criar | Migração gerada |
| `apps/api/src/db/fixtures.ts` | editar | `sectorFixtures` (24) |
| `apps/api/src/db/seed-fixtures.ts` | editar | Delete/setor + insert de setores |
| `apps/api/src/db/seed.ts` | editar | Log com contagem de setores |
| `apps/api/src/modules/events/domain/event-entity.ts` | editar | `SectorEntity`, `EventDetailEntity` |
| `apps/api/src/modules/events/domain/events-repository.ts` | editar | `findBySlug` no contrato |
| `apps/api/src/modules/events/infra/in-memory-events-repository.ts` | editar | `findBySlug` em memória |
| `apps/api/src/modules/events/use-cases/get-event-detail.use-case.ts` (+ spec) | criar | Use case + unitário |
| `apps/api/src/modules/events/use-cases/list-events.use-case.spec.ts` | editar | Stubs com `sectors: []` |
| `apps/api/src/modules/events/routes/events.routes.ts` | editar | `GET /events/:slug` + DTO de detalhe |
| `apps/api/src/modules/events/routes/events.routes.spec.ts` | editar | Stubs + describe da rota de detalhe |
| `apps/api/src/modules/events/infra/drizzle-events-repository.ts` | editar | `findBySlug` SQL + setores |
| `apps/api/src/modules/events/routes/events.routes.integration.spec.ts` | editar | Integração do detalhe (200/404) |
| `apps/web/src/lib/events-api.ts` (+ spec) | editar | `fetchEventBySlug` → `EventDetailDto \| null` |
| `apps/web/src/components/event-detail.tsx` (+ spec) | criar | `EventDetail`, `EventDetailSkeleton`, `EventDetailError` |
| `apps/web/src/components/event-card.tsx` | editar | `href` obrigatório; CTA vira link |
| `apps/web/src/components/event-card.stories.tsx` | editar | Arg `href` |
| `apps/web/src/lib/event-mapper.ts` (+ spec) | editar | `href` em `toEventCardProps` |
| `apps/web/src/app/events/[slug]/page.tsx` | criar | Página de evento (Suspense + 404 + erro) |
| `apps/web/src/app/not-found.tsx` | criar | 404 global |
| `apps/web/src/app/events/[slug]/ingressos/page.tsx` | criar | Placeholder da próxima fase |
| `apps/web/tests/e2e/event.spec.ts` | criar | E2E: navegação e 404 |
| `README.md`, `docs/TESTING.md` | editar | Sincronização de docs |
| `.scratch/ticketvibe/issues/06-pagina-de-evento.md` | editar | Fechamento do ticket |

## Preconditions

- `pnpm infra:up` (Postgres de pé) — migração, seed e integração exigem o Postgres.
- `pnpm install` feito (Playwright 1.64 + Chromium já instalados no ticket 05).
- Gate: `pnpm lint && pnpm typecheck && pnpm test` verdes ao fim de cada task que toca código; `pnpm --filter @ticketvibe/web test:e2e` no task de E2E e no gate final.

---

### Task 1: Contrato compartilhado de detalhe (shared)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.spec.ts`

- [ ] **Step 1: Escrever os testes falhando**

Em `packages/shared/src/index.spec.ts`, adicione `sectorSchema`, `eventDetailSchema` e `eventDetailResponseSchema` ao import existente de `./index` (o arquivo já importa os demais schemas do mesmo barrel) e acrescente estes blocos ao final do arquivo (o fixture `validEvent` já existe na linha 23):

```ts
const validSector = { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 };

describe('sectorSchema', () => {
  it('accepts a valid sector', () => {
    expect(sectorSchema.parse(validSector)).toEqual(validSector);
  });

  it('rejects a negative priceFromCents', () => {
    expect(() =>
      sectorSchema.parse({ ...validSector, priceFromCents: -1 }),
    ).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => sectorSchema.parse({ ...validSector, name: '' })).toThrow();
  });
});

describe('eventDetailSchema', () => {
  it('accepts an event with sectors', () => {
    const detail = { ...validEvent, sectors: [validSector] };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('accepts an event with no sectors', () => {
    const detail = { ...validEvent, sectors: [] };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects a sector that violates the sector contract', () => {
    expect(() =>
      eventDetailSchema.parse({
        ...validEvent,
        sectors: [{ slug: 'plateia', name: 'Plateia' }],
      }),
    ).toThrow();
  });
});

describe('eventDetailResponseSchema', () => {
  it('accepts a wrapped event detail payload', () => {
    const payload = { event: { ...validEvent, sectors: [validSector] } };
    expect(eventDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});
```

- [ ] **Step 2: Rodar para verificar a falha**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL — `ReferenceError: sectorSchema is not defined` (ou erro de import).

- [ ] **Step 3: Implementar os schemas**

Em `packages/shared/src/index.ts`, acrescente ao final do arquivo:

```ts
export const sectorSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  priceFromCents: z.number().int().min(0),
});

export type SectorDto = z.infer<typeof sectorSchema>;

export const eventDetailSchema = eventSchema.extend({
  sectors: z.array(sectorSchema),
});

export type EventDetailDto = z.infer<typeof eventDetailSchema>;

export const eventDetailResponseSchema = z.object({
  event: eventDetailSchema,
});

export type EventDetailResponse = z.infer<typeof eventDetailResponseSchema>;
```

- [ ] **Step 4: Rodar para verificar a passagem**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: PASS — 27 testes (20 existentes + 7 novos).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.spec.ts
git commit -m "feat(shared): add event detail contract with sectors"
```

---

### Task 2: Tabela `sectors` + migração 0002

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0002_*.sql`, `apps/api/drizzle/meta/*` (gerados)

- [ ] **Step 1: Adicionar a tabela no schema Drizzle**

Em `apps/api/src/db/schema.ts`, adicione `unique` ao import do `drizzle-orm/pg-core` (linha 1–10, ordem alfabética: `boolean, customType, index, integer, pgTable, text, timestamp, unique, uuid`) e acrescente após a tabela `events`:

```ts
export const sectors = pgTable(
  'sectors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    priceFromCents: integer('price_from_cents').notNull(),
  },
  (table) => [
    unique('sectors_event_id_slug_unique').on(table.eventId, table.slug),
  ],
);
```

- [ ] **Step 2: Gerar a migração**

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: drizzle-kit cria `apps/api/drizzle/0002_<nome-aleatorio>.sql` + snapshot em `meta/` + entrada `idx: 2` no `_journal.json`, com `CREATE TABLE "sectors" ...`.

Run: `ls apps/api/drizzle/0002_*.sql && cat apps/api/drizzle/0002_*.sql`
Expected: SQL contendo `CREATE TABLE "sectors"` com `event_id` FK para `events` e `UNIQUE("event_id","slug")`.

- [ ] **Step 3: Aplicar no DB dev**

Run: `pnpm --filter @ticketvibe/api db:migrate`
Expected: saída indicando aplicação da migração 0002 sem erro.

Run: `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -c '\d sectors'`
Expected: tabela com colunas `id`, `event_id`, `slug`, `name`, `price_from_cents`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): add sectors table with migration"
```

---

### Task 3: Seed de setores (24 fixtures)

**Files:**
- Modify: `apps/api/src/db/fixtures.ts`
- Modify: `apps/api/src/db/seed-fixtures.ts`
- Modify: `apps/api/src/db/seed.ts`

- [ ] **Step 1: Definir `sectorFixtures`**

Em `apps/api/src/db/fixtures.ts`, acrescente após a interface `EventFixture` e após a lista `eventFixtures`:

```ts
export interface SectorFixture {
  eventSlug: string;
  slug: string;
  name: string;
  priceFromCents: number;
}
```

```ts
export const sectorFixtures: SectorFixture[] = [
  {
    eventSlug: 'o-fantasma-da-opera',
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 12000,
  },
  {
    eventSlug: 'o-fantasma-da-opera',
    slug: 'balcao',
    name: 'Balcão',
    priceFromCents: 19000,
  },
  {
    eventSlug: 'derby-capital',
    slug: 'arquibancada',
    name: 'Arquibancada',
    priceFromCents: 25000,
  },
  {
    eventSlug: 'derby-capital',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 45000,
  },
  {
    eventSlug: 'corpo-em-movimento',
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 15000,
  },
  {
    eventSlug: 'corpo-em-movimento',
    slug: 'mezanino',
    name: 'Mezanino',
    priceFromCents: 22000,
  },
  {
    eventSlug: 'standup-noite-de-verdades',
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 9000,
  },
  {
    eventSlug: 'standup-noite-de-verdades',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 16000,
  },
  {
    eventSlug: 'corrida-de-rua-sp',
    slug: 'km5',
    name: 'Corrida 5km',
    priceFromCents: 5000,
  },
  {
    eventSlug: 'corrida-de-rua-sp',
    slug: 'km10',
    name: 'Corrida 10km',
    priceFromCents: 9000,
  },
  {
    eventSlug: 'pequeno-principe-musical',
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 7000,
  },
  {
    eventSlug: 'pequeno-principe-musical',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 12000,
  },
  {
    eventSlug: 'neon-lights-world-tour',
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 18000,
  },
  {
    eventSlug: 'neon-lights-world-tour',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 32000,
  },
  {
    eventSlug: 'sertaneja-rio',
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 22000,
  },
  {
    eventSlug: 'sertaneja-rio',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 38000,
  },
  {
    eventSlug: 'cyberpunk-electronic-festival',
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 29000,
  },
  {
    eventSlug: 'cyberpunk-electronic-festival',
    slug: 'frontstage',
    name: 'Frontstage',
    priceFromCents: 48000,
  },
  {
    eventSlug: 'melhor-de-standup-grand-finale',
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 11000,
  },
  {
    eventSlug: 'melhor-de-standup-grand-finale',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 18000,
  },
  {
    eventSlug: 'a-hora-e-a-vez',
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 14000,
  },
  {
    eventSlug: 'a-hora-e-a-vez',
    slug: 'balcao',
    name: 'Balcão',
    priceFromCents: 21000,
  },
  {
    eventSlug: 'festival-de-verao',
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 32000,
  },
  {
    eventSlug: 'festival-de-verao',
    slug: 'camarote',
    name: 'Camarote',
    priceFromCents: 52000,
  },
];
```

Invariante: em cada evento, o menor `priceFromCents` de setor é exatamente o `priceFromCents` do evento.

- [ ] **Step 2: Gravar setores no seed**

Em `apps/api/src/db/seed-fixtures.ts`, substitua o arquivo inteiro por:

```ts
import { sql } from 'drizzle-orm';

import type { Db } from './client.js';
import {
  categoryFixtures,
  eventFixtures,
  sectorFixtures,
  venueFixtures,
} from './fixtures.js';
import { categories, events, sectors, venues } from './schema.js';

export async function seedFixtures(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sectors);
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
    const venueBySlug = new Map(venueFixtures.map((row) => [row.slug, row]));

    const eventIds = new Map<string, string>();
    for (const fixture of eventFixtures) {
      const categoryId = categoryIds.get(fixture.categorySlug);
      const venueId = venueIds.get(fixture.venueSlug);
      const venue = venueBySlug.get(fixture.venueSlug);
      if (!categoryId || !venueId || !venue) {
        throw new Error(
          `Missing category or venue for event "${fixture.slug}"`,
        );
      }
      const [insertedEvent] = await tx
        .insert(events)
        .values({
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
          searchVector: sql`setweight(to_tsvector('portuguese', unaccent(${fixture.title})), 'A')
            || setweight(to_tsvector('portuguese', unaccent(${fixture.description})), 'B')
            || setweight(to_tsvector('portuguese', unaccent(${venue.name} || ' ' || ${venue.city})), 'C')`,
        })
        .returning({ id: events.id });
      eventIds.set(fixture.slug, insertedEvent.id);
    }

    const sectorValues = sectorFixtures.map((fixture) => {
      const eventId = eventIds.get(fixture.eventSlug);
      if (!eventId) {
        throw new Error(`Missing event for sector "${fixture.slug}"`);
      }
      return {
        eventId,
        slug: fixture.slug,
        name: fixture.name,
        priceFromCents: fixture.priceFromCents,
      };
    });
    await tx.insert(sectors).values(sectorValues);
  });
}
```

- [ ] **Step 3: Atualizar o log do seed**

Em `apps/api/src/db/seed.ts`, substitua a linha do `console.log` por:

```ts
  console.log('Seed completed: 7 categories, 5 venues, 12 events, 24 sectors.');
```

- [ ] **Step 4: Rodar seed e a suíte de integração**

Run: `pnpm --filter @ticketvibe/api db:seed`
Expected: `Seed completed: 7 categories, 5 venues, 12 events, 24 sectors.` (idempotente: rodar de novo zera e reinsere).

Run: `pnpm --filter @ticketvibe/api test`
Expected: PASS — todos os testes (a integração "keeps 12 events when fixtures are seeded again without reset" agora exercita o delete de setores em duplicidade).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/fixtures.ts apps/api/src/db/seed-fixtures.ts apps/api/src/db/seed.ts
git commit -m "feat(api): seed sectors for every event"
```

---

### Task 4: Domínio + use case de detalhe (findBySlug)

**Files:**
- Modify: `apps/api/src/modules/events/domain/event-entity.ts`
- Modify: `apps/api/src/modules/events/domain/events-repository.ts`
- Modify: `apps/api/src/modules/events/infra/in-memory-events-repository.ts`
- Create: `apps/api/src/modules/events/use-cases/get-event-detail.use-case.ts`
- Test: `apps/api/src/modules/events/use-cases/get-event-detail.use-case.spec.ts`
- Modify: `apps/api/src/modules/events/use-cases/list-events.use-case.spec.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.spec.ts`

- [ ] **Step 1: Escrever o spec do use case (falhando)**

Crie `apps/api/src/modules/events/use-cases/get-event-detail.use-case.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { EventDetailEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { GetEventDetailUseCase } from './get-event-detail.use-case';

const stubEvents: EventDetailEntity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'fantasma',
    title: 'O Fantasma da Ópera',
    description: 'Musical internacional no palco do Teatro Renault.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-22T23:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: true,
    isHot: true,
    sectors: [
      { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 },
      { slug: 'balcao', name: 'Balcão', priceFromCents: 19000 },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'standup',
    title: 'Stand-up: Noite de Verdades',
    description: 'Comédia sem filtro no Espaço Unimed.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-11-05T21:00:00.000Z'),
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: true,
    sectors: [{ slug: 'pista', name: 'Pista', priceFromCents: 9000 }],
  },
];

function createUseCase(
  events: EventDetailEntity[] = stubEvents,
): GetEventDetailUseCase {
  return new GetEventDetailUseCase(new InMemoryEventsRepository(events));
}

describe('GetEventDetailUseCase', () => {
  it('returns the event with its sectors ordered by price', async () => {
    const result = await createUseCase().execute('fantasma');

    expect(result?.slug).toBe('fantasma');
    expect(result?.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);
    expect(result?.priceFromCents).toBe(12000);
  });

  it('returns null for an unknown slug', async () => {
    expect(await createUseCase().execute('desconhecido')).toBeNull();
  });

  it('sorts sectors by price even when the source order differs', async () => {
    const unordered: EventDetailEntity[] = [
      {
        ...stubEvents[0],
        sectors: [
          { slug: 'balcao', name: 'Balcão', priceFromCents: 19000 },
          { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 },
        ],
      },
    ];

    const result = await createUseCase(unordered).execute('fantasma');

    expect(result?.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);
  });

  it('forwards the slug to the repository', async () => {
    const repository = new InMemoryEventsRepository(stubEvents);
    const findBySlug = vi.spyOn(repository, 'findBySlug');

    await new GetEventDetailUseCase(repository).execute('fantasma');

    expect(findBySlug).toHaveBeenCalledWith('fantasma');
  });
});
```

- [ ] **Step 2: Rodar para verificar a falha**

Run: `pnpm --filter @ticketvibe/api test -- --run src/modules/events/use-cases/get-event-detail.use-case.spec.ts`
Expected: FAIL — o arquivo de implementação `get-event-detail.use-case.ts` não existe (erro de resolução de módulo).

- [ ] **Step 3: Implementar domínio, contrato, in-memory e use case**

Em `apps/api/src/modules/events/domain/event-entity.ts`, acrescente ao final:

```ts
export interface SectorEntity {
  slug: string;
  name: string;
  priceFromCents: number;
}

export interface EventDetailEntity extends EventEntity {
  sectors: SectorEntity[];
}
```

Substitua `apps/api/src/modules/events/domain/events-repository.ts` por:

```ts
import type { SearchFilters } from '@ticketvibe/shared';
import type { EventDetailEntity, EventEntity, EventView } from './event-entity';

export interface EventsRepository {
  findAll(view: EventView, filters?: SearchFilters): Promise<EventEntity[]>;
  findBySlug(slug: string): Promise<EventDetailEntity | null>;
}
```

Em `apps/api/src/modules/events/infra/in-memory-events-repository.ts`, troque o import do domínio e o construtor, e acrescente `findBySlug` (o restante do arquivo fica igual):

```ts
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
} from '../domain/event-entity';
```

```ts
export class InMemoryEventsRepository implements EventsRepository {
  constructor(private readonly items: EventDetailEntity[]) {}
```

```ts
  findBySlug(slug: string): Promise<EventDetailEntity | null> {
    const item = this.items.find((entry) => entry.slug === slug);
    if (!item) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...item,
      sectors: [...item.sectors].sort(
        (a, b) =>
          a.priceFromCents - b.priceFromCents || a.slug.localeCompare(b.slug),
      ),
    });
  }
}
```

Crie `apps/api/src/modules/events/use-cases/get-event-detail.use-case.ts`:

```ts
import type { EventDetailEntity } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class GetEventDetailUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  execute(slug: string): Promise<EventDetailEntity | null> {
    return this.eventsRepository.findBySlug(slug);
  }
}
```

- [ ] **Step 4: Corrigir os stubs existentes quebrados pelo novo tipo**

Em `apps/api/src/modules/events/use-cases/list-events.use-case.spec.ts`:
- troque o import `import type { EventEntity } from '../domain/event-entity';` por `import type { EventDetailEntity } from '../domain/event-entity';`;
- troque `const stubEvents: EventEntity[] = [` por `const stubEvents: EventDetailEntity[] = [`;
- adicione `sectors: [],` ao final de cada um dos 3 stubs (após `isHot`);
- troque `const tiedEvents: EventEntity[] = [` por `const tiedEvents: EventDetailEntity[] = [` e adicione `sectors: [],` aos 2 stubs desse bloco.

Em `apps/api/src/modules/events/routes/events.routes.spec.ts`:
- troque o import `import type { EventEntity } from '../domain/event-entity.js';` por `import type { EventDetailEntity } from '../domain/event-entity.js';`;
- troque `const stubEvents: EventEntity[] = [` por `const stubEvents: EventDetailEntity[] = [`;
- adicione `sectors: [],` ao stub `em-alta` e ao stub `destaque`;
- no stub `comum` adicione setores reais (usados pelo teste 200 da Task 5):

```ts
    sectors: [
      { slug: 'pista', name: 'Pista', priceFromCents: 15000 },
      { slug: 'camarote', name: 'Camarote', priceFromCents: 21000 },
    ],
```

- [ ] **Step 5: Rodar a suíte de api**

Run: `pnpm --filter @ticketvibe/api test`
Expected: PASS — todos (4 novos do use case; os existentes continuam verdes com os stubs atualizados).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/events/
git commit -m "feat(api): add get event detail use case"
```

---

### Task 5: Rota `GET /events/:slug`

**Files:**
- Modify: `apps/api/src/modules/events/routes/events.routes.ts`
- Test: `apps/api/src/modules/events/routes/events.routes.spec.ts`

- [ ] **Step 1: Escrever os testes falhando**

Em `apps/api/src/modules/events/routes/events.routes.spec.ts`, adicione `eventDetailResponseSchema` ao import do shared (linha 1) e acrescente o describe ao final do arquivo:

```ts
describe('GET /events/:slug', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      eventsRepository: new InMemoryEventsRepository(stubEvents),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the event detail with its sectors', async () => {
    const response = await app.inject({ method: 'GET', url: '/events/comum' });

    expect(response.statusCode).toBe(200);
    const body = eventDetailResponseSchema.parse(response.json());
    expect(body.event.slug).toBe('comum');
    expect(body.event.sectors).toEqual([
      { slug: 'pista', name: 'Pista', priceFromCents: 15000 },
      { slug: 'camarote', name: 'Camarote', priceFromCents: 21000 },
    ]);
  });

  it('returns 404 for an unknown slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});
```

- [ ] **Step 2: Rodar para verificar a falha**

Run: `pnpm --filter @ticketvibe/api test -- --run src/modules/events/routes/events.routes.spec.ts`
Expected: FAIL — o primeiro teste recebe o 404 genérico do Fastify (a rota ainda não existe).

- [ ] **Step 3: Implementar a rota**

Em `apps/api/src/modules/events/routes/events.routes.ts`, troque o import do shared/domínio e o corpo (mantendo `toEventDto` intacto):

```ts
import {
  type EventDetailDto,
  type EventDto,
  listEventsQuerySchema,
} from '@ticketvibe/shared';
```

```ts
import type {
  EventDetailEntity,
  EventEntity,
} from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';
import { GetEventDetailUseCase } from '../use-cases/get-event-detail.use-case.js';
import { ListEventsUseCase } from '../use-cases/list-events.use-case.js';
```

Após `toEventDto`, adicione:

```ts
function toEventDetailDto(entity: EventDetailEntity): EventDetailDto {
  return {
    ...toEventDto(entity),
    sectors: entity.sectors.map((sector) => ({
      slug: sector.slug,
      name: sector.name,
      priceFromCents: sector.priceFromCents,
    })),
  };
}
```

Substitua o corpo de `registerEventRoutes` (renomeie `useCase` para `listUseCase`):

```ts
export function registerEventRoutes(
  app: FastifyInstance,
  eventsRepository: EventsRepository,
): void {
  const listUseCase = new ListEventsUseCase(eventsRepository);
  const detailUseCase = new GetEventDetailUseCase(eventsRepository);

  app.get('/events', async (request, reply) => {
    const parsed = listEventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_query',
        issues: parsed.error.issues,
      });
    }
    const list = await listUseCase.execute(parsed.data);
    return { events: list.map(toEventDto) };
  });

  app.get<{ Params: { slug: string } }>(
    '/events/:slug',
    async (request, reply) => {
      const event = await detailUseCase.execute(request.params.slug);
      if (!event) {
        return reply.code(404).send({ error: 'event_not_found' });
      }
      return { event: toEventDetailDto(event) };
    },
  );
}
```

- [ ] **Step 4: Rodar para verificar a passagem**

Run: `pnpm --filter @ticketvibe/api test -- --run src/modules/events/routes/events.routes.spec.ts`
Expected: PASS — 11 testes do arquivo (9 existentes + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/events/routes/
git commit -m "feat(api): add GET /events/:slug route"
```

---

### Task 6: `findBySlug` no Drizzle + integração

**Files:**
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts`
- Test: `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`

- [ ] **Step 1: Escrever os testes de integração falhando**

Em `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`, adicione `eventDetailResponseSchema` ao import do shared (linha 1–4) e acrescente o describe ao final do arquivo (após o describe de `GET /categories`):

```ts
describe('GET /events/:slug (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
      eventsRepository: new DrizzleEventsRepository(testDb),
      categoriesRepository: new DrizzleCategoriesRepository(testDb),
    });
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

  it('returns the event with sectors ordered by price', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera',
    });

    expect(response.statusCode).toBe(200);
    const body = eventDetailResponseSchema.parse(response.json());
    expect(body.event.slug).toBe('o-fantasma-da-opera');
    expect(body.event.priceFromCents).toBe(12000);
    expect(body.event.sectors).toEqual([
      { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 },
      { slug: 'balcao', name: 'Balcão', priceFromCents: 19000 },
    ]);
  });

  it('returns 404 for an unknown slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/evento-inexistente',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});
```

- [ ] **Step 2: Rodar para verificar a falha**

Run: `pnpm --filter @ticketvibe/api test -- --run src/modules/events/routes/events.routes.integration.spec.ts`
Expected: FAIL — o Drizzle repo não implementa `findBySlug` (TypeError → 500) no teste 200; o teste 404 passa por acaso.

- [ ] **Step 3: Implementar `findBySlug` no Drizzle**

Em `apps/api/src/modules/events/infra/drizzle-events-repository.ts`, adicione `sectors` ao import do schema (linha 5) e extraia a forma do select logo abaixo do `EventRow`:

```ts
const eventSelect = {
  events: {
    id: events.id,
    slug: events.slug,
    title: events.title,
    description: events.description,
    startsAt: events.startsAt,
    priceFromCents: events.priceFromCents,
    imageUrl: events.imageUrl,
    badgeLabel: events.badgeLabel,
    featured: events.featured,
    isHot: events.isHot,
  },
  categories: {
    slug: categories.slug,
    name: categories.name,
  },
  venues: {
    name: venues.name,
    city: venues.city,
    state: venues.state,
  },
};
```

Na `findAll`, troque o objeto inline do `.select({...})` por `.select(eventSelect)` (mesmo resultado tipado). Acrescente o método após a `findAll`:

```ts
  async findBySlug(slug: string): Promise<EventDetailEntity | null> {
    const rows = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.slug, slug))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const sectorRows = await this.db
      .select({
        slug: sectors.slug,
        name: sectors.name,
        priceFromCents: sectors.priceFromCents,
      })
      .from(sectors)
      .where(eq(sectors.eventId, row.events.id))
      .orderBy(asc(sectors.priceFromCents), asc(sectors.slug));

    return { ...toEventEntity(row), sectors: sectorRows };
  }
```

E atualize o import do domínio na linha 6 para incluir `EventDetailEntity`:

```ts
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
} from '../domain/event-entity.js';
```

- [ ] **Step 4: Rodar para verificar a passagem**

Run: `pnpm --filter @ticketvibe/api test`
Expected: PASS — suíte completa (a integração agora cobre o detalhe com setores vindos do Postgres).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/events/
git commit -m "feat(api): implement drizzle findBySlug"
```

---

### Task 7: `fetchEventBySlug` no web — CONCLUÍDA (divergido do plano original)

> **Nota de execução:** o plano original previa um resultado discriminado (`FetchEventDetailResult` com `ok`/`error`). Durante a execução o contrato foi revisado para `Promise<EventDetailDto | null>` + throw, alinhando com o que a Task 10 realmente precisa: `null` → `notFound()`, throw → estado de erro. Implementado nos commits `0fcf72d` + `ea65dd4` (encode de slug, asserts pinados, teste de log/restauração de payload). Os testes reais estão no commit; não reexecutar os snippets abaixo (estão mantidos apenas como registro histórico, agora obsoletos).

**Arquivos concluídos:**
- `apps/web/src/lib/events-api.ts` — `fetchEventBySlug(slug): Promise<EventDetailDto | null>`; 404 → `null` sem log; demais falhas → throw; parse via `eventDetailResponseSchema`.
- `apps/web/src/lib/events-api.spec.ts` — 4 testes (200 parse, 404 sem `console.error`, 500 lança mensagem pinada, payload inválido loga e relança).

---

### Task 8: Componentes de detalhe (EventDetail/Skeleton/Error) — CONCLUÍDA

> **Nota de execução:** o snippet original previa um `<table>` sob o heading "Setores e preços". A implementação aprovada em revisão usa uma lista semântica (`<ul>`) sob o heading "Setores", com `aria-labelledby` — decisão mantida deliberadamente (pares label/valor não são dados tabulares verdadeiros). Os testes do componente e o E2E da Task 11 foram reconciliados com esse markup nos commits `86fe92a` + `a7b34c2` (cobertura de setores vazios, skeleton `aria-hidden`, export de `EventDetailProps`). Os snippets abaixo são registro histórico, agora obsoletos — não reexecutar.

**Arquivos concluídos:**
- `apps/web/src/components/event-detail.tsx` — `EventDetail` (reusa `formatBRL`/`formatDatePtBR`; CTA `Button asChild`→`Link` para `/events/{slug}/ingressos`; seção "Setores" como `<ul>` acessível; fallback "Setores em divulgação em breve."), `EventDetailSkeleton` (sem props, `aria-hidden`), `EventDetailError` (mensagem + link home).
- `apps/web/src/components/event-detail.spec.tsx` — 6 testes (título, setores+preço BRL, href do CTA, setores vazios, skeleton aria-hidden, erro).

**Arquivos originais (registro histórico):**
- Create: `apps/web/src/components/event-detail.tsx`
- Test: `apps/web/src/components/event-detail.spec.tsx`

- [ ] **Step 1: Escrever os testes falhando**

Crie `apps/web/src/components/event-detail.spec.tsx`:

```tsx
import type { EventDetailDto } from '@ticketvibe/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  EventDetail,
  EventDetailError,
} from './event-detail';

const evento: EventDetailDto = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  description: 'O musical internacional mais famoso do mundo.',
  category: { slug: 'shows', name: 'Shows' },
  venue: { name: 'Teatro Renault', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-10-22T23:00:00Z',
  priceFromCents: 12000,
  imageUrl: null,
  badgeLabel: 'Espetáculo Internacional',
  sectors: [
    { slug: 'plateia', name: 'Plateia', priceFromCents: 12000 },
    { slug: 'balcao', name: 'Balcão', priceFromCents: 19000 },
  ],
};

describe('EventDetail', () => {
  test('renders the event summary and sector prices', () => {
    render(<EventDetail event={evento} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'O Fantasma da Ópera' }),
    ).toBeInTheDocument();
    expect(screen.getByText('22 de Outubro, 2026')).toBeInTheDocument();
    expect(
      screen.getByText('Teatro Renault · São Paulo/SP'),
    ).toBeInTheDocument();
    expect(screen.getByText('Shows')).toBeInTheDocument();
    expect(screen.getByText('A partir de')).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Plateia');
    expect(rows[1]).toHaveTextContent('R$ 120,00');
    expect(rows[2]).toHaveTextContent('Balcão');
    expect(rows[2]).toHaveTextContent('R$ 190,00');
  });

  test('links the purchase CTA to the checkout placeholder route', () => {
    render(<EventDetail event={evento} />);

    expect(
      screen.getByRole('link', { name: 'Escolher ingressos' }),
    ).toHaveAttribute('href', '/events/o-fantasma-da-opera/ingressos');
  });

  test('shows a friendly message when no sectors are published', () => {
    render(<EventDetail event={{ ...evento, sectors: [] }} />);

    expect(
      screen.getByText('Setores em divulgação em breve.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('EventDetailError', () => {
  test('renders the error state with a way back home', () => {
    render(<EventDetailError />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Não foi possível carregar o evento',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a home' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
```

- [ ] **Step 2: Rodar para verificar a falha**

Run: `pnpm --filter @ticketvibe/web test -- src/components/event-detail.spec.tsx`
Expected: FAIL — módulo `./event-detail` não encontrado.

- [ ] **Step 3: Implementar os componentes**

Crie `apps/web/src/components/event-detail.tsx`:

```tsx
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import type { EventDetailDto } from '@ticketvibe/shared';
import Link from 'next/link';
import { formatBRL, formatDatePtBR } from '@/lib/format';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

function EventDetail({ event }: { event: EventDetailDto }) {
  return (
    <article className="flex flex-col gap-8">
      <section className="relative isolate overflow-hidden rounded-2xl border border-border p-6 shadow-card sm:p-10">
        <div aria-hidden className="bg-event-gradient absolute inset-0 -z-10" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {event.badgeLabel ? <Badge>{event.badgeLabel}</Badge> : null}
            <Badge variant="secondary">{event.category.name}</Badge>
          </div>
          <h1 className="font-heading text-3xl font-bold sm:text-5xl">
            {event.title}
          </h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {formatDatePtBR(event.startsAt)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {event.venue.name} · {event.venue.city}/{event.venue.state}
            </span>
          </p>
          <p className="max-w-3xl text-base text-muted-foreground">
            {event.description}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
            <div>
              <p className="text-xs text-muted-foreground">A partir de</p>
              <p className="text-2xl font-bold text-primary">
                {formatBRL(event.priceFromCents)}
              </p>
            </div>
            <Button asChild size="lg" className="shadow-primary">
              <Link href={`/events/${event.slug}/ingressos`}>
                <Ticket className="size-4" aria-hidden="true" />
                Escolher ingressos
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="sectors-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="sectors-heading" className="font-heading text-2xl font-semibold">
          Setores e preços
        </h2>
        {event.sectors.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Setor
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    A partir de
                  </th>
                </tr>
              </thead>
              <tbody>
                {event.sectors.map((sector) => (
                  <tr
                    key={sector.slug}
                    className="border-b border-border last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-medium text-foreground"
                    >
                      {sector.name}
                    </th>
                    <td className="px-4 py-3 text-right font-bold text-primary">
                      {formatBRL(sector.priceFromCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Setores em divulgação em breve.
          </p>
        )}
      </section>
    </article>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="min-h-[18rem] animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-8 w-56 animate-pulse rounded-full bg-card" />
      <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

function EventDetailError() {
  return (
    <section className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-heading text-2xl font-bold">
        Não foi possível carregar o evento
      </h1>
      <p className="text-muted-foreground">Tente novamente em instantes.</p>
      <Link
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        Voltar para a home
      </Link>
    </section>
  );
}

export { EventDetail, EventDetailError, EventDetailSkeleton };
```

- [ ] **Step 4: Rodar para verificar a passagem**

Run: `pnpm --filter @ticketvibe/web test -- src/components/event-detail.spec.tsx`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/event-detail.tsx apps/web/src/components/event-detail.spec.tsx
git commit -m "feat(web): add event detail components"
```

---

### Task 9: `EventCard` ganha `href` (cards viram links)

**Files:**
- Modify: `apps/web/src/lib/event-mapper.ts`
- Test: `apps/web/src/lib/event-mapper.spec.ts`
- Modify: `apps/web/src/components/event-card.tsx`
- Modify: `apps/web/src/components/event-card.stories.tsx`

- [ ] **Step 1: Atualizar o spec do mapper (falhando)**

Em `apps/web/src/lib/event-mapper.spec.ts`, no teste `maps the event dto to event card props`, acrescente a propriedade `href` ao objeto esperado do `toStrictEqual`:

```ts
    expect(toEventCardProps(eventoFeatured)).toStrictEqual({
      category: 'Shows',
      venue: 'Teatro Renault',
      date: '22 de Outubro, 2026',
      price: 'R$ 120,00',
      title: 'Espetáculo Internacional',
      badgeLabel: 'Espetáculo Internacional',
      imageSrc: undefined,
      href: '/events/espetaculo-internacional-sp',
    });
```

- [ ] **Step 2: Rodar para verificar a falha**

Run: `pnpm --filter @ticketvibe/web test -- src/lib/event-mapper.spec.ts`
Expected: FAIL — `href` não está no objeto retornado.

- [ ] **Step 3: Implementar mapper, card e stories**

Em `apps/web/src/lib/event-mapper.ts`, acrescente `href` ao retorno de `toEventCardProps`:

```ts
      href: `/events/${event.slug}`,
```

Em `apps/web/src/components/event-card.tsx`:
- adicione `import Link from 'next/link';` (após `next/image`);
- acrescente `href: string;` ao `EventCardProps` (após `price`) e `href,` ao destructuring;
- troque o botão "Ver Ingressos" pelo link:

```tsx
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          >
            <Link href={href}>Ver Ingressos</Link>
          </Button>
```

Em `apps/web/src/components/event-card.stories.tsx`, acrescente `href` aos args do story `Default`:

```ts
    href: '/events/o-fantasma-da-opera',
```

- [ ] **Step 4: Rodar a suíte de componentes**

Run: `pnpm --filter @ticketvibe/web test`
Expected: PASS — todos os testes do web (50 no total: 42 do ticket 05 + 4 do Task 7 + 4 do Task 8; o mapper atualiza asserts sem adicionar casos, e nenhum spec existente asserta o CTA como botão).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/event-mapper.ts apps/web/src/lib/event-mapper.spec.ts apps/web/src/components/event-card.tsx apps/web/src/components/event-card.stories.tsx
git commit -m "feat(web): link event cards to event page"
```

---

### Task 10: Página de evento, 404 global e placeholder de ingressos — CONCLUÍDA (divergido do plano original)

> **Nota de execução:** o snippet original envolvia o fetch num componente `EventContent` dentro de `<Suspense fallback={EventDetailSkeleton}>`. A implementação aprovada em revisão é uma **rota bloqueante**: `export const instant = false` na página, o fetch na própria página, `try/catch` envolvendo **só** o fetch (throw → `<EventDetailError />`) e `notFound()` chamado **fora** do `try` — dentro de um `catch` o erro `NEXT_HTTP_ERROR_FALLBACK` seria engolido e a página renderizaria o estado de erro no lugar do 404. Motivo da divergência: **qualquer fronteira de streaming fixa o status em 200 no primeiro flush** (documentado em "Status codes" da referência `loading.js` da Next 16.4; confirmado empiricamente no dev — Suspense inline devolve 200 e streama o not-found). Remover o `Suspense` sem o `instant = false` quebra o `next build` no `cacheComponents` ("Route … accessed outside of <Suspense>" — a própria mensagem de erro sugere `export const instant = false`). Commits `f7b739b` + o commit desta reconciliação.
>
> **`loading.tsx` (skeleton) — adiado para o follow-up do `proxy.ts`:** verificou-se que criar `app/events/[slug]/loading.tsx` com `<EventDetailSkeleton />` **quebra o contrato de 404**: o `loading.tsx` é uma fronteira Suspense implícita acima da página, o shell (com o skeleton) é flusheado com **200** antes do `notFound()` resolver, e o dev passa a responder 200 para slug inexistente — reprovando o E2E da Task 11 (`response.status === 404`) e o smoke do plano. Até `notFound()` em `generateMetadata` não sobrevive ao flush do shell de loading. **Deferrado com o follow-up abaixo:** com o check de existência no `proxy.ts` retornando 404 *antes* do stream, o `loading.tsx` pode ser adicionado com segurança (slug ausente nem chega a flushear).
>
> **Caveat de produção — follow-up ticket:** em `next start` (PPR/cacheComponents) um slug ausente responde **200** + UI de not-found streamada + `noindex` (o shell estático flushea com 200 e o status não muda mais; a rota bloqueante devolve 404 real no dev, onde rodam smoke e E2E — por isso não bloqueia hoje). Além disso, mesmo no dev o `<body>` do 404 **não é server-rendered** (só o flight payload; o copy aparece após hydration — no-JS vê página em branco). Follow-up: check de existência do slug no `proxy.ts` (ou middleware) antes do render, devolvendo 404 real **com body server-rendered** — as docs da própria Next apontam o Proxy como o caminho. Esse mesmo ticket habilita o `loading.tsx`.
>
> **Arquivos concluídos:**
> - `apps/web/src/app/events/[slug]/page.tsx` — rota bloqueante (`instant = false`); `Header` + `<main>`; fetch com `try/catch` (throw → `<EventDetailError />`); `notFound()` fora do `try`.
> - `apps/web/src/app/not-found.tsx` — 404 global ("Evento não encontrado" + link home).
> - `apps/web/src/app/events/[slug]/ingressos/page.tsx` — placeholder estático (sem `params`).
>
> **Os snippets abaixo são registro histórico, agora obsoletos — não reexecutar:** o Step 1 (Suspense) produzia 200 no lugar do 404; o smoke do Step 4 (esperado 404) só passa com a forma bloqueante.

**Files:**
- Create: `apps/web/src/app/events/[slug]/page.tsx`
- Create: `apps/web/src/app/not-found.tsx`
- Create: `apps/web/src/app/events/[slug]/ingressos/page.tsx`

- [x] **Step 1: Criar a página de evento**

Crie `apps/web/src/app/events/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Header } from '@/components/header';
import {
  EventDetail,
  EventDetailError,
  EventDetailSkeleton,
} from '@/components/event-detail';
import { fetchEventBySlug } from '@/lib/events-api';

type EventPageProps = {
  params: Promise<{ slug: string }>;
};

async function EventContent({ params }: EventPageProps) {
  const { slug } = await params;

  try {
    const event = await fetchEventBySlug(slug);

    if (!event) {
      notFound();
    }

    return <EventDetail event={event} />;
  } catch {
    return <EventDetailError />;
  }
}

export default function EventPage({ params }: EventPageProps) {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<EventDetailSkeleton />}>
          <EventContent params={params} />
        </Suspense>
      </main>
    </>
  );
}
```

- [x] **Step 2: Criar o 404 global**

Crie `apps/web/src/app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">
        Evento não encontrado
      </h1>
      <p className="text-muted-foreground">
        O evento que você procura não existe ou saiu de cartaz.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        Voltar para a home
      </Link>
    </main>
  );
}
```

- [x] **Step 3: Criar o placeholder de ingressos**

Crie `apps/web/src/app/events/[slug]/ingressos/page.tsx` (não lê `params` — rota estática, substituída pelo mapa de assentos na F2):

```tsx
import Link from 'next/link';
import { Header } from '@/components/header';

export default function IngressosPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-heading text-3xl font-bold">
          Escolha de ingressos
        </h1>
        <p className="text-muted-foreground">
          O mapa de assentos e a escolha de setor chegam na fase de compra.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-primary hover:underline"
        >
          Voltar para a home
        </Link>
      </main>
    </>
  );
}
```

- [x] **Step 4: Verificar build e smoke manual**

Run: `pnpm --filter @ticketvibe/web build`
Expected: build conclui sem erro de tipo/rota; rotas geradas incluem `/events/[slug]` e `/events/[slug]/ingressos`.

Run (com api e web dev de pé — `pnpm --filter @ticketvibe/api dev` e `pnpm --filter @ticketvibe/web dev`):

```bash
curl -s 'http://127.0.0.1:3001/events/o-fantasma-da-opera' | head -c 200
```

Expected: JSON `{"event":{"slug":"o-fantasma-da-opera",...,"sectors":[...]}}`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/events/nao-existe'
```

Expected: `404`.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app/events apps/web/src/app/not-found.tsx
git commit -m "feat(web): add event page with 404 handling"
```

> Commit real: `f7b739b` (rota bloqueante + 404 + placeholder). A reconciliação do plano (esta nota, `loading.tsx`/proxy adiados) foi commitada depois.

---

### Task 11: E2E — navegação home → evento e 404

**Files:**
- Create: `apps/web/tests/e2e/event.spec.ts`

- [ ] **Step 1: Escrever os testes E2E**

Crie `apps/web/tests/e2e/event.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('card da home navega para a página de evento', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Ver Ingressos' }).first().click();

  await expect(page).toHaveURL(/\/events\/o-fantasma-da-opera$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'O Fantasma da Ópera' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Setores' }),
  ).toBeVisible();
  await expect(page.getByRole('list')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Escolher ingressos' }),
  ).toHaveAttribute('href', '/events/o-fantasma-da-opera/ingressos');
});

test('página de evento inexistente responde 404', async ({ page }) => {
  const response = await page.goto('/events/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Evento não encontrado' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Voltar para a home' }),
  ).toBeVisible();
});
```

Nota: o primeiro "Ver Ingressos" visível é o card de `o-fantasma-da-opera` (primeiro do carrossel de "Em Alta", ordenado por data).

- [ ] **Step 2: Rodar o E2E**

Run: `pnpm --filter @ticketvibe/web test:e2e`
Expected: 8 passed (6 existentes + 2 novos). O `globalSetup` re-semeia o banco (incluindo setores).

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/event.spec.ts
git commit -m "test(e2e): cover event page navigation"
```

---

### Task 12: Sincronização de docs

**Files:**
- Modify: `README.md`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: Atualizar o README**

Em `README.md`:
- linha 16, comentário do seed: `# categorias, locais e 12 eventos (idempotente)` → `# categorias, locais, 12 eventos com setores (idempotente)`;
- após a linha 25 (curl de busca), acrescente:

```markdown
curl -s 'http://127.0.0.1:3001/events/o-fantasma-da-opera'    # detalhe + setores: {"event":{…}}
```

- linha 46, tabela `pnpm test`: `(vitest: shared + api + web; a integração — eventos, categorias e busca — exige pnpm infra:up)` → `(vitest: shared + api + web; a integração — eventos, categorias, busca e detalhe — exige pnpm infra:up)`;
- linha 86: `rotas /health, /events (busca full-text + filtros) e /categories` → `rotas /health, /events (busca full-text + filtros + detalhe) e /categories`.

- [ ] **Step 2: Atualizar o TESTING.md**

Em `docs/TESTING.md`:
- linha 21 (linha do `apps/api`): `busca + filtros` → `busca + filtros + detalhe`;
- linha 22 (linha do `apps/web`): após `resultados`, acrescente `, página de evento`;
- linha 38: `fetchEvents + MSW (spec ao lado)` → `fetchEvents + fetchEventBySlug + MSW (spec ao lado)`;
- linha 40: `home, busca, filtros` → `home, busca, filtros, página de evento`;
- linha 73 (coluna live do E2E): `primeiro fluxo: home + busca + filtros` → `primeiro fluxo: home + busca + filtros + página de evento`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/TESTING.md
git commit -m "docs: sync tooling docs with ticket 06"
```

---

### Task 13: Gate final + fechamento do ticket 06

**Files:**
- Modify: `.scratch/ticketvibe/issues/06-pagina-de-evento.md`
- Modify: `docs/superpowers/plans/2026-10-11-ticket-06-pagina-de-evento.md`

- [ ] **Step 1: Gate completo**

Run: `pnpm lint`
Expected: 0 erros (biome).

Run: `pnpm typecheck`
Expected: 5/5 pacotes verdes (shared, api, web, e o resto do monorepo).

Run: `pnpm test`
Expected: shared 27 + api (unit + integração, com os 2 testes novos do detalhe) + web 50 — todos verdes.

Run: `pnpm --filter @ticketvibe/web test:e2e`
Expected: 8 passed.

Run: `git status`
Expected: working tree limpa.

- [ ] **Step 2: Fechar o issue 06**

Em `.scratch/ticketvibe/issues/06-pagina-de-evento.md`:
- marque as 5 caixas `- [ ]` → `- [x]`;
- troque `**Status:** ready-for-agent` por `**Status:** done`;
- acrescente ao final do arquivo:

```markdown
## Deferrals do ticket 06 (registrados no fechamento do 06)

- **Disponibilidade/lotes/assentos por setor** — setor hoje só tem `slug`, `name`, `priceFromCents`; o mapa de assentos e a reserva chegam na F2 (tickets 10/11).
- **Lotes de preço por período** — backoffice de preços fica para a F4 (tickets 17+).
- **Imagem do evento na página** — `imageUrl` continua null no seed; assets de imagem são deferral herdados do 04/05.
- **`Header` no `layout.tsx`** — segue duplicado (home + página de evento); consolidação no layout ainda aberta.
- **Página de ingressos placeholder** — rota `app/events/[slug]/ingressos` é estática e será substituída pelo mapa de assentos na F2.
- **Validação Zod do slug do path param** — deliberadamente ausente (lookup → 404); reconsiderar quando existir regra de formato de slug.
```

- [ ] **Step 3: Marcar o plano como executado**

Em `docs/superpowers/plans/2026-10-11-ticket-06-pagina-de-evento.md`, troque todos os marcadores `- [ ]` por `- [x]` (inclusive no header e nesta task).

- [ ] **Step 4: Commit**

```bash
git add .scratch/ticketvibe/issues/06-pagina-de-evento.md docs/superpowers/plans/2026-10-11-ticket-06-pagina-de-evento.md
git commit -m "docs: mark ticket 06 as done"
```

---

## Self-Review (feito pelo autor do plano)

- [x] **Spec coverage** — os 5 critérios do issue 06 mapeiam: (1) endpoint+setores+Zod → Tasks 1–6; (2) página web → Tasks 7–10; (3) CTA → Tasks 8 e 10; (4) estados carregamento/inexistente → Tasks 8 (skeleton/erro) e 10 (not-found) + E2E 404 na Task 11; (5) testes integração/componente/E2E → Tasks 6, 8 e 11.
- [x] **Placeholder scan** — nenhum TBD/TODO/"similar to"; todo step de código tem o código completo; comandos têm saída esperada; o único nome desconhecido (`0002_<nome>`) é descoberto por `ls` na própria task.
- [x] **Type consistency** — `SectorEntity`/`EventDetailEntity` (Task 4) = campos de `sectorSchema` (Task 1); `findBySlug(slug): Promise<EventDetailEntity | null>` idêntico em contrato, in-memory, Drizzle e use case; `fetchEventBySlug` devolve `EventDetailDto | null` (revisado na execução da Task 7 — 404→`null`, demais falhas lançam) e a página (Task 10) trata `null`→`notFound()` / throw→`<EventDetailError />`; DTO `{ event }` casa com `eventDetailResponseSchema` (Task 1) usado nos testes de rota/integração/web.
- [x] **Invariantes** — `min(setores) === priceFromCents` garantido nos fixtures (Task 3) e exercitado pelo teste de integração (Task 6); ordenação preço-asc/slug-asc implementada em in-memory e Drizzle e assertada nos dois.
- [x] **Riscos conhecidos** — `app/not-found.tsx` e páginas dinâmicas passam pelo `next build` (Task 10 verifica); E2E depende de seed com setores (Tasks 3 + globalSetup); stubs quebrados pelo novo tipo do in-memory estão todos listados (Task 4, Step 4).
