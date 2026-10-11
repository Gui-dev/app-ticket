# Ticket 05 — Busca e filtros de eventos — Implementation Plan

> **For the implementing agent:** This plan is executed task-by-task with the `subagent-driven-development` skill (implementer → spec reviewer → code quality reviewer per task). Every step is bite-sized: 2–5 minutes of work, a commit at the end of each task. Do not skip the "Run" steps — evidence before assertions.
>
> **Repo facts:** branch `main` (commits are made directly on `main`, never pushed). Comments and commit messages in **English**; prompts and docs in **pt-BR** where already pt-BR. Conventional Commits, imperative, no trailing period. Infra via podman (`pnpm infra:up`); Postgres 16-alpine; dev DB `ticketvibe`, test DB `ticketvibe_test`. All the code below was checked against the installed versions on 2026-10-10.

## Goal

O visitante **busca** por nome do evento, descrição, local ou cidade e **filtra** os resultados por categoria, estado e intervalo de datas, combinando os critérios sem recarregar a página — vendo a lista de eventos que atendem aos critérios. Entrega a busca full-text no Postgres, o endpoint REST com filtros, os chips de categoria (mockup) e a cobertura (integração das consultas, unitários dos filtros, componentes com MSW, E2E de busca+filtro).

## Architecture

- **Contrato primeiro:** `packages/shared` é a costura única web↔api. `searchFiltersSchema` (`q`, `category`, `state`, `from`, `to`) é embutido em `listEventsQuerySchema` (`extend`), e `listCategoriesResponseSchema` cobre o novo `GET /categories`.
- **Busca full-text:** coluna `search_vector` (`tsvector`) em `events`, mantida pelo **seed** (sem trigger), com índice **GIN**. Conteúdo: `setweight(to_tsvector('portuguese', unaccent(title)), 'A') || setweight(..., unaccent(description)), 'B') || setweight(..., unaccent(venue.name || ' ' || venue.city)), 'C')`. Consulta: `search_vector @@ websearch_to_tsquery('portuguese', unaccent($q))`. Extensão `unaccent` criada na migração 0001. `pg_trgm` (fuzzy `standup`→`stand-up`) fica **deferido** para 06.
- **Hexagonal:** módulo novo `modules/categories` espelha `modules/events` (domain/infra/use-cases/routes). `GET /events` é **estendido** (a rota já flui `parsed.data` para o use case); `GET /categories` é novo.
- **Filtros:** domínio recebe `filters?: SearchFilters`; in-memory e Drizzle implementam a **mesma semântica** (texto = AND de termos sobre title+description+venueName+venueCity; state exato; category por slug; from/to em dias UTC inclusivos).
- **Web:** header ganha uma ilha client `HeaderSearch` (URL-driven via `router.replace`, `useSearchParams` dentro de Suspense próprio); linha de `CategoryChips` (client); quando há filtros ativos a home troca hero+carrossel por `SearchResults` (grid + estados vazio/erro). `fetchEvents`/`fetchCategories` passam a devolver **resultado discriminado** (`{ok:true,...} | {ok:false,error}`) — fold-in do deferral do review final do 04.
- **E2E:** Playwright/Chromium contra o stack real (web :3000, api :3001), `globalSetup` semeia o banco.

## Tech Stack

Fastify 5 · Drizzle ORM 0.45 + drizzle-kit 0.31 · Postgres 16 (`unaccent`) · Zod 4 (`z.iso.date()`) · Vitest 5 (api/shared) · Vitest 5 + RTL 16 + jsdom 30 + MSW 2 (web) · Next 16.4 App Router (`cacheComponents`) · React 19.3 · Tailwind v4 · lucide-react 1.53 · Playwright (a instalar).

## Environment facts (verified 2026-10-10)

- `CREATE EXTENSION IF NOT EXISTS unaccent` **já rodou no DB dev** durante a validação; a migração deve incluí-la (idempotente).
- **Validação empírica com o seed atual:**
  - `q=opera` → `o-fantasma-da-opera` (acento); `q=fantasma` → 1; `q=teatro` → `[o-fantasma-da-opera, pequeno-principe-musical, a-hora-e-a-vez]`; `q=stand` → `[standup-noite-de-verdades, melhor-de-standup-grand-finale]`; `q=musical` → 2; `q=fantasma opera` → 1 (AND); `q=fantasma cyberpunk` → 0; `q=zzz` → 0; **`q=standup` → 0** (lexema do doc é `stand`/`stand-up`; fuzzy fica para 06).
  - `category=teatro` → `[a-hora-e-a-vez]`; `category=festivais` → `[cyberpunk-electronic-festival, festival-de-verao]`; `state=RJ` → `[sertaneja-rio, festival-de-verao]`; `from=2026-11-01&to=2026-11-30` → 5 eventos (`standup-noite-de-verdades, corrida-de-rua-sp, pequeno-principe-musical, neon-lights-world-tour, sertaneja-rio`).
  - `GET /categories` por `name` → slugs `[comedy, danca, esportes, festivais, infantil, shows, teatro]`.
- Não existe `apps/api/vitest.config.ts` → paralelismo default → **só um arquivo de spec pode tocar `ticketvibe_test`**. Toda integração nova (categories + busca) vai para o **mesmo** `events.routes.integration.spec.ts`. `apps/web` restringe `include` a `src/**`.
- `apps/api` `app.spec.ts` chama `buildApp()` sem opções: criar `Pool` é lazy (sem conexão até a primeira query), então defaults novos não abrem conexão em testes unitários.
- `user-event` **não** instalado → usar `fireEvent` no RTL. `next/navigation` precisa de `vi.mock` nos specs de componentes client.
- Next 16 tipa `searchParams` da página como `Promise<Record<string, string | string[] | undefined>>` (confirmado em `.next/types/routes.d.ts`).

## Scope decisions (YAGNI)

- Rota única `GET /events` estendida (não criar `/events/search`). `view` é preservado.
- UI de **data** e **localização** no header: deferida (a API já aceita `from`/`to`/`state`; mockups não as mostram). Categorias são a UI de filtro entregue.
- Busca no header é client-side via URL (sem reload). Chips são client islands.
- Sem trigger de banco: o vetor é gravado pelo seed. `pg_trgm`, provider Zod/OpenAPI, coverage e `Header` no `layout.tsx` permanecem deferidos.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `packages/shared/src/index.ts` | editar | `searchFiltersSchema`, filtros em `listEventsQuerySchema`, categorias response |
| `packages/shared/src/index.spec.ts` | editar | Testes dos contratos novos |
| `apps/api/src/modules/events/domain/events-repository.ts` | editar | `findAll(view, filters?)` |
| `apps/api/src/modules/events/infra/in-memory-events-repository.ts` | editar | Filtros em memória |
| `apps/api/src/modules/events/use-cases/list-events.use-case.ts` | editar | Repassa `view` + filtros |
| `apps/api/src/modules/events/use-cases/list-events.use-case.spec.ts` | editar | Filtros no use case |
| `apps/api/src/modules/events/routes/events.routes.spec.ts` | editar | Filtros via HTTP (in-memory) |
| `apps/api/src/modules/categories/**` | criar | Módulo categories (domain/infra/use-cases/routes) |
| `apps/api/src/modules/events/routes/events.routes.integration.spec.ts` | editar | Integração: categories + FTS/filtros |
| `apps/api/src/app.ts` | editar | Wiring de `categoriesRepository` |
| `apps/api/src/db/schema.ts` | editar | Coluna `search_vector` + índice GIN |
| `apps/api/drizzle/0001_*.sql` + `meta/` | criar | Migração: `unaccent`, coluna, backfill, índice |
| `apps/api/src/db/seed-fixtures.ts` | editar | Grava `search_vector` |
| `apps/api/src/modules/events/infra/drizzle-events-repository.ts` | editar | Condições de busca/filtro no SQL |
| `apps/web/src/lib/search-params.ts` (+ spec) | criar | Parse/build de filtros na URL |
| `apps/web/src/lib/events-api.ts` (+ spec) | editar | `fetchEvents(query)` discriminado + `fetchCategories` |
| `apps/web/src/components/header-search.tsx` (+ spec) | criar | Ilha de busca no header |
| `apps/web/src/components/header.tsx` | editar | Usa `HeaderSearch` |
| `apps/web/src/lib/category-icons.ts` | criar | Ícone por slug de categoria |
| `apps/web/src/components/home/category-chips.tsx` (+ spec) | criar | Linha de chips |
| `apps/web/src/components/home/search-results.tsx` (+ spec) | criar | Grid + estados vazio/erro |
| `apps/web/src/components/home/events-section.tsx` | editar | Estado de erro opcional |
| `apps/web/src/app/page.tsx` | editar | `searchParams` + composição dos estados |
| `apps/web/playwright.config.ts`, `apps/web/tests/e2e/**`, `apps/web/package.json`, `apps/web/.gitignore` | criar/editar | E2E |
| `apps/web/src/app/globals.css` | editar | Tokens de gradiente |
| `README.md`, `docs/TESTING.md`, `docs/skills/*` | editar | Sincronização de docs |

## Preconditions

- `pnpm infra:up` (Postgres/Redis/Mailpit de pé) — a validação FTS, a migração e a integração exigem o Postgres.
- `pnpm install` feito; `pnpm --filter @ticketvibe/api db:migrate` aplicado antes de rodar a API/seed.
- Gate de porte: `pnpm lint && pnpm typecheck && pnpm test` verdes ao fim de cada task que toca código.

---

## Task 1 — `feat(shared): add search filters and categories contracts`

**Files:** `packages/shared/src/index.ts`, `packages/shared/src/index.spec.ts`

- [x] **Step 1: Escreva os testes que falham** em `index.spec.ts`. Substitua o bloco `describe('listEventsQuerySchema', ...)` por:

```ts
describe('listEventsQuerySchema', () => {
  it('accepts an empty object and defaults view to all', () => {
    expect(listEventsQuerySchema.parse({})).toEqual({ view: 'all' });
  });

  it('accepts each supported view', () => {
    for (const view of ['all', 'featured', 'hot'] as const) {
      expect(listEventsQuerySchema.parse({ view })).toEqual({ view });
    }
  });

  it('rejects an unknown view', () => {
    expect(() => listEventsQuerySchema.parse({ view: 'unknown' })).toThrow();
  });

  it('keeps the search filters alongside the view', () => {
    expect(
      listEventsQuerySchema.parse({
        view: 'hot',
        q: '  fantasma ',
        category: 'shows',
        state: 'sp',
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toEqual({
      view: 'hot',
      q: 'fantasma',
      category: 'shows',
      state: 'SP',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });
});

describe('searchFiltersSchema', () => {
  it('trims the query and uppercases the state', () => {
    expect(searchFiltersSchema.parse({ q: ' teatro ', state: 'rj' })).toEqual({
      q: 'teatro',
      state: 'RJ',
    });
  });

  it('accepts an empty object (no filters)', () => {
    expect(searchFiltersSchema.parse({})).toEqual({});
  });

  it('rejects an empty query', () => {
    expect(() => searchFiltersSchema.parse({ q: '   ' })).toThrow();
  });

  it('rejects a state that is not two letters', () => {
    expect(() => searchFiltersSchema.parse({ state: 'XYZ' })).toThrow();
  });

  it('rejects a date that is not ISO yyyy-mm-dd', () => {
    expect(() => searchFiltersSchema.parse({ from: '01/11/2026' })).toThrow();
  });
});

describe('listCategoriesResponseSchema', () => {
  it('accepts a list of categories', () => {
    const payload = { categories: [{ slug: 'shows', name: 'Shows' }] };
    expect(listCategoriesResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a category without a name', () => {
    expect(() =>
      listCategoriesResponseSchema.parse({ categories: [{ slug: 'shows' }] }),
    ).toThrow();
  });
});
```

Atualize os imports no topo do spec:

```ts
import {
  eventSchema,
  healthResponseSchema,
  listCategoriesResponseSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  searchFiltersSchema,
} from './index';
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/shared test
```

Expected: falha (`searchFiltersSchema`/`listCategoriesResponseSchema` não existem; estado não uppercased).

- [x] **Step 3: Implemente** em `index.ts`. Substitua o bloco `listEventsQuerySchema` (linhas 35–39) por:

```ts
export const searchFiltersSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const listEventsQuerySchema = searchFiltersSchema.extend({
  view: z.enum(['all', 'featured', 'hot']).optional().default('all'),
});

export type ListEventsQuery = z.input<typeof listEventsQuerySchema>;
```

E ao fim do arquivo (depois de `listEventsResponseSchema`):

```ts
export const listCategoriesResponseSchema = z.object({
  categories: z.array(categorySchema),
});

export type ListCategoriesResponse = z.infer<
  typeof listCategoriesResponseSchema
>;

export type CategoryDto = z.infer<typeof categorySchema>;
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/shared test && pnpm --filter @ticketvibe/shared typecheck
```

Expected: todos os testes do shared passam (12 anteriores + 11 novos).

- [x] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add search filters and categories contracts"
```

---

## Task 2 — `feat(api): filter events in the listing use case`

**Files:** `apps/api/src/modules/events/domain/events-repository.ts`, `.../infra/in-memory-events-repository.ts`, `.../use-cases/list-events.use-case.ts`, `.../use-cases/list-events.use-case.spec.ts`

- [x] **Step 1: Escreva os testes que falham** — substitua `list-events.use-case.spec.ts` por completo:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { EventEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { ListEventsUseCase } from './list-events.use-case';

const stubEvents: EventEntity[] = [
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
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'sertaneja',
    title: 'Sertaneja Rio',
    description: 'Show de sertanejo às margens do Rio.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Vivo Rio',
    venueCity: 'Rio de Janeiro',
    venueState: 'RJ',
    startsAt: new Date('2026-11-28T22:00:00.000Z'),
    priceFromCents: 22000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
  },
];

function createUseCase(events: EventEntity[] = stubEvents): ListEventsUseCase {
  return new ListEventsUseCase(new InMemoryEventsRepository(events));
}

function slugsOf(events: EventEntity[]): string[] {
  return events.map((event) => event.slug);
}

describe('ListEventsUseCase', () => {
  it('returns all events sorted by date without mutating the source array', async () => {
    const result = await createUseCase().execute({ view: 'all' });

    expect(slugsOf(result)).toEqual(['fantasma', 'standup', 'sertaneja']);
    expect(slugsOf(stubEvents)).toEqual(['fantasma', 'standup', 'sertaneja']);
  });

  it('treats an empty query as the all view', async () => {
    const result = await createUseCase().execute({});

    expect(slugsOf(result)).toEqual(['fantasma', 'standup', 'sertaneja']);
  });

  it('returns only featured events for view=featured', async () => {
    const result = await createUseCase().execute({ view: 'featured' });

    expect(slugsOf(result)).toEqual(['fantasma']);
  });

  it('filters by a text term across title, venue and city', async () => {
    expect(slugsOf(await createUseCase().execute({ q: 'teatro' }))).toEqual([
      'fantasma',
    ]);
    expect(slugsOf(await createUseCase().execute({ q: 'rio' }))).toEqual([
      'sertaneja',
    ]);
  });

  it('matches all terms (AND) and ignores missing terms', async () => {
    expect(
      slugsOf(await createUseCase().execute({ q: 'fantasma ópera' })),
    ).toEqual(['fantasma']);
    expect(
      slugsOf(await createUseCase().execute({ q: 'fantasma cyberpunk' })),
    ).toEqual([]);
  });

  it('filters by category, state and date range', async () => {
    expect(slugsOf(await createUseCase().execute({ category: 'shows' }))).toEqual(
      ['fantasma', 'sertaneja'],
    );
    expect(slugsOf(await createUseCase().execute({ state: 'RJ' }))).toEqual([
      'sertaneja',
    ]);
    expect(
      slugsOf(
        await createUseCase().execute({
          from: '2026-11-01',
          to: '2026-11-30',
        }),
      ),
    ).toEqual(['standup', 'sertaneja']);
  });

  it('combines view and filters', async () => {
    const result = await createUseCase().execute({
      view: 'hot',
      category: 'comedy',
    });

    expect(slugsOf(result)).toEqual(['standup']);
  });

  it('forwards view and filters to the repository', async () => {
    const repository = new InMemoryEventsRepository(stubEvents);
    const findAll = vi.spyOn(repository, 'findAll');

    await new ListEventsUseCase(repository).execute({
      view: 'hot',
      q: 'show',
      state: 'SP',
    });

    expect(findAll).toHaveBeenCalledWith('hot', {
      q: 'show',
      state: 'SP',
    });
  });
});
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/api test list-events.use-case
```

Expected: falha (assinatura de `findAll`/`execute` ainda não aceita filtros).

- [x] **Step 3: Implemente.** `domain/events-repository.ts`:

```ts
import type { SearchFilters } from '@ticketvibe/shared';
import type { EventEntity, EventView } from './event-entity';

export interface EventsRepository {
  findAll(view: EventView, filters?: SearchFilters): Promise<EventEntity[]>;
}
```

`use-cases/list-events.use-case.ts`:

```ts
import type { ListEventsQuery } from '@ticketvibe/shared';
import type { EventEntity } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class ListEventsUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  async execute(query: ListEventsQuery): Promise<EventEntity[]> {
    const { view = 'all', ...filters } = query;
    return this.eventsRepository.findAll(view, filters);
  }
}
```

`infra/in-memory-events-repository.ts`:

```ts
import type { SearchFilters } from '@ticketvibe/shared';
import type { EventEntity, EventView } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

function matchesQuery(event: EventEntity, query: string): boolean {
  const haystack = `${event.title} ${event.description} ${event.venueName} ${event.venueCity}`;
  const haystackLower = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystackLower.includes(term));
}

export class InMemoryEventsRepository implements EventsRepository {
  constructor(private readonly items: EventEntity[]) {}

  findAll(
    view: EventView,
    filters: SearchFilters = {},
  ): Promise<EventEntity[]> {
    let filtered = this.items;

    if (view === 'featured') {
      filtered = filtered.filter((item) => item.featured);
    } else if (view === 'hot') {
      filtered = filtered.filter((item) => item.isHot);
    }
    if (filters.category) {
      filtered = filtered.filter(
        (item) => item.categorySlug === filters.category,
      );
    }
    if (filters.state) {
      filtered = filtered.filter((item) => item.venueState === filters.state);
    }
    if (filters.q) {
      filtered = filtered.filter((item) => matchesQuery(item, filters.q ?? ''));
    }
    if (filters.from) {
      const from = new Date(`${filters.from}T00:00:00.000Z`);
      filtered = filtered.filter((item) => item.startsAt >= from);
    }
    if (filters.to) {
      const to = new Date(`${filters.to}T23:59:59.999Z`);
      filtered = filtered.filter((item) => item.startsAt <= to);
    }

    const sorted = [...filtered].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );

    return Promise.resolve(sorted);
  }
}
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/api test list-events.use-case && pnpm --filter @ticketvibe/api typecheck
```

Expected: passa.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/events
git commit -m "feat(api): filter events in the listing use case"
```

## Task 3 — `feat(api): parse search filters on the events route`

**Files:** `apps/api/src/modules/events/routes/events.routes.spec.ts` (a rota **não** muda; `parsed.data` já flui para o use case)

- [x] **Step 1: Escreva os testes que falham.** Acrescente ao `describe('GET /events', ...)`, antes do fechamento:

```ts
  it('filters by text across title, venue and city', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=municipal',
    });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.title)).toEqual(['destaque']);
  });

  it('filters by category slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?category=teatro',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.title)).toEqual(['destaque']);
  });

  it('filters by state', async () => {
    const sp = await app.inject({ method: 'GET', url: '/events?state=SP' });
    const rj = await app.inject({ method: 'GET', url: '/events?state=rj' });

    expect(
      listEventsResponseSchema
        .parse(sp.json())
        .events.map((event) => event.title),
    ).toEqual(['em-alta']);
    expect(
      listEventsResponseSchema
        .parse(rj.json())
        .events.map((event) => event.title),
    ).toEqual(['destaque']);
  });

  it('filters by date range (inclusive, UTC days)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?from=2026-06-10&to=2026-06-20',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.title)).toEqual(['comum']);
  });

  it('combines query and category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=show&category=teatro',
    });

    expect(response.statusCode).toBe(200);
    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events).toEqual([]);
  });

  it('rejects an invalid date and an invalid state with 400', async () => {
    const badDate = await app.inject({
      method: 'GET',
      url: '/events?from=01/06/2026',
    });
    const badState = await app.inject({
      method: 'GET',
      url: '/events?state=XYZ',
    });

    expect(badDate.statusCode).toBe(400);
    expect(badDate.json().error).toBe('invalid_query');
    expect(badState.statusCode).toBe(400);
    expect(badState.json().error).toBe('invalid_query');
  });
```

- [x] **Step 2: Rode e veja passar (a rota já suporta)**

```bash
pnpm --filter @ticketvibe/api test events.routes.spec
```

Expected: passa — os filtros já são parseados pelo `listEventsQuerySchema` (task 1) e aplicados pelo use case (task 2).

- [x] **Step 3: Commit**

```bash
git add apps/api/src/modules/events/routes/events.routes.spec.ts
git commit -m "feat(api): parse search filters on the events route"
```

---

## Task 4 — `feat(api): add categories listing route`

**Files:** `apps/api/src/modules/categories/**` (novo), `apps/api/src/app.ts`, `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`

- [x] **Step 1: Escreva os testes que falham.** Crie `apps/api/src/modules/categories/use-cases/list-categories.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CategoryEntity } from '../domain/category-entity';
import { InMemoryCategoriesRepository } from '../infra/in-memory-categories-repository';
import { ListCategoriesUseCase } from './list-categories.use-case';

const stubCategories: CategoryEntity[] = [
  { slug: 'teatro', name: 'Teatro' },
  { slug: 'comedy', name: 'Comédia' },
  { slug: 'shows', name: 'Shows' },
];

describe('ListCategoriesUseCase', () => {
  it('returns categories ordered by name', async () => {
    const useCase = new ListCategoriesUseCase(
      new InMemoryCategoriesRepository(stubCategories),
    );

    const result = await useCase.execute();

    expect(result.map((category) => category.slug)).toEqual([
      'comedy',
      'shows',
      'teatro',
    ]);
  });
});
```

Crie `apps/api/src/modules/categories/routes/categories.routes.spec.ts`:

```ts
import { listCategoriesResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { InMemoryEventsRepository } from '../../events/infra/in-memory-events-repository.js';
import { InMemoryCategoriesRepository } from '../infra/in-memory-categories-repository.js';

describe('GET /categories', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      eventsRepository: new InMemoryEventsRepository([]),
      categoriesRepository: new InMemoryCategoriesRepository([
        { slug: 'shows', name: 'Shows' },
        { slug: 'comedy', name: 'Comédia' },
      ]),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns all categories ordered by name', async () => {
    const response = await app.inject({ method: 'GET', url: '/categories' });

    expect(response.statusCode).toBe(200);
    const body = listCategoriesResponseSchema.parse(response.json());
    expect(body.categories.map((category) => category.slug)).toEqual([
      'comedy',
      'shows',
    ]);
  });
});
```

- [x] **Step 2: Rode e veja falhar** (o módulo não existe)

```bash
pnpm --filter @ticketvibe/api test categories
```

Expected: falha de import/módulo.

- [x] **Step 3: Implemente.** Crie os arquivos:

`apps/api/src/modules/categories/domain/category-entity.ts`:

```ts
export interface CategoryEntity {
  slug: string;
  name: string;
}
```

`apps/api/src/modules/categories/domain/categories-repository.ts`:

```ts
import type { CategoryEntity } from './category-entity';

export interface CategoriesRepository {
  findAll(): Promise<CategoryEntity[]>;
}
```

`apps/api/src/modules/categories/infra/in-memory-categories-repository.ts`:

```ts
import type { CategoryEntity } from '../domain/category-entity';
import type { CategoriesRepository } from '../domain/categories-repository';

export class InMemoryCategoriesRepository implements CategoriesRepository {
  constructor(private readonly items: CategoryEntity[]) {}

  findAll(): Promise<CategoryEntity[]> {
    const sorted = [...this.items].sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(sorted);
  }
}
```

`apps/api/src/modules/categories/infra/drizzle-categories-repository.ts`:

```ts
import { asc } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories } from '../../../db/schema.js';
import type { CategoryEntity } from '../domain/category-entity.js';
import type { CategoriesRepository } from '../domain/categories-repository.js';

export class DrizzleCategoriesRepository implements CategoriesRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<CategoryEntity[]> {
    return this.db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name));
  }
}
```

`apps/api/src/modules/categories/use-cases/list-categories.use-case.ts`:

```ts
import type { CategoryEntity } from '../domain/category-entity';
import type { CategoriesRepository } from '../domain/categories-repository';

export class ListCategoriesUseCase {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async execute(): Promise<CategoryEntity[]> {
    return this.categoriesRepository.findAll();
  }
}
```

`apps/api/src/modules/categories/routes/categories.routes.ts`:

```ts
import { type CategoryDto, listCategoriesResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { CategoryEntity } from '../domain/category-entity.js';
import type { CategoriesRepository } from '../domain/categories-repository.js';
import { ListCategoriesUseCase } from '../use-cases/list-categories.use-case.js';

function toCategoryDto(entity: CategoryEntity): CategoryDto {
  return { slug: entity.slug, name: entity.name };
}

export function registerCategoryRoutes(
  app: FastifyInstance,
  categoriesRepository: CategoriesRepository,
): void {
  const useCase = new ListCategoriesUseCase(categoriesRepository);

  app.get('/categories', async () => {
    const list = await useCase.execute();
    return listCategoriesResponseSchema.parse({
      categories: list.map(toCategoryDto),
    });
  });
}
```

Substitua `apps/api/src/app.ts` por completo:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { createDb, type Db } from './db/client.js';
import type { CategoriesRepository } from './modules/categories/domain/categories-repository.js';
import { DrizzleCategoriesRepository } from './modules/categories/infra/drizzle-categories-repository.js';
import { registerCategoryRoutes } from './modules/categories/routes/categories.routes.js';
import type { EventsRepository } from './modules/events/domain/events-repository.js';
import { DrizzleEventsRepository } from './modules/events/infra/drizzle-events-repository.js';
import { registerEventRoutes } from './modules/events/routes/events.routes.js';

export function buildApp(
  options: {
    eventsRepository?: EventsRepository;
    categoriesRepository?: CategoriesRepository;
  } = {},
): FastifyInstance {
  const app = Fastify({ logger: false });

  let defaultDb: Db | null = null;
  const getDefaultDb = (): Db => {
    if (!defaultDb) defaultDb = createDb();
    return defaultDb;
  };

  const eventsRepository =
    options.eventsRepository ?? new DrizzleEventsRepository(getDefaultDb());
  const categoriesRepository =
    options.categoriesRepository ??
    new DrizzleCategoriesRepository(getDefaultDb());

  app.addHook('onClose', async () => {
    await defaultDb?.$client.end();
  });

  registerEventRoutes(app, eventsRepository);
  registerCategoryRoutes(app, categoriesRepository);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
```

Agora edite `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`: no `beforeAll`, injete o repositório de categories apontando para o **test DB**:

```ts
    app = buildApp({
      eventsRepository: new DrizzleEventsRepository(testDb),
      categoriesRepository: new DrizzleCategoriesRepository(testDb),
    });
```

Ajuste os imports (inclua `listCategoriesResponseSchema` no import existente do shared e o repositório novo):

```ts
import { listCategoriesResponseSchema, listEventsResponseSchema } from '@ticketvibe/shared';
import { DrizzleCategoriesRepository } from '../../categories/infra/drizzle-categories-repository.js';
```

E acrescente um `describe` novo após o `describe('GET /events (postgres integration)')`:

```ts
describe('GET /categories (postgres integration)', () => {
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

  it('lists the seven seeded categories ordered by name', async () => {
    const response = await app.inject({ method: 'GET', url: '/categories' });

    expect(response.statusCode).toBe(200);
    const body = listCategoriesResponseSchema.parse(response.json());
    expect(body.categories.map((category) => category.slug)).toEqual([
      'comedy',
      'danca',
      'esportes',
      'festivais',
      'infantil',
      'shows',
      'teatro',
    ]);
  });
});
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/api test categories && pnpm --filter @ticketvibe/api typecheck
pnpm --filter @ticketvibe/api test events.routes.integration
```

Expected: passa (a integração exige `pnpm infra:up`).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/categories apps/api/src/app.ts apps/api/src/modules/events/routes/events.routes.integration.spec.ts
git commit -m "feat(api): add categories listing route"
```

---

## Task 5 — `feat(api): add tsvector search column and index`

**Files:** `apps/api/src/db/schema.ts`, `apps/api/drizzle/0001_*.sql`, `apps/api/drizzle/meta/**`

- [x] **Step 1: Edite `schema.ts`.** Troque o import de `drizzle-orm/pg-core`, adicione o `customType` e a coluna + índice:

```ts
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});
```

Troque a definição de `events` por (adicione `searchVector` e o terceiro argumento com o índice):

```ts
export const events = pgTable(
  'events',
  {
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
    startsAt: timestamp('starts_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    priceFromCents: integer('price_from_cents').notNull(),
    imageUrl: text('image_url'),
    badgeLabel: text('badge_label'),
    featured: boolean('featured').notNull().default(false),
    isHot: boolean('is_hot').notNull().default(false),
    searchVector: tsvector('search_vector'),
  },
  (table) => [index('events_search_vector_idx').using('gin', table.searchVector)],
);
```

- [x] **Step 2: Gere a migração**

```bash
pnpm --filter @ticketvibe/api db:generate
ls apps/api/drizzle
```

Expected: cria `apps/api/drizzle/0001_<palavras>.sql` e atualiza `meta/_journal.json` + `meta/0001_snapshot.json`.

- [x] **Step 3: Renomeie e complete a migração.** Renomeie o arquivo gerado para `0001_events_search_vector.sql` e ajuste o `tag` no `meta/_journal.json` para `0001_events_search_vector`. Conteúdo final do SQL:

```sql
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
UPDATE "events" e
SET "search_vector" = (
  setweight(to_tsvector('portuguese', unaccent(e."title")), 'A') ||
  setweight(to_tsvector('portuguese', unaccent(e."description")), 'B') ||
  setweight(to_tsvector('portuguese', unaccent(v."name" || ' ' || v."city")), 'C')
)
FROM "venues" v
WHERE v."id" = e."venue_id";--> statement-breakpoint
CREATE INDEX "events_search_vector_idx" ON "events" USING gin ("search_vector");
```

> Se o gerador emitir as linhas de `ALTER TABLE`/`CREATE INDEX` com formatação ligeiramente diferente, preserve as linhas geradas e apenas **prefixe** o `CREATE EXTENSION` e **insira** o `UPDATE` de backfill antes do `CREATE INDEX`.

- [x] **Step 4: Aplique a migração e valide a coluna**

```bash
pnpm --filter @ticketvibe/api db:migrate
pnpm --filter @ticketvibe/api exec tsx -e "import {Pool} from 'pg'; const p=new Pool({connectionString:'postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe'}); p.query(\"select column_name,data_type from information_schema.columns where table_name='events' and column_name='search_vector'\").then(r=>{console.log(r.rows);return p.end()})"
```

Expected: `[ { column_name: 'search_vector', data_type: 'tsvector' } ]`.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): add tsvector search column and index"
```

## Task 6 — `feat(api): keep the search vector in the seed fixtures`

**Files:** `apps/api/src/db/seed-fixtures.ts`, `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`

- [x] **Step 1: Escreva o teste que falha.** Adicione ao `describe('GET /events (postgres integration)')`:

```ts
  it('stores a search vector for every seeded event', async () => {
    const { rows } = await testDb.$client.query(
      'select count(*)::int as missing from events where search_vector is null',
    );

    expect(rows[0].missing).toBe(0);
  });
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/api test events.routes.integration
```

Expected: falha (`missing` = 12; o seed ainda não grava o vetor).

- [x] **Step 3: Implemente.** Substitua `seed-fixtures.ts` por completo:

```ts
import { sql } from 'drizzle-orm';

import type { Db } from './client.js';
import { categoryFixtures, eventFixtures, venueFixtures } from './fixtures.js';
import { categories, events, venues } from './schema.js';

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
    const venueBySlug = new Map(venueFixtures.map((row) => [row.slug, row]));

    for (const fixture of eventFixtures) {
      const categoryId = categoryIds.get(fixture.categorySlug);
      const venueId = venueIds.get(fixture.venueSlug);
      const venue = venueBySlug.get(fixture.venueSlug);
      if (!categoryId || !venueId || !venue) {
        throw new Error(`Missing category or venue for event "${fixture.slug}"`);
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
        searchVector: sql`setweight(to_tsvector('portuguese', unaccent(${fixture.title})), 'A')
          || setweight(to_tsvector('portuguese', unaccent(${fixture.description})), 'B')
          || setweight(to_tsvector('portuguese', unaccent(${venue.name} || ' ' || ${venue.city})), 'C')`,
      });
    }
  });
}
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/api test events.routes.integration && pnpm --filter @ticketvibe/api typecheck
```

Expected: passa (`missing` = 0).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/db/seed-fixtures.ts apps/api/src/modules/events/routes/events.routes.integration.spec.ts
git commit -m "feat(api): keep the search vector in the seed fixtures"
```

---

## Task 7 — `feat(api): search events with postgres full text`

**Files:** `apps/api/src/modules/events/infra/drizzle-events-repository.ts`, `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`

- [x] **Step 1: Escreva os testes que falham.** Adicione ao `describe('GET /events (postgres integration)')`:

```ts
  it('finds an event by accent-insensitive title term', async () => {
    const response = await app.inject({ method: 'GET', url: '/events?q=opera' });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
    ]);
  });

  it('finds events by venue name', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=teatro',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'pequeno-principe-musical',
      'a-hora-e-a-vez',
    ]);
  });

  it('matches all terms (AND) and returns nothing when a term is absent', async () => {
    const both = await app.inject({
      method: 'GET',
      url: '/events?q=fantasma%20opera',
    });
    const none = await app.inject({
      method: 'GET',
      url: '/events?q=fantasma%20cyberpunk',
    });

    expect(
      listEventsResponseSchema
        .parse(both.json())
        .events.map((event) => event.slug),
    ).toEqual(['o-fantasma-da-opera']);
    expect(listEventsResponseSchema.parse(none.json()).events).toEqual([]);
  });

  it('filters by category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?category=festivais',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'cyberpunk-electronic-festival',
      'festival-de-verao',
    ]);
  });

  it('filters by state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?state=RJ',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'sertaneja-rio',
      'festival-de-verao',
    ]);
  });

  it('filters by date range (inclusive, UTC days)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?from=2026-11-01&to=2026-11-30',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'corrida-de-rua-sp',
      'pequeno-principe-musical',
      'neon-lights-world-tour',
      'sertaneja-rio',
    ]);
  });

  it('combines query and category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events?q=stand&category=comedy',
    });

    const body = listEventsResponseSchema.parse(response.json());
    expect(body.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'melhor-de-standup-grand-finale',
    ]);
  });

  it('returns nothing for an unknown term', async () => {
    const response = await app.inject({ method: 'GET', url: '/events?q=zzz' });

    expect(listEventsResponseSchema.parse(response.json()).events).toEqual([]);
  });
```

- [x] **Step 2: Rode e veja falhar** (o repositório ignora filtros)

```bash
pnpm --filter @ticketvibe/api test events.routes.integration
```

Expected: falha (retorna os 12 eventos).

- [x] **Step 3: Implemente.** Substitua `drizzle-events-repository.ts` por completo:

```ts
import type { SearchFilters } from '@ticketvibe/shared';
import { and, asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories, events, venues } from '../../../db/schema.js';
import type { EventEntity, EventView } from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';

interface EventRow {
  events: {
    id: string;
    slug: string;
    title: string;
    description: string;
    startsAt: Date;
    priceFromCents: number;
    imageUrl: string | null;
    badgeLabel: string | null;
    featured: boolean;
    isHot: boolean;
  };
  categories: {
    slug: string;
    name: string;
  };
  venues: {
    name: string;
    city: string;
    state: string;
  };
}

function buildConditions(
  view: EventView,
  filters: SearchFilters,
): SQL | undefined {
  const conditions: SQL[] = [];

  if (view === 'featured') conditions.push(eq(events.featured, true));
  if (view === 'hot') conditions.push(eq(events.isHot, true));
  if (filters.category) {
    conditions.push(eq(categories.slug, filters.category));
  }
  if (filters.state) conditions.push(eq(venues.state, filters.state));
  if (filters.q) {
    conditions.push(
      sql`${events.searchVector} @@ websearch_to_tsquery('portuguese', unaccent(${filters.q}))`,
    );
  }
  if (filters.from) {
    conditions.push(
      gte(events.startsAt, new Date(`${filters.from}T00:00:00.000Z`)),
    );
  }
  if (filters.to) {
    conditions.push(
      lte(events.startsAt, new Date(`${filters.to}T23:59:59.999Z`)),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function toEventEntity(row: EventRow): EventEntity {
  return {
    id: row.events.id,
    slug: row.events.slug,
    title: row.events.title,
    description: row.events.description,
    categorySlug: row.categories.slug,
    categoryName: row.categories.name,
    venueName: row.venues.name,
    venueCity: row.venues.city,
    venueState: row.venues.state,
    startsAt: row.events.startsAt,
    priceFromCents: row.events.priceFromCents,
    imageUrl: row.events.imageUrl,
    badgeLabel: row.events.badgeLabel,
    featured: row.events.featured,
    isHot: row.events.isHot,
  };
}

export class DrizzleEventsRepository implements EventsRepository {
  constructor(private readonly db: Db) {}

  async findAll(
    view: EventView,
    filters: SearchFilters = {},
  ): Promise<EventEntity[]> {
    const rows = await this.db
      .select({
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
      })
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(buildConditions(view, filters))
      .orderBy(asc(events.startsAt));

    return rows.map(toEventEntity);
  }
}
```

- [x] **Step 4: Rode e veja passar** (exige `pnpm infra:up`)

```bash
pnpm --filter @ticketvibe/api test && pnpm --filter @ticketvibe/api typecheck
```

Expected: toda a suíte da api passa (incl. os 8 testes de busca/filtro).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/events/infra/drizzle-events-repository.ts apps/api/src/modules/events/routes/events.routes.integration.spec.ts
git commit -m "feat(api): search events with postgres full text"
```

---

## Task 8 — `feat(web): extend the events client with search filters`

**Files:** `apps/web/src/lib/events-api.ts`, `apps/web/src/lib/events-api.spec.ts`, `apps/web/src/app/page.tsx` (chamadas mínimas)

- [x] **Step 1: Escreva os testes que falham.** Substitua `events-api.spec.ts` por completo:

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
  test,
  vi,
} from 'vitest';
import { fetchCategories, fetchEvents } from './events-api';

const validEventFixture = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'rock-night-sao-paulo',
  title: 'Rock Night',
  description: 'A night of rock music.',
  category: { slug: 'music', name: 'Music' },
  venue: { name: 'Audio Club', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-10-22T23:00:00Z',
  priceFromCents: 8000,
  imageUrl: 'https://example.com/image.jpg',
  badgeLabel: 'Popular',
};

const server = setupServer(
  http.get('http://localhost:3001/events', ({ request }) => {
    const params = new URL(request.url).searchParams;
    if (params.get('view') === 'featured') {
      return HttpResponse.json({ events: [validEventFixture] });
    }
    if (params.get('q') === 'boom') {
      return HttpResponse.json({ events: [] }, { status: 500 });
    }
    return HttpResponse.json({ events: [] });
  }),
  http.get('http://localhost:3001/categories', () =>
    HttpResponse.json({
      categories: [
        { slug: 'shows', name: 'Shows' },
        { slug: 'comedy', name: 'Comédia' },
      ],
    }),
  ),
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
afterEach(() => vi.restoreAllMocks());

describe('fetchEvents', () => {
  test('parses the payload through the contract and reports success', async () => {
    const result = await fetchEvents({ view: 'featured' });
    expect(result).toEqual({ ok: true, events: [validEventFixture] });
  });

  test('returns an empty-but-ok result for a valid empty payload', async () => {
    const result = await fetchEvents({});
    expect(result).toEqual({ ok: true, events: [] });
  });

  test('reports a failure on a non-2xx response', async () => {
    const result = await fetchEvents({ q: 'boom' });
    expect(result.ok).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  test('sends the search filters as query parameters', async () => {
    const seen: string[] = [];
    server.use(
      http.get('http://localhost:3001/events', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ events: [] });
      }),
    );

    await fetchEvents({ view: 'hot', q: 'teatro', state: 'RJ' });

    expect(seen[0]).toContain('view=hot');
    expect(seen[0]).toContain('q=teatro');
    expect(seen[0]).toContain('state=RJ');
  });
});

describe('fetchCategories', () => {
  test('parses the categories payload through the contract', async () => {
    const result = await fetchCategories();
    expect(result).toEqual({
      ok: true,
      categories: [
        { slug: 'shows', name: 'Shows' },
        { slug: 'comedy', name: 'Comédia' },
      ],
    });
  });
});
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/web test events-api
```

Expected: falha (assinatura antiga `fetchEvents(view)` retorna array).

- [x] **Step 3: Implemente.** Substitua `events-api.ts` por completo:

```ts
import 'server-only';

import {
  type CategoryDto,
  type EventDto,
  type ListEventsQuery,
  listCategoriesResponseSchema,
  listEventsResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type { EventDto };

export type FetchEventsResult =
  | { ok: true; events: EventDto[] }
  | { ok: false; error: string };

export type FetchCategoriesResult =
  | { ok: true; categories: CategoryDto[] }
  | { ok: false; error: string };

function buildQuery(query: ListEventsQuery): string {
  const params = new URLSearchParams();

  if (query.view && query.view !== 'all') params.set('view', query.view);
  for (const key of ['q', 'category', 'state', 'from', 'to'] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function fetchEvents(
  query: ListEventsQuery = {},
): Promise<FetchEventsResult> {
  try {
    const response = await fetch(`${API_URL}/events${buildQuery(query)}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, error: `Unexpected status ${response.status}` };
    }
    const payload = listEventsResponseSchema.parse(await response.json());
    return { ok: true, events: payload.events };
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return { ok: false, error: 'request_failed' };
  }
}

export async function fetchCategories(): Promise<FetchCategoriesResult> {
  try {
    const response = await fetch(`${API_URL}/categories`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, error: `Unexpected status ${response.status}` };
    }
    const payload = listCategoriesResponseSchema.parse(await response.json());
    return { ok: true, categories: payload.categories };
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return { ok: false, error: 'request_failed' };
  }
}
```

Atualize `page.tsx` (mudança mínima para compilar; será reescrito na task 11) — troque as duas funções de seção por:

```tsx
async function FeaturedSection() {
  const result = await fetchEvents({ view: 'featured' });
  const featured = result.ok ? result.events[0] : undefined;
  if (!featured) return <h1 className="sr-only">TicketVibe</h1>;
  return <HeroCard {...toHeroCardProps(featured)} />;
}

async function HighlightsSection() {
  const result = await fetchEvents({ view: 'hot' });
  const events = result.ok ? result.events : [];
  return <EventsSection cards={events.map(toEventCardProps)} />;
}
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/web test events-api && pnpm --filter @ticketvibe/web typecheck
```

Expected: passa.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/lib/events-api.ts apps/web/src/lib/events-api.spec.ts apps/web/src/app/page.tsx
git commit -m "feat(web): extend the events client with search filters"
```

## Task 9 — `feat(web): add the header search field`

**Files:** `apps/web/src/lib/search-params.ts` (+ spec), `apps/web/src/components/header-search.tsx` (+ spec), `apps/web/src/components/header.tsx`

- [x] **Step 1: Escreva os testes que falham.** Crie `apps/web/src/lib/search-params.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSearchPath,
  filtersFromSearchParams,
  hasActiveFilters,
  parseSearchFilters,
} from './search-params';

describe('parseSearchFilters', () => {
  it('reads a plain record and trims/normalizes values', () => {
    expect(
      parseSearchFilters({ q: '  teatro ', state: 'sp', from: '2026-11-01' }),
    ).toEqual({ q: 'teatro', state: 'SP', from: '2026-11-01' });
  });

  it('uses the first value of an array param', () => {
    expect(parseSearchFilters({ q: ['a', 'b'] })).toEqual({ q: 'a' });
  });

  it('drops invalid values instead of throwing', () => {
    expect(parseSearchFilters({ state: 'XYZ', from: 'nope' })).toEqual({});
  });
});

describe('filtersFromSearchParams', () => {
  it('reads from a URLSearchParams', () => {
    const params = new URLSearchParams('q=show&category=comedy');
    expect(filtersFromSearchParams(params)).toEqual({
      q: 'show',
      category: 'comedy',
    });
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty filters and true when any filter is set', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: 'x' })).toBe(true);
  });
});

describe('buildSearchPath', () => {
  it('returns / when there are no filters', () => {
    expect(buildSearchPath({})).toBe('/');
  });

  it('serializes filters in a stable order', () => {
    expect(
      buildSearchPath({ q: 'stand', category: 'comedy', state: 'SP' }),
    ).toBe('/?q=stand&category=comedy&state=SP');
  });
});
```

Crie `apps/web/src/components/header-search.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderSearch } from './header-search';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('HeaderSearch', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('navigates to the search URL on submit', () => {
    render(<HeaderSearch />);

    const input = screen.getByRole('searchbox', { name: 'Buscar eventos' });
    fireEvent.change(input, { target: { value: '  cyberpunk ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(replace).toHaveBeenCalledWith('/?q=cyberpunk');
  });

  it('clears the query when the field is emptied', () => {
    render(<HeaderSearch />);

    const input = screen.getByRole('searchbox', { name: 'Buscar eventos' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(replace).toHaveBeenCalledWith('/');
  });
});
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/web test search-params header-search
```

Expected: falha de módulo inexistente.

- [x] **Step 3: Implemente.** Crie `apps/web/src/lib/search-params.ts`:

```ts
import { type SearchFilters, searchFiltersSchema } from '@ticketvibe/shared';

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSearchFilters(raw: RawSearchParams): SearchFilters {
  const parsed = searchFiltersSchema.safeParse({
    q: first(raw.q),
    category: first(raw.category),
    state: first(raw.state),
    from: first(raw.from),
    to: first(raw.to),
  });
  return parsed.success ? parsed.data : {};
}

export function filtersFromSearchParams(params: URLSearchParams): SearchFilters {
  return parseSearchFilters({
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    state: params.get('state') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  });
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return Boolean(
    filters.q ||
      filters.category ||
      filters.state ||
      filters.from ||
      filters.to,
  );
}

export function buildSearchPath(filters: SearchFilters): string {
  const params = new URLSearchParams();

  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.state) params.set('state', filters.state);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const query = params.toString();
  return query ? `/?${query}` : '/';
}
```

Crie `apps/web/src/components/header-search.tsx`:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';

import { SearchInput } from '@/components/ui/search-input';
import { buildSearchPath, filtersFromSearchParams } from '@/lib/search-params';

function HeaderSearchField() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = filtersFromSearchParams(searchParams);
  const [value, setValue] = useState(filters.q ?? '');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    router.replace(buildSearchPath({ ...filters, q: q || undefined }));
  }

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="hidden max-w-md flex-1 md:flex"
    >
      <SearchInput
        aria-label="Buscar eventos"
        placeholder="Buscar shows, teatro, comédia, cidade."
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}

function HeaderSearchFallback() {
  return <div className="hidden max-w-md flex-1 md:block" aria-hidden />;
}

export function HeaderSearch() {
  return (
    <Suspense fallback={<HeaderSearchFallback />}>
      <HeaderSearchField />
    </Suspense>
  );
}
```

Edite `header.tsx`: remova o import de `SearchInput`, importe `HeaderSearch` e troque o `<SearchInput .../>` por `<HeaderSearch />`. Remova a prop `searchPlaceholder` do tipo e da assinatura. O arquivo final:

```tsx
import { ChevronDown, Heart, MapPin, Ticket, User } from 'lucide-react';
import { HeaderSearch } from './header-search';
import { Button } from './ui/button';

type HeaderProps = {
  location?: string;
};

function Header({ location = 'São Paulo, SP' }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-header">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center gap-2 px-4 sm:gap-4 lg:gap-6 lg:px-8">
        <a href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-gradient">
            <Ticket
              className="size-6 text-primary-foreground"
              aria-hidden="true"
            />
          </span>
          <span className="hidden min-[360px]:inline font-heading text-xl font-bold tracking-tight">
            <span className="text-foreground">TICKET</span>
            <span className="text-primary">VIBE</span>
          </span>
        </a>
        <HeaderSearch />
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className="hidden h-10 min-w-0 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline-flex"
          >
            <MapPin
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">{location}</span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
          <Button variant="outline" size="icon" aria-label="Favoritos">
            <Heart className="size-5" />
          </Button>
          <Button variant="default">
            <User className="size-4" aria-hidden="true" />
            Entrar
          </Button>
        </div>
      </div>
    </header>
  );
}

export { Header };
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/web test && pnpm --filter @ticketvibe/web typecheck
```

Expected: passa (o `page.tsx` continua funcionando; `<Header />` sem props).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/lib/search-params.ts apps/web/src/lib/search-params.spec.ts apps/web/src/components/header-search.tsx apps/web/src/components/header-search.spec.tsx apps/web/src/components/header.tsx
git commit -m "feat(web): add the header search field"
```

---

## Task 10 — `feat(web): add the category chips row`

**Files:** `apps/web/src/lib/category-icons.ts` (novo), `apps/web/src/components/home/category-chips.tsx` (+ spec)

- [x] **Step 1: Escreva o teste que falha.** Crie `apps/web/src/components/home/category-chips.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryChips } from './category-chips';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const categories = [
  { slug: 'shows', name: 'Shows' },
  { slug: 'teatro', name: 'Teatro' },
];

describe('CategoryChips', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('marks the selected category chip as pressed', () => {
    render(
      <CategoryChips categories={categories} filters={{ category: 'teatro' }} />,
    );

    expect(screen.getByRole('button', { name: 'Teatro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Shows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('navigates with the chosen category on click', () => {
    render(<CategoryChips categories={categories} filters={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));

    expect(replace).toHaveBeenCalledWith('/?category=shows');
  });

  it('toggles the category off when it is already selected', () => {
    render(
      <CategoryChips categories={categories} filters={{ category: 'shows' }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));

    expect(replace).toHaveBeenCalledWith('/');
  });
});
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/web test category-chips
```

Expected: falha de módulo inexistente.

- [x] **Step 3: Implemente.** Crie `apps/web/src/lib/category-icons.ts`:

```ts
import {
  Baby,
  Drama,
  Guitar,
  LayoutGrid,
  type LucideIcon,
  Mic,
  PartyPopper,
  Theater,
  Trophy,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  shows: Guitar,
  esportes: Trophy,
  teatro: Theater,
  festivais: PartyPopper,
  comedy: Mic,
  infantil: Baby,
  danca: Drama,
};

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? LayoutGrid;
}
```

Crie `apps/web/src/components/home/category-chips.tsx`:

```tsx
'use client';

import type { CategoryDto, SearchFilters } from '@ticketvibe/shared';
import { useRouter } from 'next/navigation';

import { Chip } from '@/components/ui/chip';
import { categoryIcon } from '@/lib/category-icons';
import { buildSearchPath } from '@/lib/search-params';

type CategoryChipsProps = {
  categories: CategoryDto[];
  filters: SearchFilters;
};

export function CategoryChips({ categories, filters }: CategoryChipsProps) {
  const router = useRouter();

  if (categories.length === 0) return null;

  function toggle(slug: string) {
    const category = filters.category === slug ? undefined : slug;
    router.replace(buildSearchPath({ ...filters, category }));
  }

  return (
    <div
      role="group"
      aria-label="Filtrar por categoria"
      className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"
    >
      {categories.map((category) => (
        <Chip
          key={category.slug}
          icon={categoryIcon(category.slug)}
          label={category.name}
          selected={filters.category === category.slug}
          onClick={() => toggle(category.slug)}
        />
      ))}
    </div>
  );
}
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/web test category-chips && pnpm --filter @ticketvibe/web typecheck
```

Expected: passa.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/lib/category-icons.ts apps/web/src/components/home/category-chips.tsx apps/web/src/components/home/category-chips.spec.tsx
git commit -m "feat(web): add the category chips row"
```

---

## Task 11 — `feat(web): compose search results on the home`

**Files:** `apps/web/src/components/home/events-section.tsx` (estado de erro), `apps/web/src/components/home/search-results.tsx` (+ spec), `apps/web/src/app/page.tsx`

- [x] **Step 1: Escreva o teste que falha.** Crie `apps/web/src/components/home/search-results.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchResults } from './search-results';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const event = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'cyberpunk-electronic-festival',
  title: 'Cyberpunk Electronic Festival',
  description: 'Festival techno.',
  category: { slug: 'festivais', name: 'Festivais' },
  venue: { name: 'Parque Olímpico', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-12-05T17:00:00.000Z',
  priceFromCents: 29000,
  imageUrl: null,
  badgeLabel: null,
};

describe('SearchResults', () => {
  it('renders one card per event', () => {
    render(
      <SearchResults
        filters={{ q: 'cyberpunk' }}
        categories={[]}
        result={{ ok: true, events: [event] }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Cyberpunk Electronic Festival' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 evento')).toBeInTheDocument();
  });

  it('shows an empty state when no event matches', () => {
    render(
      <SearchResults
        filters={{ q: 'zzz' }}
        categories={[]}
        result={{ ok: true, events: [] }}
      />,
    );

    expect(screen.getByText(/Nenhum evento encontrado/)).toBeInTheDocument();
  });

  it('shows an error state when the request failed', () => {
    render(
      <SearchResults
        filters={{ q: 'zzz' }}
        categories={[]}
        result={{ ok: false, error: 'request_failed' }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível/);
  });
});
```

- [x] **Step 2: Rode e veja falhar**

```bash
pnpm --filter @ticketvibe/web test search-results
```

Expected: falha de módulo inexistente.

- [x] **Step 3: Implemente.** Edite `events-section.tsx`: adicione a prop opcional `error` e a mensagem distinta. A assinatura fica:

```tsx
export function EventsSection({
  cards,
  error = false,
}: {
  cards: EventCardProps[];
  error?: boolean;
}) {
```

E troque o bloco vazio (mapeamento dos cards ausentes) por:

```tsx
      ) : (
        <p className="text-muted-foreground">
          {error
            ? 'Não foi possível carregar os eventos.'
            : 'Nenhum evento em alta no momento.'}
        </p>
      )}
```

Crie `apps/web/src/components/home/search-results.tsx`:

```tsx
import type { CategoryDto, SearchFilters } from '@ticketvibe/shared';
import Link from 'next/link';

import { EventCard } from '@/components/event-card';
import { CategoryChips } from '@/components/home/category-chips';
import type { FetchEventsResult } from '@/lib/events-api';
import { toEventCardProps } from '@/lib/event-mapper';

type SearchResultsProps = {
  filters: SearchFilters;
  categories: CategoryDto[];
  result: FetchEventsResult;
};

export function SearchResults({
  filters,
  categories,
  result,
}: SearchResultsProps) {
  const count = result.ok ? result.events.length : 0;

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="results-heading" className="font-heading text-3xl font-bold">
            Resultados da busca
          </h2>
          <p className="mt-2 text-muted-foreground" aria-live="polite">
            {result.ok
              ? `${count} ${count === 1 ? 'evento' : 'eventos'} encontrados`
              : 'Vitrine de eventos'}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-primary hover:underline"
        >
          Limpar filtros
        </Link>
      </div>
      <CategoryChips categories={categories} filters={filters} />
      {!result.ok ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar os eventos. Tente novamente.
        </p>
      ) : result.events.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {result.events.map((event) => (
            <EventCard key={event.id} {...toEventCardProps(event)} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Nenhum evento encontrado. Ajuste a busca ou os filtros.
        </p>
      )}
    </section>
  );
}
```

Por fim, reescreva `apps/web/src/app/page.tsx`:

```tsx
import { Suspense } from 'react';

import { Header } from '@/components/header';
import { CategoryChips } from '@/components/home/category-chips';
import { EventsSection } from '@/components/home/events-section';
import { HeroCard } from '@/components/home/hero-card';
import { SearchResults } from '@/components/home/search-results';
import { toEventCardProps, toHeroCardProps } from '@/lib/event-mapper';
import { fetchCategories, fetchEvents } from '@/lib/events-api';
import {
  hasActiveFilters,
  parseSearchFilters,
  type RawSearchParams,
} from '@/lib/search-params';

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-12" aria-hidden>
      <div className="min-h-[26rem] animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-10 w-full animate-pulse rounded-full bg-card" />
      <div className="h-[26rem] w-full animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseSearchFilters(await searchParams);

  if (hasActiveFilters(filters)) {
    const [result, categories] = await Promise.all([
      fetchEvents(filters),
      fetchCategories(),
    ]);
    return (
      <SearchResults
        filters={filters}
        categories={categories.ok ? categories.categories : []}
        result={result}
      />
    );
  }

  const [featured, hot, categories] = await Promise.all([
    fetchEvents({ view: 'featured' }),
    fetchEvents({ view: 'hot' }),
    fetchCategories(),
  ]);
  const hero = featured.ok ? featured.events[0] : undefined;

  return (
    <div className="flex flex-col gap-12">
      {hero ? (
        <HeroCard {...toHeroCardProps(hero)} />
      ) : (
        <h1 className="sr-only">TicketVibe</h1>
      )}
      <CategoryChips
        categories={categories.ok ? categories.categories : []}
        filters={filters}
      />
      <EventsSection
        cards={hot.ok ? hot.events.map(toEventCardProps) : []}
        error={!hot.ok}
      />
    </div>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<PageSkeleton />}>
          <HomeContent searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
```

- [x] **Step 4: Rode e veja passar**

```bash
pnpm --filter @ticketvibe/web test && pnpm --filter @ticketvibe/web typecheck
pnpm --filter @ticketvibe/web build
```

Expected: testes e typecheck passam; o build do Next conclui (a página usa `searchParams` dentro de Suspense).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/home/events-section.tsx apps/web/src/components/home/search-results.tsx apps/web/src/components/home/search-results.spec.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): compose search results on the home"
```

---

## Task 12 — `style(web): tokenize the event gradient`

**Files:** `apps/web/src/app/globals.css`

- [x] **Step 1: Adicione os tokens em `:root`** (dentro do bloco `:root`, após `--radius: 1rem;`):

```css
  --gradient-brand-from: #00ff87;
  --gradient-brand-to: #05d983;
  --gradient-event-from: var(--border);
  --gradient-event-via: var(--card);
  --gradient-event-to: #0a2a1e;
```

- [x] **Step 2: Use os tokens nos componentes** — substitua o bloco `@layer components`:

```css
@layer components {
  .bg-brand-gradient {
    background-image: linear-gradient(
      135deg,
      var(--gradient-brand-from) 0%,
      var(--gradient-brand-to) 100%
    );
  }
  .bg-event-gradient {
    background-image: linear-gradient(
      135deg,
      var(--gradient-event-from) 0%,
      var(--gradient-event-via) 55%,
      var(--gradient-event-to) 100%
    );
  }
}
```

- [x] **Step 3: Verifique que o build e os testes seguem verdes**

```bash
pnpm --filter @ticketvibe/web test && pnpm --filter @ticketvibe/web build
```

Expected: passa (mudança puramente visual).

- [x] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style(web): tokenize the event gradient"
```

## Task 13 — `test(e2e): set up playwright with chromium`

**Files:** `apps/web/package.json`, `apps/web/playwright.config.ts`, `apps/web/tests/e2e/global-setup.ts`, `apps/web/tests/e2e/home.spec.ts`, `apps/web/.gitignore`

- [x] **Step 1: Instale o Playwright e o Chromium**

```bash
pnpm --filter @ticketvibe/web add -D @playwright/test
pnpm --filter @ticketvibe/web exec playwright install chromium
```

Expected: `@playwright/test` em `devDependencies`; Chromium baixado. Se o download for bloqueado pelo ambiente, **pare e reporte BLOCKED** (não invente).

- [x] **Step 2: Adicione o script e ignore os artefatos.** Em `apps/web/package.json`, dentro de `scripts`, adicione:

```json
    "test:e2e": "playwright test",
```

Em `apps/web/.gitignore`, acrescente ao fim:

```gitignore
/test-results/
/playwright-report/
```

- [x] **Step 3: Escreva o smoke test que falha.** Crie `apps/web/tests/e2e/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';

export default function globalSetup(): void {
  execSync('pnpm --filter @ticketvibe/api db:seed', { stdio: 'inherit' });
}
```

Crie `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: [
    {
      command: 'pnpm --filter @ticketvibe/api dev',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @ticketvibe/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
```

Crie `apps/web/tests/e2e/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('home exibe o destaque e os eventos em alta', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
  await expect(
    page.getByRole('heading', { name: 'Eventos em Alta' }),
  ).toBeVisible();
});
```

- [x] **Step 4: Rode o smoke (exige `pnpm infra:up` e migrações aplicadas)**

```bash
pnpm --filter @ticketvibe/web test:e2e
```

Expected: 1 passed. (A primeira execução compila a home no Next — pode levar alguns segundos.)

- [x] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml pnpm-lock.yaml apps/web/playwright.config.ts apps/web/tests/e2e/global-setup.ts apps/web/tests/e2e/home.spec.ts apps/web/.gitignore
git commit -m "test(e2e): set up playwright with chromium"
```

> Se `git status` mostrar que o lockfile fica só na raiz (`pnpm-lock.yaml`), adicione apenas o que existir.

---

## Task 14 — `test(e2e): cover search and filter flows`

**Files:** `apps/web/tests/e2e/search.spec.ts`

- [x] **Step 1: Escreva o teste que falha.** Crie `apps/web/tests/e2e/search.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('busca pelo header filtra os resultados', async ({ page }) => {
  await page.goto('/');

  const search = page.getByRole('searchbox', { name: 'Buscar eventos' });
  await search.fill('cyberpunk');
  await search.press('Enter');

  await expect(page).toHaveURL(/\?q=cyberpunk/);
  await expect(
    page.getByRole('heading', { name: 'Cyberpunk Electronic Festival' }),
  ).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);
});

test('chip de categoria filtra os resultados', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Teatro' }).click();

  await expect(page).toHaveURL(/category=teatro/);
  await expect(page.locator('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'A Hora é a Vez' }),
  ).toBeVisible();
});

test('combina busca e categoria', async ({ page }) => {
  await page.goto('/?q=stand');

  await expect(page.locator('article')).toHaveCount(2);

  await page.getByRole('button', { name: 'Comédia' }).click();

  await expect(page).toHaveURL(/q=stand/);
  await expect(page).toHaveURL(/category=comedy/);
  await expect(page.locator('article')).toHaveCount(2);
});

test('mostra estado vazio quando nada corresponde', async ({ page }) => {
  await page.goto('/?q=zzz');

  await expect(page.getByText(/Nenhum evento encontrado/)).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
});

test('limpar filtros volta para a home', async ({ page }) => {
  await page.goto('/?q=zzz');

  await page.getByRole('link', { name: 'Limpar filtros' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3000/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
});
```

- [x] **Step 2: Rode e veja passar** (exige `pnpm infra:up`)

```bash
pnpm --filter @ticketvibe/web test:e2e
```

Expected: 6 passed (1 smoke + 5 novos).

- [x] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/search.spec.ts
git commit -m "test(e2e): cover search and filter flows"
```

---

## Task 15 — `docs: sync tooling status and commands with ticket 05`

**Files:** `README.md`, `docs/TESTING.md`, `docs/skills/TESTING_API_GUIDELINE.md`, `docs/skills/TESTING_FRONTEND_GUIDELINE.md`

- [x] **Step 1: `README.md` — smoke.** Ache o bloco de smoke e acrescente uma linha após a do `/events?view=featured`:

```bash
curl -s 'http://127.0.0.1:3001/events?q=teatro'            # busca full-text: {"events":[…3 eventos…]}
curl -s 'http://127.0.0.1:3001/categories'                 # {"categories":[…7…]}
```

- [x] **Step 2: `README.md` — scripts.** Na tabela de scripts, acrescente:

```markdown
| `pnpm --filter @ticketvibe/web test:e2e` | testes E2E (Playwright/Chromium; sobe api+web e semeia o banco) |
```

E na linha do `pnpm test`, mantenha o texto mas note que a integração cobre também categorias/busca.

- [x] **Step 3: `README.md` — estrutura.** Troque a descrição do `apps/api`:

```markdown
apps/api          Fastify 5 + Drizzle/Postgres — rotas /health, /events (busca full-text + filtros) e /categories validadas pelo shared
```

- [x] **Step 4: `docs/TESTING.md`.** Aplique:
  - `## Current state (after ticket 04)` → `## Current state (after ticket 05)`.
  - Linha do `packages/shared`: atualize a contagem de testes com o número real que o runner relatar (12 → 23).
  - Linha do `apps/api`: → `health (unit) + events module (use case, route, integration vs ticketvibe_test — busca + filtros) + categories module (unit + integration — requires pnpm infra:up)`.
  - Linha do `apps/web`: → `home (hero, carrossel, busca no header, chips de categoria, resultados), formatters, fetch client`.
  - No bloco "Existing test layout", acrescente:

    ```
    apps/api/src/modules/categories/…      # módulo hexagonal de categorias (unit + integração)
    apps/web/tests/e2e/…                   # fluxos E2E (Playwright) — home, busca, filtros
    ```
  - No bloco de Comandos, acrescente:

    ```bash
    pnpm --filter @ticketvibe/web test:e2e  # E2E (Playwright) — exige pnpm infra:up
    ```
  - Na tabela "Three levels", a linha E2E: `**from ticket 05 on**` → `**live** (Playwright/Chromium; primeiro fluxo: home + busca + filtros)`.
  - No "Coverage": `ticket 04 explicitly deferred it (recorded in the ticket 04 deferrals — see issues/05)` → `tickets 04/05 explicitly deferred it (recorded in the ticket deferrals — see issues/06)`.

- [x] **Step 5: `docs/skills/TESTING_FRONTEND_GUIDELINE.md`.** Aplique:
  - No banner (linha 5): `React Testing Library and MSW are installed since ticket 04 (apps/web); Playwright arrives with E2E (ticket 05+; ...)` → `React Testing Library, MSW and Playwright are installed since tickets 04–05 (apps/web); ...`.
  - Na lista Tech Stack, `**E2E framework:** Playwright (@playwright/test). *(not installed yet)*` → `*(installed since ticket 05)*`.
  - Em `## Commands (this project)`, acrescente abaixo de `pnpm lint`:

    ```bash
    pnpm --filter @ticketvibe/web test:e2e   # E2E (Playwright) — sobe api+web e semeia o banco
    ```
  - `There are no test:watch, test:coverage or test:e2e scripts in this repository — do not document or run them until they are added.` → `There is no test:watch or test:coverage script in this repository — do not document them until they are added. test:e2e exists since ticket 05 (apps/web).`
  - Em "Project Overrides — TICKETVIBE": `apps/web has a test script since ticket 04 (vitest run) — still never document test:watch / test:coverage / test:e2e before those scripts exist.` → `apps/web has test and test:e2e scripts since tickets 04/05 — never document test:watch / test:coverage before those scripts exist.`
  - `**Tooling status:** Vitest ✅ · RTL ✅ · MSW ✅ (since ticket 04) · Playwright ⏳ first E2E (ticket 05+)` → `**Tooling status:** Vitest ✅ · RTL ✅ · MSW ✅ (since ticket 04) · Playwright ✅ (since ticket 05)`.
  - No "Coverage Gate": `(ticket 04 explicitly deferred it — see the deferrals in issues/05)` → `(tickets 04/05 explicitly deferred it — see the deferrals in issues/06)`.

- [x] **Step 6: `docs/skills/TESTING_API_GUIDELINE.md`.** Aplique:
  - No banner (linha 5): `the hexagonal module layout, Drizzle repositories and route integration tests are live since ticket 04 (first module: events — ...)` → `... live since ticket 04 (first modules: events and categories, with full-text search + filters — ...)`.
  - No bullet "Contract seam": `healthResponseSchema is the first one, alongside eventSchema / listEventsResponseSchema` → `healthResponseSchema is the first one, alongside eventSchema, listEventsQuerySchema (search filters) and listCategoriesResponseSchema`.
  - No bullet "Module layout": `live with modules/events` → `live with modules/events and modules/categories`.

- [x] **Step 7: Rode o lint e valide os docs** (sem código novo, apenas formatação de markdown)

```bash
pnpm lint
```

Expected: 0 erros.

- [x] **Step 8: Commit**

```bash
git add README.md docs/TESTING.md docs/skills/TESTING_API_GUIDELINE.md docs/skills/TESTING_FRONTEND_GUIDELINE.md
git commit -m "docs: sync tooling status and commands with ticket 05"
```

---

## Task 16 — fechar o ticket 05

**Files:** `.scratch/ticketvibe/issues/05-busca-e-filtros-de-eventos.md`, `.scratch/ticketvibe/issues/06-pagina-de-evento.md`, este plano

- [x] **Step 1: Confirme que a suíte inteira está verde** (com `pnpm infra:up`)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @ticketvibe/web test:e2e
```

Expected: tudo passa.

- [x] **Step 2: Marque os 5 critérios do issue 05 e mude o status.** Edite `.scratch/ticketvibe/issues/05-busca-e-filtros-de-eventos.md`:
  - Marque as 5 caixas `[ ]` → `[x]`.
  - Troque `**Status:** ready-for-agent` → `**Status:** done`.

- [x] **Step 3: Registre os deferrals do 05 no issue 06.** Ache o fim de `.scratch/ticketvibe/issues/06-pagina-de-evento.md` (ou um título existente) e acrescente:

```markdown
## Deferrals do ticket 05 (registrados no fechamento do 05)

- **Busca fuzzy `pg_trgm`** — `q=standup` não acha `stand-up` (lexemas diferem); hoje só substring/stemming (`q=stand` acha). Habilita proximidade/typo. UI de **data** (`from`/`to`) e **localização** (`state`) no header — a API já aceita, os mockups não mostram; UI fica para 06/07.
- **Carrossel do hero (dots/controles)** — herdado do 04; segue para 06/07.
- **`Header` no `layout.tsx`** — segue só na home; `not-found.tsx` claro ainda aberto.
- **Provider Zod/OpenAPI do Fastify** — F-transversal.
- **Coverage tooling** — não instalado; política em docs/TESTING.md.
- **Sign-off do contraste `--border: #2e2054`** — herdado do 03, sem decisão de design.
- **Trigger do `search_vector`** — hoje é mantido apenas pelo seed; um trigger de banco (ou escrita no write path) será necessário quando eventos passarem a ser criados/editados (tickets 17+).
- **Entidade artista** — a busca cobre título/descrição/local/cidade; "artista" como campo próprio não existe no modelo (fica para quando os eventos tiverem lineup).
```

- [x] **Step 4: Marque os passos executados neste plano.** Neste arquivo, troque todos os `- [ ]` por `- [x]` (o plano vira o registro do que foi feito).

- [x] **Step 5: Commit**

```bash
git add .scratch/ticketvibe/issues/05-busca-e-filtros-de-eventos.md .scratch/ticketvibe/issues/06-pagina-de-evento.md docs/superpowers/plans/2026-10-10-ticket-05-busca-e-filtros-de-eventos.md
git commit -m "docs: mark ticket 05 as done"
```

---

## Self-review (executado ao escrever este plano)

- **Cobertura do spec (5 caixas):** (1) FTS Postgres → tasks 5–7; (2) endpoint REST + Zod → tasks 1–4; (3) UI de busca no header + chips → tasks 9–11; (4) combinação sobre os mesmos resultados → tasks 2/7/11 (mesma query com view + filtros); (5) testes → integração (4/6/7), unitários (1/2/3/4/8/9/10/11), MSW (8), E2E (13/14).
- **Deferral `fetchEvents` discriminado** → task 8. **Deferral tokenizar gradiente** → task 12. Ambos eram do review final do 04.
- **Sem placeholders:** cada passo tem código/comando completos e o resultado esperado.
- **Consistência de tipos:** `SearchFilters` (shared) flui por `ListEventsQuery` → use case → repositórios → `search-params` (web) → client. `FetchEventsResult`/`FetchCategoriesResult` são consumidos só pela página.
- **Semântica in-memory ↔ SQL:** ambos aplicam filtros sobre o mesmo conjunto de campos (title, description, venueName, venueCity; state separado) e dias UTC inclusivos; `q` é AND de termos nos dois.
- **Deferrals honestos:** `pg_trgm` (fuzzy), UI de data/localização, trigger do vetor e entidade artista ficam no issue 06.

## Execution handoff

Duas opções para executar:
- **Subagent-driven (recomendado):** uma task por vez, implementador + 2 reviewers (spec + qualidade) por task, sem pular review.
- **Inline:** executar as tasks nesta sessão, com checkpoints de review.

Ao terminar cada task, rodar o gate da seção **Preconditions** e commitar com a mensagem indicada.
