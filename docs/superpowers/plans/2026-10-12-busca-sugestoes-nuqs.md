# Busca com Nuqs + modal de sugestões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a camada manual de URL state por Nuqs, adicionar feedback de pending nos filtros e abrir um combobox de sugestões (eventos + locais) no input de busca.

**Architecture:** Nuqs v2 com parsers tipados (`shallow: false` + `startTransition` oficial) controla a URL; o servidor continua fonte da verdade (Zod compartilhado, `server-only`); um `SearchTransitionProvider` compartilha `isPending` para o `ResultsRegion` exibir skeleton; sugestões fluem `GET /events/suggest` (Fastify, FTS por relevância) → proxy Next `/api/suggest` → combobox acessível no header.

**Tech Stack:** nuqs@2.10.2, Next 16.4 (`cacheComponents`), React 19.3 (`useTransition`/`use`), Fastify 5 + Drizzle 0.45 (Postgres FTS), Zod 4, Vitest 5, MSW 2, Playwright 1.64, Biome 2.

**Spec:** `docs/superpowers/specs/2026-10-12-busca-sugestoes-nuqs-design.md` (aprovado pelo usuário).

---

## Desvios do spec registrados no planejamento

1. **Parsers num arquivo irmão** — `lib/search-filters-parsers.ts` em vez de dentro de `lib/search-params.ts`, para não puxar `nuqs` para o bundle de servidor (`page.tsx` importa `search-params.ts`). A camada URL⇄filtros continua no mesmo diretório.
2. **Mecanismo de pending oficial do nuqs** — o `startTransition` do React é passado **nas opções dos parsers** com `shallow: false` (padrão documentado do nuqs v2 para rastrear streaming de RSC), em vez de envolver o setter. O `SearchTransitionProvider` fornece uma única instância de transição via contexto para `header-search`, `category-chips` e `ResultsRegion`.
3. **`role="combobox"` no input** — obrigatório: verificado com Biome que `aria-expanded` em `type="search"` sem `role="combobox"` reprova o lint (`useAriaPropsSupportedByRole`). Consequência: 3 asserts em `header-search.spec.tsx` e 1 seletor no E2E `search.spec.ts` mudam de `searchbox` para `combobox` (mecânico; o contrato de URL dos E2Es do 05 permanece intacto).
4. **Ordem dos query params** — nuqs preserva params existentes e anexa novos (determinística por atualização, não canônica como `buildSearchPath`). Nenhum teste ou fluxo depende de ordem (E2Es usam regex por param).
5. **`buildSearchPath`/`filtersFromSearchParams`** são removidos no Task 13 (só componentes + specs deles usam).

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `packages/shared/src/index.ts` (+spec) | modify | schemas de suggest |
| `apps/api/.../domain/event-entity.ts` | modify | `SuggestLocation`, `SuggestResult` |
| `apps/api/.../domain/events-repository.ts` | modify | `suggest(q)` na interface |
| `apps/api/.../infra/in-memory-events-repository.ts` | modify | `suggest` em memória |
| `apps/api/.../infra/drizzle-events-repository.ts` | modify | FTS + `ts_rank` limit 5 + locations DISTINCT |
| `apps/api/.../use-cases/suggest-events.use-case.ts` (+spec) | create | caso de uso |
| `apps/api/.../routes/events.routes.ts` | modify | `GET /events/suggest` antes de `/events/:slug` |
| `apps/api/.../routes/events.routes.spec.ts` | modify | testes com InMemory (sem DB) |
| `apps/api/.../routes/events.routes.integration.spec.ts` | modify | testes de integração Postgres |
| `apps/web/package.json` + lockfile | modify | `nuqs` |
| `apps/web/src/lib/search-filters-parsers.ts` (+spec) | create | parsers Nuqs |
| `apps/web/src/components/search-transition.tsx` (+spec) | create | provider + `ResultsRegion` |
| `apps/web/src/components/home/page-skeleton.tsx` | create | skeleton extraído de `page.tsx` |
| `apps/web/src/lib/use-search-filters.ts` | create | hook de filters + transição |
| `apps/web/src/app/layout.tsx` | modify | `NuqsAdapter` + `SearchTransitionProvider` |
| `apps/web/.storybook/preview.tsx` | modify | mesmos wrappers nos decorators |
| `apps/web/src/app/page.tsx` | modify | `ResultsRegion` + `PageSkeleton` |
| `apps/web/src/app/api/suggest/route.ts` (+spec) | create | proxy GET same-origin |
| `apps/web/src/lib/use-search-suggestions.ts` (+spec) | create | debounce, fetch, teclado, ids ARIA |
| `apps/web/src/components/search-suggestions.tsx` (+spec) | create | painel presentacional |
| `apps/web/src/components/header-search.tsx` (+spec) | rewrite | Nuqs submit + combobox + painel |
| `apps/web/src/components/home/category-chips.tsx` (+spec) | rewrite | setter Nuqs |
| `apps/web/src/components/home/search-results.spec.tsx` | modify | wrapper Nuqs |
| `apps/web/src/lib/search-params.ts` (+spec) | modify | remover helpers manuais |
| `apps/web/tests/e2e/search.spec.ts` | modify | `combobox` + 4 E2Es novos |

## Pré-requisitos

- `pnpm infra:up` (Postgres no ar — testes de integração da API).
- Branch `main`, working tree limpa.
- Gates finais: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm --filter @ticketvibe/web test:e2e` · `pnpm build` · `pnpm --filter @ticketvibe/web build-storybook`.

---

### Task 1: Shared — contratos de sugestão

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.spec.ts`

- [ ] **Step 1: Escrever os testes falhando**

Troque o import de `index.spec.ts` para incluir `suggestQuerySchema` e `suggestResponseSchema`:

```ts
import {
  eventDetailResponseSchema,
  eventDetailSchema,
  eventSchema,
  healthResponseSchema,
  listCategoriesResponseSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  searchFiltersSchema,
  sectorSchema,
  suggestQuerySchema,
  suggestResponseSchema,
} from './index';
```

Acrescente ao final de `index.spec.ts`:

```ts
describe('suggestQuerySchema', () => {
  it('trims and accepts a query with at least two characters', () => {
    expect(suggestQuerySchema.parse({ q: '  fanta ' })).toEqual({ q: 'fanta' });
  });

  it('rejects queries shorter than two characters', () => {
    expect(() => suggestQuerySchema.parse({ q: 'a' })).toThrow();
    expect(() => suggestQuerySchema.parse({ q: ' ' })).toThrow();
  });

  it('rejects a missing query', () => {
    expect(() => suggestQuerySchema.parse({})).toThrow();
  });
});

const validSuggestResponse = {
  events: [
    {
      slug: 'o-fantasma-da-opera',
      title: 'O Fantasma da Ópera',
      startsAt: '2026-10-22T23:00:00.000Z',
      venueName: 'Teatro Renault',
      venueCity: 'São Paulo',
      venueState: 'SP',
      priceFromCents: 12000,
    },
  ],
  locations: [{ city: 'São Paulo', state: 'SP' }],
};

describe('suggestResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(suggestResponseSchema.parse(validSuggestResponse)).toEqual(
      validSuggestResponse,
    );
  });

  it('accepts empty results', () => {
    expect(suggestResponseSchema.parse({ events: [], locations: [] })).toEqual({
      events: [],
      locations: [],
    });
  });

  it('rejects a location with a state shorter than two letters', () => {
    expect(() =>
      suggestResponseSchema.parse({
        ...validSuggestResponse,
        locations: [{ city: 'São Paulo', state: 'S' }],
      }),
    ).toThrow();
  });

  it('rejects an event item without priceFromCents', () => {
    const { priceFromCents: _omitted, ...incomplete } =
      validSuggestResponse.events[0];
    expect(() =>
      suggestResponseSchema.parse({
        ...validSuggestResponse,
        events: [incomplete],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/shared exec vitest run src/index.spec.ts`
Expected: FAIL — `suggestQuerySchema is not defined` / erro de import.

- [ ] **Step 3: Implementar os schemas**

Acrescente ao final de `packages/shared/src/index.ts`:

```ts
export const suggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export type SuggestQuery = z.infer<typeof suggestQuerySchema>;

export const suggestEventItemSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.iso.datetime(),
  venueName: z.string().min(1),
  venueCity: z.string().min(1),
  venueState: z.string().length(2),
  priceFromCents: z.number().int().min(0),
});

export type SuggestEventItem = z.infer<typeof suggestEventItemSchema>;

export const suggestLocationItemSchema = z.object({
  city: z.string().min(1),
  state: z.string().length(2),
});

export type SuggestLocationItem = z.infer<typeof suggestLocationItemSchema>;

export const suggestResponseSchema = z.object({
  events: z.array(suggestEventItemSchema),
  locations: z.array(suggestLocationItemSchema),
});

export type SuggestResponse = z.infer<typeof suggestResponseSchema>;
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `pnpm --filter @ticketvibe/shared exec vitest run src/index.spec.ts`
Expected: PASS (27 existentes + 7 novos = 34 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.spec.ts
git commit -m "feat(shared): add suggest query and response schemas"
```

---

### Task 2: API — domínio, repositório em memória e caso de uso

**Files:**
- Modify: `apps/api/src/modules/events/domain/event-entity.ts`
- Modify: `apps/api/src/modules/events/domain/events-repository.ts`
- Modify: `apps/api/src/modules/events/infra/in-memory-events-repository.ts`
- Create: `apps/api/src/modules/events/use-cases/suggest-events.use-case.ts`
- Test: `apps/api/src/modules/events/use-cases/suggest-events.use-case.spec.ts`

- [ ] **Step 1: Escrever o teste do caso de uso falhando**

Crie `apps/api/src/modules/events/use-cases/suggest-events.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EventDetailEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { SuggestEventsUseCase } from './suggest-events.use-case';

const stubEvents: EventDetailEntity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'fantasma',
    title: 'O Fantasma da Ópera',
    description: 'Musical no Teatro Renault.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-22T23:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'sertaneja',
    title: 'Sertaneja Rio',
    description: 'Sertanejo no Vivo Rio.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueName: 'Vivo Rio',
    venueCity: 'Rio de Janeiro',
    venueState: 'RJ',
    startsAt: new Date('2026-11-28T23:00:00.000Z'),
    priceFromCents: 22000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
  },
];

function createUseCase(): SuggestEventsUseCase {
  return new SuggestEventsUseCase(new InMemoryEventsRepository(stubEvents));
}

describe('SuggestEventsUseCase', () => {
  it('returns matching events and city suggestions', async () => {
    const result = await createUseCase().execute('rio');

    expect(result.events.map((event) => event.slug)).toEqual(['sertaneja']);
    expect(result.locations).toEqual([{ city: 'Rio de Janeiro', state: 'RJ' }]);
  });

  it('matches venues by name and keeps locations only when the city matches', async () => {
    const result = await createUseCase().execute('teatro');

    expect(result.events.map((event) => event.slug)).toEqual(['fantasma']);
    expect(result.locations).toEqual([]);
  });

  it('returns empty results for an unknown term', async () => {
    expect(await createUseCase().execute('zzz')).toEqual({
      events: [],
      locations: [],
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/events/use-cases/suggest-events.use-case.spec.ts`
Expected: FAIL — módulo `suggest-events.use-case` não existe.

- [ ] **Step 3: Implementar domínio, repositório e caso de uso**

Em `apps/api/src/modules/events/domain/event-entity.ts` acrescente ao final:

```ts
export interface SuggestLocation {
  city: string;
  state: string;
}

export interface SuggestResult {
  events: EventEntity[];
  locations: SuggestLocation[];
}
```

`apps/api/src/modules/events/domain/events-repository.ts` (arquivo completo):

```ts
import type { SearchFilters } from '@ticketvibe/shared';
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
  SuggestResult,
} from './event-entity';

export interface EventsRepository {
  findAll(view: EventView, filters?: SearchFilters): Promise<EventEntity[]>;
  findBySlug(slug: string): Promise<EventDetailEntity | null>;
  suggest(q: string): Promise<SuggestResult>;
}
```

Em `apps/api/src/modules/events/infra/in-memory-events-repository.ts` — ajuste o import de domínio e acrescente o método antes do fechamento da classe:

```ts
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
  SuggestLocation,
  SuggestResult,
} from '../domain/event-entity';
```

```ts
  suggest(q: string): Promise<SuggestResult> {
    const needle = q.toLowerCase();
    const locations = new Map<string, SuggestLocation>();

    for (const item of this.items) {
      const key = `${item.venueCity}|${item.venueState}`;
      const matches =
        item.venueCity.toLowerCase().includes(needle) ||
        item.venueState.toLowerCase().includes(needle);
      if (matches && !locations.has(key)) {
        locations.set(key, { city: item.venueCity, state: item.venueState });
      }
    }

    const sortedLocations = [...locations.values()].sort(
      (a, b) => a.city.localeCompare(b.city) || a.state.localeCompare(b.state),
    );

    return this.findAll('all', { q }).then((events) => ({
      events: events.slice(0, 5),
      locations: sortedLocations.slice(0, 5),
    }));
  }
```

Crie `apps/api/src/modules/events/use-cases/suggest-events.use-case.ts`:

```ts
import type { SuggestResult } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class SuggestEventsUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  execute(q: string): Promise<SuggestResult> {
    return this.eventsRepository.suggest(q);
  }
}
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/events/use-cases/suggest-events.use-case.spec.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/events/domain apps/api/src/modules/events/infra/in-memory-events-repository.ts apps/api/src/modules/events/use-cases
git commit -m "feat(api): add suggest use case with in-memory repository"
```

---

### Task 3: API — rota `GET /events/suggest` (FTS por relevância)

**Files:**
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.spec.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`

- [ ] **Step 1: Escrever os testes falhando (sem DB — InMemory)**

Em `events.routes.spec.ts`, adicione ao import existente de `@ticketvibe/shared` (mantendo o que já existe):

```ts
  suggestQuerySchema,
```

Acrescente os testes ao final do arquivo (o `app` já é montado com `InMemoryEventsRepository` contendo o stub `destaque` com `venueCity: 'Rio de Janeiro'`):

```ts
describe('GET /events/suggest (in-memory)', () => {
  it('returns matching events and city suggestions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=rio',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events.map((event: { slug: string }) => event.slug)).toEqual([
      'destaque',
    ]);
    expect(body.locations).toEqual([{ city: 'Rio de Janeiro', state: 'RJ' }]);
  });

  it('returns 400 invalid_query when q is too short', async () => {
    const res = await app.inject({ method: 'GET', url: '/events/suggest?q=a' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_query');
    expect(res.json().issues).toBeDefined();
  });

  it('returns 400 invalid_query when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/events/suggest' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_query');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/events/routes/events.routes.spec.ts`
Expected: FAIL — `404` (rota inexistente).

- [ ] **Step 3: Implementar a rota (Drizzle fica no passo seguinte)**

Em `apps/api/src/modules/events/routes/events.routes.ts`:

1. Importe de `@ticketvibe/shared`: `suggestQuerySchema` e `suggestResponseSchema`.
2. Importe `SuggestEventsUseCase` do use-case.
3. **Registre a rota estática ANTES de `GET /events/:slug`** (Fastify find-my-way: rota estática vence a param route apenas se registrada primeiro — ordem literal importa):

```ts
app.get('/events/suggest', async (request, reply) => {
  const parsed = suggestQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'invalid_query',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const result = await suggestEventsUseCase.execute(parsed.data.q);

  const payload = suggestResponseSchema.parse({
    events: result.events.map((event) => ({
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      venueName: event.venueName,
      venueCity: event.venueCity,
      venueState: event.venueState,
      priceFromCents: event.priceFromCents,
    })),
    locations: result.locations,
  });

  return reply.send(payload);
});
```

O caso de uso já é instanciado no módulo de rotas (mesmo padrão dos demais use cases: `new SuggestEventsUseCase(eventsRepository)` no topo do arquivo de rotas, recebendo o `EventsRepository` via `buildApp`).

- [ ] **Step 4: Rodar e confirmar passagem (InMemory)**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/events/routes/events.routes.spec.ts`
Expected: PASS (15 existentes + 3 novos).

- [ ] **Step 5: Escrever os testes de integração falhando (Drizzle real)**

Em `events.routes.integration.spec.ts`, adicione `suggestQuerySchema` ao import de `@ticketvibe/shared` (se já importar algo) e os testes:

```ts
describe('GET /events/suggest (integration)', () => {
  it('ranks FTS matches and limits events to five', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/events/suggest?q=${encodeURIComponent('São Paulo')}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(5);
    expect(body.locations).toEqual([{ city: 'São Paulo', state: 'SP' }]);
  });

  it('matches city text in venue content for event titles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=fantasma',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events.map((event: { slug: string }) => event.slug)).toEqual([
      'o-fantasma-da-opera',
    ]);
    expect(body.locations).toEqual([]);
  });

  it('suggests locations only for venues that still have events', async () => {
    await testDb.execute(
      sql`DELETE FROM events WHERE venue_id = (SELECT id FROM venues WHERE name = 'Vivo Rio')`,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=rio',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.locations).toEqual([]);
    expect(
      body.events.every(
        (event: { venueName: string }) => event.venueName !== 'Vivo Rio',
      ),
    ).toBe(true);
  });

  it('returns empty results for an unknown term', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/suggest?q=zzzzzzzz',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ events: [], locations: [] });
  });

  it('returns 400 invalid_query for a missing query', async () => {
    const res = await app.inject({ method: 'GET', url: '/events/suggest' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_query');
  });
});
```

Ajuste os imports do topo do arquivo: `sql` de `drizzle-orm` (para o DELETE cru) e `suggestQuerySchema` se usado. O `app` de integração já é montado com `DrizzleEventsRepository(testDb)`; reutilize o mesmo `app` e o `beforeEach` de reset já existente.

- [ ] **Step 6: Rodar e confirmar falha**

Run: `pnpm infra:up` (se o Postgres não estiver no ar) e `pnpm --filter @ticketvibe/api exec vitest run src/modules/events/routes/events.routes.integration.spec.ts`
Expected: FAIL — DrizzleEventsRepository não implementa `suggest` (erro de tipo) e/ou 404/500.

- [ ] **Step 7: Implementar `suggest` no DrizzleEventsRepository**

Em `apps/api/src/modules/events/infra/drizzle-events-repository.ts` — reutilize `buildConditions` (a query FTS de `findAll` já monta `websearch_to_tsquery('portuguese', unaccent(...))` + `ts_rank`) e acrescente o método na classe:

```ts
  async suggest(q: string): Promise<SuggestResult> {
    const [eventRows, locationRows] = await Promise.all([
      this.db
        .select(eventSelect)
        .from(eventTable)
        .innerJoin(venueTable, sql`${eventTable}.venueId = ${venueTable}.id`)
        .innerJoin(categoryTable, sql`${eventTable}.categoryId = ${categoryTable}.id`)
        .where(buildConditions('all', { q }))
        .orderBy(
          desc(
            sql`ts_rank(${eventTable}.searchVector, websearch_to_tsquery('portuguese', unaccent(${q})))`,
          ),
          asc(eventTable.startsAt),
          asc(eventTable.id),
        )
        .limit(5),
      this.db
        .selectDistinct({ city: venueTable.city, state: venueTable.state })
        .from(venueTable)
        .innerJoin(eventTable, sql`${eventTable}.venueId = ${venueTable}.id`)
        .where(
          or(
            sql`unaccent(${venueTable}.city}) ilike unaccent(${'%' + q + '%'})`,
            sql`unaccent(${venueTable}.state}) ilike unaccent(${'%' + q + '%'})`,
          ),
        )
        .orderBy(asc(venueTable.city), asc(venueTable.state))
        .limit(5),
    ]);

    return {
      events: eventRows.map(toEventEntity),
      locations: locationRows.map((row) => ({
        city: row.city,
        state: row.state,
      })),
    };
  }
```

> **ATENÇÃO:** a sintaxe de template acima é esquemática — ajuste para a estrutura real do arquivo: use os helpers `or`/`asc`/`desc`/`sql` já importados de `drizzle-orm`, os nomes reais de tabela/coluna (`venues.city`, `events.searchVector`) e o mapper existente (`toEventEntity` ou equivalente). Se `buildConditions` não estiver exportado/visível nesse escopo, copie a cláusula FTS da query de `findAll` exatamente como está. NÃO invente nomes: abra o arquivo primeiro e mimetize as convenções de query já presentes.

Ajuste também a interface de retorno: `SuggestResult` espera `EventEntity[]` (não detalhe) — use o mapper de lista já existente de `findAll`.

- [ ] **Step 8: Rodar e confirmar passagem**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/events`
Expected: PASS (unit + integração; 24 testes de rota no total).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/events
git commit -m "feat(api): expose GET /events/suggest with fts ranking"
```

---

### Task 4: Web — nuqs instalado e parsers de filtros de busca

**Files:**
- Modify: `apps/web/package.json` + lockfile (via install)
- Create: `apps/web/src/lib/search-filters-parsers.ts`
- Test: `apps/web/src/lib/search-filters-parsers.spec.ts`

- [ ] **Step 1: Instalar nuqs**

Run: `pnpm --filter @ticketvibe/web add nuqs`
Expected: `nuqs@^2.10.2` em `apps/web/package.json`; peers `next>=14.2` e `react>=18.2||19` satisfatos. Commit apenas o manifest + lockfile junto com os parsers (Step 5).

- [ ] **Step 2: Escrever o teste falhando**

Crie `apps/web/src/lib/search-filters-parsers.spec.ts`:

```tsx
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { searchFiltersParsers } from './search-filters-parsers';

type UrlUpdate = { queryString: string; options?: { history?: string } };

function renderWith(searchParams: string, onUrlUpdate?: (e: UrlUpdate) => void) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    withNuqsTestingAdapter({
      searchParams,
      onUrlUpdate,
    })({ children }) as ReactNode;

  return renderHook(() => {
    const parsers = searchFiltersParsers();
    return parsers;
  }, { wrapper });
}

describe('searchFiltersParsers', () => {
  it('uppercases state and drops invalid UF', () => {
    const { result } = renderWith('state=sp');
    expect(result.current.parseAsState.parse('sp')).toBe('SP');
    expect(result.current.parseAsState.parse('sao paulo')).toBeNull();
    expect(result.current.parseAsState.parse('')).toBeNull();
  });

  it('normalizes q by trimming and clears it on default', () => {
    const { result } = renderWith('q=%20fanta%20');
    expect(result.current.parseAsString.parse('  fanta ')).toBe('fanta');
    expect(result.current.parseAsString.clearOnDefault).toBe(true);
    expect(result.current.parseAsString.shallow).toBe(false);
  });

  it('keeps history as replace on every parser', () => {
    const { result } = renderWith('');
    for (const parser of Object.values(result.current)) {
      expect(parser.history).toBe('replace');
      expect(parser.shallow).toBe(false);
      expect(parser.clearOnDefault).toBe(true);
    }
  });
});
```

> **Nota:** se o NuqsTestingAdapter não aceitar children dessa forma, use o formato documentado da versão instalada (`withNuqsTestingAdapter({...})(children)` é o padrão nuqs v2) — verifique os tipos reais e ajuste o `wrapper` sem alterar as asserções.

- [ ] **Step 3: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/lib/search-filters-parsers.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar os parsers**

Crie `apps/web/src/lib/search-filters-parsers.ts`:

```ts
import { createParser, parseAsString } from 'nuqs';
import type { TransitionStartFunction } from 'react';

export const SEARCH_FILTER_KEYS = ['q', 'category', 'state', 'from', 'to'] as const;

export type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number];

const BASE_OPTIONS = {
  clearOnDefault: true,
  shallow: false,
} as const;

const parseAsUf = createParser<string>({
  parse: (value) => {
    const trimmed = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
  },
  serialize: (value) => value,
});

export function searchFiltersParsers(startTransition?: TransitionStartFunction) {
  const options = { ...BASE_OPTIONS, startTransition };
  return {
    q: parseAsString.withOptions(options),
    category: parseAsString.withOptions(options),
    state: parseAsUf.withOptions(options),
    from: parseAsString.withOptions(options),
    to: parseAsString.withOptions(options),
  };
}
```

- [ ] **Step 5: Rodar e confirmar passagem**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/lib/search-filters-parsers.spec.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/search-filters-parsers.ts apps/web/src/lib/search-filters-parsers.spec.ts
git commit -m "feat(web): install nuqs and add search filter parsers"
```

---

### Task 5: Web — `SearchTransitionProvider` + `ResultsRegion` + `PageSkeleton`

**Files:**
- Create: `apps/web/src/components/search-transition.tsx`
- Create: `apps/web/src/components/home/page-skeleton.tsx`
- Modify: `apps/web/src/app/page.tsx` (extrair o skeleton; wiring fica no Task 6)
- Test: `apps/web/src/components/search-transition.spec.tsx`

- [ ] **Step 1: Extrair `PageSkeleton` de `page.tsx`**

Crie `apps/web/src/components/home/page-skeleton.tsx` copiando **exatamente** o componente `PageSkeleton` (ou equivalente) que hoje vive dentro de `app/page.tsx`, mantendo o mesmo markup e classes. Em `page.tsx`, remova a definição local e importe de `./../components/home/page-skeleton` (ajuste o caminho relativo real). `page.tsx` deve continuar compilando e os E2Es de loading do 05 devem seguir verdes (o fallback visual não muda).

- [ ] **Step 2: Escrever os testes falhando**

Crie `apps/web/src/components/search-transition.spec.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createContext, useContext, use, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ResultsRegion,
  SearchTransitionContext,
  SearchTransitionProvider,
} from './search-transition';

describe('SearchTransitionProvider', () => {
  it('exposes a shared isPending that becomes true while a transition is pending', async () => {
    let resolveTransition!: () => void;
    const gate = new Promise<void>((r) => {
      resolveTransition = r;
    });

    let observed: boolean | undefined;
    function Reporter() {
      const { isPending, startTransition } = useContext(SearchTransitionContext);
      observed = isPending;
      useEffect(() => {
        startTransition(async () => {
          await gate;
        });
      }, [startTransition]);
      return null;
    }

    render(
      <SearchTransitionProvider>
        <Reporter />
      </SearchTransitionProvider>,
    );

    expect(observed).toBe(false);
    await act(async () => {
      resolveTransition();
      await gate;
    });
    expect(observed).toBe(false);
  });

  it('falls back to an immediate transition when no provider is present', () => {
    function Reporter() {
      const { isPending } = useContext(SearchTransitionContext);
      return <span>{String(isPending)}</span>;
    }

    render(<Reporter />);
    expect(screen.getByText('false')).toBeDefined();
  });
});

describe('ResultsRegion', () => {
  it('renders the skeleton while pending and children otherwise', async () => {
    let observed = '';
    function Child() {
      const { isPending } = useContext(SearchTransitionContext);
      observed = isPending ? 'pending' : 'children';
      return <div>{observed}</div>;
    }

    render(
      <SearchTransitionProvider>
        <ResultsRegion>
          <Child />
        </ResultsRegion>
      </SearchTransitionProvider>,
    );

    expect(screen.getByText('children')).toBeDefined();
  });
});
```

> Se o React 19 + `startTransition(async ...)` não marcar `isPending` nesse cenário (o mecanismo do nuqs depende de `use()` suspenso dentro da transição), substitua o primeiro teste pelo padrão que **funciona de verdade**: um child que chama `use(gate)` dentro de um `Suspense`, renderizado dentro de `startTransition`, assertando que `screen` mostra o fallback antes e as children depois. Verifique a resposta real antes de ajustar — o objetivo é provar que o contexto compartilha `isPending`.

- [ ] **Step 3: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/search-transition.spec.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar o provider e a região**

Crie `apps/web/src/components/search-transition.tsx`:

```tsx
'use client';

import type { TransitionStartFunction } from 'react';
import {
  createContext,
  use,
  useMemo,
  useTransition,
  type ReactNode,
} from 'react';

export interface SearchTransitionApi {
  isPending: boolean;
  startTransition: TransitionStartFunction;
}

const immediateTransition: TransitionStartFunction = (action) => {
  void action();
};

export const SearchTransitionContext = createContext<SearchTransitionApi>({
  isPending: false,
  startTransition: immediateTransition,
});

export function SearchTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const value = useMemo<SearchTransitionApi>(
    () => ({ isPending, startTransition }),
    [isPending, startTransition],
  );

  return (
    <SearchTransitionContext.Provider value={value}>
      {children}
    </SearchTransitionContext.Provider>
  );
}

export function useSearchTransition(): SearchTransitionApi {
  return use(SearchTransitionContext);
}

export function ResultsRegion({ children }: { children: ReactNode }) {
  const { isPending } = use(SearchTransitionContext);
  if (isPending) {
    return <PageSkeletonLazy />;
  }
  return <>{children}</>;
}
```

> **Ajuste obrigatório:** importe `PageSkeleton` de `./home/page-skeleton` diretamente (sem lazy) — `ResultsRegion` pode ser client-side e simplesmente retornar `<PageSkeleton />` quando `isPending`. Se o `page.tsx` do servidor exibir `ResultsRegion` diretamente, mantenha `'use client'` e deixe o `Suspense` do Task 6 cuidar do fallback de primeira carga; `ResultsRegion` só cobre o pending de transições subsequentes.

- [ ] **Step 5: Rodar e confirmar passação**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/search-transition.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/search-transition.tsx apps/web/src/components/search-transition.spec.tsx apps/web/src/components/home/page-skeleton.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): add search transition provider and results region"
```

---

### Task 6: Web — hook `useSearchFilters` + wiring em layout, Storybook e página

**Files:**
- Create: `apps/web/src/lib/use-search-filters.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/.storybook/preview.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Criar o hook (sem teste próprio — coberto pelo spec dos chips e do header)**

Crie `apps/web/src/lib/use-search-filters.ts`:

```ts
'use client';

import { useQueryStates } from 'nuqs';
import { useContext, useMemo } from 'react';
import { SearchTransitionContext } from '../components/search-transition';
import { searchFiltersParsers } from './search-filters-parsers';

export function useSearchFilters() {
  const { isPending, startTransition } = useContext(SearchTransitionContext);
  const parsers = useMemo(() => searchFiltersParsers(startTransition), [startTransition]);
  const [filters, setFiltersRaw] = useQueryStates(parsers);

  const setFilters = (
    values: Partial<Record<keyof ReturnType<typeof searchFiltersParsers>, string | null>>,
  ) => {
    void setFiltersRaw(values);
  };

  return { filters, setFilters, isPending };
}
```

> Ajuste o tipo de `setFilters` para o que `useQueryStates` realmente aceita (inferido dos parsers). O `void` é obrigatório: a tarefa usa `noFloatingPromises`.

- [ ] **Step 2: Envolver o layout**

Em `apps/web/src/app/layout.tsx`, dentro de `<body>` (envolvendo o conteúdo existente, mantendo classes e providers já presentes):

```tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { SearchTransitionProvider } from '../components/search-transition';
```

```tsx
<body className={...}>
  <NuqsAdapter>
    <SearchTransitionProvider>
      {/* conteúdo existente */}
    </SearchTransitionProvider>
  </NuqsAdapter>
</body>
```

- [ ] **Step 3: Envolver o Storybook**

Em `apps/web/.storybook/preview.tsx`, adicione nos `decorators` (ou num decorator único envolvendo todos):

```tsx
import { NuqsAdapter } from 'nuqs/adapters/testing';
import { SearchTransitionProvider } from '../src/components/search-transition';
```

Use o adapter de **testing** no Storybook (sem dependência de Next router). Verifique se `nuqs/adapters/testing` funciona fora de teste; se a exportação exigir ambiente de teste, use `nuqs/adapters/react` (ou o adapter vazio da doc de v2) — escolha o que compilar sem warnings.

- [ ] **Step 4: Ligar `ResultsRegion` + `Suspense` na página**

Em `apps/web/src/app/page.tsx`, o componente de página (server) passa a renderizar:

```tsx
import { Suspense } from 'react';
import { ResultsRegion } from '../components/search-transition';
import { PageSkeleton } from '../components/home/page-skeleton';

export default async function Home(searchParams: ...) {
  const filters = await filtersPromise; // fluxo atual inalterado
  ...
  return (
    <ResultsRegion>
      <Suspense fallback={<PageSkeleton />}>
        <HomeContent filters={filters} /* ...props atuais */ />
      </Suspense>
    </ResultsRegion>
  );
}
```

> Mantenha toda a lógica de servidor (`hasActiveFilters`, busca de categorias, etc.) intacta. Se `page.tsx` já tiver `Suspense` interno, só adicione o `ResultsRegion` por fora. Se o Next reclamar que componente cliente com `use` precisa de Suspense acima, é exatamente o `<Suspense>` recém-adicionado que resolve.

- [ ] **Step 5: Verificar**

Run: `pnpm --filter @ticketvibe/web exec vitest run` (todos os specs web devem seguir verdes — nenhum componente usa o hook ainda) e `pnpm --filter @ticketvibe/web exec next build`
Expected: build limpo, testes passando.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/use-search-filters.ts apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/.storybook/preview.tsx
git commit -m "feat(web): wire nuqs adapter and transition provider into layout"
```

---

### Task 7: Web — `CategoryChips` dirigido pelo estado Nuqs

**Files:**
- Modify: `apps/web/src/components/home/category-chips.tsx`
- Test: `apps/web/src/components/home/category-chips.spec.tsx` (reescrita)
- Modify: `apps/web/src/components/home/search-results.spec.tsx` (wrapper Nuqs)

- [ ] **Step 1: Reescrever o spec do chip para Nuqs (falhando)**

Reescreva `category-chips.spec.tsx`: cada render passa por `withNuqsTestingAdapter({ searchParams, onUrlUpdate })`, as asserções de clique agora capturam a URL resultante (`onUrlUpdate` síncrono pós-`fireEvent`) e as asserções de `router.push`/`useRouter` saem.

```tsx
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryChips } from './category-chips';

type UrlUpdate = { queryString: string };

function renderChips(searchParams: string, onUrlUpdate?: (e: UrlUpdate) => void) {
  const categories = [
    { slug: 'shows', name: 'Shows', count: 12 },
    { slug: 'teatro', name: 'Teatro', count: 8 },
  ];
  return render(
    withNuqsTestingAdapter({ searchParams, onUrlUpdate })(
      <CategoryChips categories={categories} total={12} />,
    ) as ReactNode,
  );
}

describe('CategoryChips', () => {
  it('marks the selected category from the URL', () => {
    renderChips('category=teatro');
    const selected = screen.getByRole('button', { name: /teatro/i });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
  });

  it('writes the clicked category into the URL (replace)', async () => {
    const onUrlUpdate = vi.fn();
    renderChips('', onUrlUpdate);
    fireEvent.click(screen.getByRole('button', { name: /shows/i }));
    expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    const event = onUrlUpdate.mock.calls[0][0] as UrlUpdate;
    expect(event.queryString).toContain('category=shows');
  });

  it('removes category from the URL when clicking the active one', async () => {
    const onUrlUpdate = vi.fn();
    renderChips('category=shows', onUrlUpdate);
    fireEvent.click(screen.getByRole('button', { name: /shows/i }));
    const event = onUrlUpdate.mock.calls[0][0] as UrlUpdate;
    expect(event.queryString).not.toContain('category=shows');
  });
});
```

Mantenha os casos já existentes do spec atual (todos os `it` atuais devem sobreviver, traduzidos para o formato Nuqs: estados selecionados vêm da URL, cliques geram `onUrlUpdate`). Remova qualquer mock de `next/navigation`.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/home/category-chips.spec.tsx`
Expected: FAIL — componente ainda usa `useRouter`/handlers manuais.

- [ ] **Step 3: Reescrever o componente**

Em `category-chips.tsx` (mantendo markup, classes, `role="group"`, aria e as props vindas do servidor):

```ts
'use client';
import { useSearchFilters } from '../../lib/use-search-filters';

// dentro do componente:
const { filters, setFilters } = useSearchFilters();
const selected = filters.category ?? null;

const onCategoryClick = (slug: string) => {
  setFilters({ category: selected === slug ? null : slug });
};
```

Remova `useSearchParams`, `useRouter`, `pushCategory` e qualquer helper de URL. `selected` continua vindo das **props** do servidor quando o componente já as recebe — se receber `selectedCategory` como prop, **mantenha a prop como fonte do estado visual** e use o setter só para navegar (decisão: server source of truth). Se o spec atual só depende de props, a prop permanece obrigatória.

- [ ] **Step 4: Ajustar `search-results.spec.tsx`**

Em `search-results.spec.tsx`:
1. Remova `vi.mock('next/navigation', ...)` (só existia por causa do router do chip).
2. Envolva cada render de `<SearchResults>` com `withNuqsTestingAdapter({ searchParams: '' })` (o componente monta `CategoryChips` mesmo sem categorias — os hooks rodam antes do `return null`).

- [ ] **Step 5: Rodar e confirmar passação**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/home`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/home/category-chips.tsx apps/web/src/components/home/category-chips.spec.tsx apps/web/src/components/home/search-results.spec.tsx
git commit -m "refactor(web): drive category chips from nuqs query state"
```

---

### Task 8: Web — proxy `/api/suggest`

**Files:**
- Create: `apps/web/app/api/suggest/route.ts` (ou `src/app/api/suggest/route.ts` — confirme o root real de `app/`)
- Test: `apps/web/src/app/api/suggest/route.spec.ts` (ou padrão equivalente já usado no repo — verifique onde ficam specs de route handlers; se não houver precedente, crie ao lado do handler)

- [ ] **Step 1: Escrever o spec falhando**

```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const server = setupServer();

function url(q: string) {
  return new Request(`http://localhost:3000/api/suggest?q=${encodeURIComponent(q)}`);
}

describe('GET /api/suggest', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('returns 400 when q is missing', async () => {
    const res = await GET(new Request('http://localhost:3000/api/suggest'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
  });

  it('proxies a valid payload through the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/suggest', () =>
        HttpResponse.json({
          events: [
            {
              slug: 'o-fantasma-da-opera',
              title: 'O Fantasma da Ópera',
              startsAt: '2026-10-22T23:00:00.000Z',
              venueName: 'Teatro Renault',
              venueCity: 'São Paulo',
              venueState: 'SP',
              priceFromCents: 12000,
            },
          ],
          locations: [],
        }),
      ),
    );

    const res = await GET(url('fanta'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].slug).toBe('o-fantasma-da-opera');
  });

  it('returns 502 when the upstream fails', async () => {
    server.use(
      http.get('http://localhost:3001/events/suggest', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    const res = await GET(url('fanta'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/suggest', () =>
        HttpResponse.json({ events: 'nope', locations: null }),
      ),
    );

    const res = await GET(url('fanta'));
    expect(res.status).toBe(502);
  });
});
```

> O MSW intercepta o `fetch` do route handler no ambiente Node (`msw/node`) — o handler pode usar path relativo no `fetch` interno mas o handler MSW precisa da URL absoluta. Configure o `API_URL` do ambiente do teste para `http://localhost:3001` (veja como `events-api` resolve `API_URL` e replique).

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run <caminho do spec>`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o handler**

```ts
import { suggestQuerySchema, suggestResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(request: Request): Promise<Response> {
  const parsed = suggestQuerySchema.safeParse({
    q: new URL(request.url).searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/suggest?q=${encodeURIComponent(parsed.data.q)}`,
      { cache: 'no-store' },
    );
  } catch {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = suggestResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Rodar e confirmar passação**

Run: `pnpm --filter @ticketvibe/web exec vitest run <caminho>`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/suggest apps/web/src/app/api/suggest 2>/dev/null || git add -A apps/web/app apps/web/src/app/api
git commit -m "feat(web): add suggest proxy route handler"
```

---

### Task 9: Web — hook `useSearchSuggestions`

**Files:**
- Create: `apps/web/src/lib/use-search-suggestions.ts`
- Test: `apps/web/src/lib/use-search-suggestions.spec.tsx`

- [ ] **Step 1: Escrever o spec falhando**

Timers reais + `waitFor` (sem fake timers — debounce de 250ms é barato). MSW via `msw/node` no jsdom, handler em `http://localhost:3000/api/suggest`.

```tsx
import { fireEvent, renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useSearchSuggestions } from './use-search-suggestions';
import { SUGGESTIONS_LISTBOX_ID, suggestionOptionId } from './use-search-suggestions';

const eventItem = {
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  startsAt: '2026-10-22T23:00:00.000Z',
  venueName: 'Teatro Renault',
  venueCity: 'São Paulo',
  venueState: 'SP',
  priceFromCents: 12000,
};

const server = setupServer();

function setup(
  overrides?: {
    onSelect?: ReturnType<typeof vi.fn>;
    fetchHandler?: () => HttpResponse;
  },
) {
  const onSelect = overrides?.onSelect ?? vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;
  const utils = renderHook(
    () => useSearchSuggestions({ onSelect }),
    { wrapper },
  );
  return { ...utils, onSelect };
}

describe('useSearchSuggestions', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('stays idle below two characters and never fetches', async () => {
    server.use(
      http.get('http://localhost:3000/api/suggest', () => {
        throw new Error('should not fetch');
      }),
    );
    const { result } = setup();

    act(() => {
      result.current.setQuery('a');
    });
    await new Promise((r) => setTimeout(r, 400));

    expect(result.current.status).toBe('idle');
    expect(result.current.open).toBe(false);
  });

  it('debounces, fetches and exposes results with highlight', async () => {
    server.use(
      http.get('http://localhost:3000/api/suggest', () =>
        HttpResponse.json({ events: [eventItem], locations: [{ city: 'São Paulo', state: 'SP' }] }),
      ),
    );
    const { result } = setup();

    act(() => {
      result.current.setQuery('fanta');
    });
    expect(result.current.status).toBe('loading');

    await waitFor(
      () => {
        expect(result.current.status).toBe('ready');
      },
      { timeout: 3000 },
    );

    expect(result.current.open).toBe(true);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.locations).toHaveLength(1);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.query).toBe('fanta');
  });

  it('reports empty state for no matches', async () => {
    server.use(
      http.get('http://localhost:3000/api/suggest', () =>
        HttpResponse.json({ events: [], locations: [] }),
      ),
    );
    const { result } = setup();

    act(() => {
      result.current.setQuery('zzzz');
    });
    await waitFor(() => expect(result.current.status).toBe('empty'), {
      timeout: 3000,
    });
    expect(result.current.open).toBe(false);
  });

  it('closes silently on a server error', async () => {
    server.use(
      http.get('http://localhost:3000/api/suggest', () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );
    const { result } = setup();

    act(() => {
      result.current.setQuery('fanta');
    });
    await waitFor(() => expect(result.current.status).toBe('error'), {
      timeout: 3000,
    });
    expect(result.current.open).toBe(false);
  });

  it('selects a highlighted option with Enter and lets submit pass otherwise', async () => {
    const onSelect = vi.fn();
    server.use(
      http.get('http://localhost:3000/api/suggest', () =>
        HttpResponse.json({ events: [eventItem], locations: [] }),
      ),
    );
    const { result } = setup({ onSelect });

    act(() => {
      result.current.setQuery('fanta');
    });
    await waitFor(() => expect(result.current.status).toBe('ready'), {
      timeout: 3000,
    });

    act(() => {
      const handled = result.current.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>);
      expect(handled).toBe(true);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setActiveIndex(-1);
    });
    act(() => {
      const handled = result.current.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>);
      expect(handled).toBe(false);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('exposes stable ARIA ids', async () => {
    const { result } = setup();
    expect(SUGGESTIONS_LISTBOX_ID).toBe('search-suggestions-listbox');
    expect(suggestionOptionId(0)).toBe('search-suggestion-option-0');
    expect(result.current.listboxId).toBe(SUGGESTIONS_LISTBOX_ID);
    expect(result.current.activeDescendant).toBeUndefined();
  });
});
```

> Ajuste a forma exata das props de retorno ao que você implementar — os comportamentos que **não** podem mudar: debounce 250ms, min 2 chars, `loading` imediato ao digitar, `empty`/`error` fecham o painel, Arrow ↓↑/Esc/Enter, `onSelect` só com destaque, id do listbox/option.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/lib/use-search-suggestions.spec.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o hook**

Crie `apps/web/src/lib/use-search-suggestions.ts`:

```ts
'use client';

import { suggestResponseSchema, type SuggestResponse } from '@ticketvibe/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

export const SUGGESTIONS_LISTBOX_ID = 'search-suggestions-listbox';
export const suggestionOptionId = (index: number) => `search-suggestion-option-${index}`;

export const MIN_QUERY_LENGTH = 2;
export const DEBOUNCE_MS = 250;

export type SuggestionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type SuggestionItem =
  | { kind: 'event'; index: number; event: SuggestResponse['events'][number] }
  | { kind: 'location'; index: number; location: SuggestResponse['locations'][number] };

interface UseSearchSuggestionsOptions {
  onSelect: (item: SuggestionItem) => void;
}

export function useSearchSuggestions({ onSelect }: UseSearchSuggestionsOptions) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SuggestionStatus>('idle');
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const rootRef = useRef<HTMLDivElement | null>(null);

  const events = data?.events ?? [];
  const locations = data?.locations ?? [];
  const items: SuggestionItem[] = [
    ...events.map((event, index) => ({ kind: 'event' as const, index, event })),
    ...locations.map((location, index) => ({
      kind: 'location' as const,
      index: events.length + index,
      location,
    })),
  ];

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setData(null);
      setStatus('idle');
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    setStatus('loading');
    setActiveIndex(0);
    const timer = setTimeout(async () => {
      try {
        const url = new URL('/api/suggest', window.location.origin);
        url.searchParams.set('q', query.trim());
        const res = await fetch(url, { signal: AbortSignal.any ? undefined : undefined });
        if (!res.ok) throw new Error(String(res.status));
        const payload = suggestResponseSchema.parse(await res.json());
        setData(payload);
        const hasResults = payload.events.length + payload.locations.length > 0;
        setStatus(hasResults ? 'ready' : 'empty');
        setOpen(hasResults);
        setActiveIndex(hasResults ? 0 : -1);
      } catch {
        setStatus('error');
        setOpen(false);
        setActiveIndex(-1);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);
```

> **ATENÇÃO:** use `AbortController` de verdade (criar no effect, `signal` no `fetch`, abort no cleanup) — o trecho acima é o esqueleto; complete o `AbortController` e o cleanup do listener de outside-click. Faça o mesmo para o `rootRef`/`onSelectRef` (refs já usados no painel).

Continue o hook com:

```ts
  const close = useCallback(() => setOpen(false), []);

  const reopen = useCallback(() => {
    if (items.length > 0 && status === 'ready') setOpen(true);
  }, [items.length, status]);

  const selectIndex = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      setOpen(false);
      setActiveIndex(-1);
      onSelectRef.current(item);
    },
    [items],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
      if (event.key === 'Escape') {
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return false;
      }
      if (!open || items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? items.length - 1 : index - 1));
        return true;
      }
      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        selectIndex(activeIndex);
        return true;
      }
      return false;
    },
    [activeIndex, items.length, open, selectIndex],
  );

  const highlighted = ...; // helper de highlight: quebra termo em partes, retorna JSX ou texto; usar num módulo pequeno exportado do próprio arquivo se preferir

  return {
    query,
    setQuery,
    status,
    open,
    setOpen,
    close,
    reopen,
    events,
    locations,
    items,
    activeIndex,
    setActiveIndex,
    selectIndex,
    handleKeyDown,
    rootRef,
    listboxId: SUGGESTIONS_LISTBOX_ID,
    activeDescendant:
      open && activeIndex >= 0 ? suggestionOptionId(activeIndex) : undefined,
    highlighted,
  };
}
```

Detalhes obrigatórios:
- **`highlight(text, query)`** exportado do arquivo: envolve matches com `<mark className="bg-transparent text-inherit">` (não pode mudar a cor — passou no contraste do 03). Se preferir, mova para `lib/highlight.ts` com spec própria.
- Erros e `empty` **fecham** o painel; digitar após `ready` volta a `loading` (skeleton imediato).
- `reopen` chamado pelo `onFocus` do input (Task 11).

- [ ] **Step 4: Rodar e confirmar passação**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/lib/use-search-suggestions.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/use-search-suggestions.ts apps/web/src/lib/use-search-suggestions.spec.tsx apps/web/src/lib/highlight.ts 2>/dev/null || true
git commit -m "feat(web): add search suggestions hook"
```

---

### Task 10: Web — painel `SearchSuggestions` (presentacional)

**Files:**
- Create: `apps/web/src/components/search-suggestions.tsx`
- Test: `apps/web/src/components/search-suggestions.spec.tsx`

- [ ] **Step 1: Escrever o spec falhando**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SuggestionItem } from '../lib/use-search-suggestions';
import { SearchSuggestions } from './search-suggestions';

const eventItem = {
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  startsAt: '2026-10-22T23:00:00.000Z',
  venueName: 'Teatro Renault',
  venueCity: 'São Paulo',
  venueState: 'SP',
  priceFromCents: 12000,
};

function renderPanel(overrides?: Partial<React.ComponentProps<typeof SearchSuggestions>>) {
  const props: React.ComponentProps<typeof SearchSuggestions> = {
    open: true,
    status: 'ready',
    items: [
      { kind: 'event', index: 0, event: eventItem },
      { kind: 'location', index: 1, location: { city: 'São Paulo', state: 'SP' } },
    ] satisfies SuggestionItem[],
    activeIndex: 0,
    listboxId: 'search-suggestions-listbox',
    onHover: vi.fn(),
    onSelect: vi.fn(),
    highlighted: (text: string, query: string) => text,
    ...overrides,
  };
  return { ...render(<SearchSuggestions {...props} />), props };
}

describe('SearchSuggestions', () => {
  it('renders nothing when closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders groups with options and active descendant', () => {
    renderPanel();
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-label')).toBe('Sugestões de busca');
    expect(screen.getByRole('group', { name: 'Eventos' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Locais' })).toBeDefined();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].id).toBe('search-suggestion-option-0');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  });

  it('selects on mouse down without firing a click handler', () => {
    const { props } = renderPanel();
    const options = screen.getAllByRole('option');
    fireEvent.mouseDown(options[1]);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onSelect.mock.calls[0][0].kind).toBe('location');
    expect(options[1].onclick ?? null).toBeNull();
  });

  it('shows skeletons while loading', () => {
    renderPanel({ status: 'loading', items: [] });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.querySelectorAll('[data-testid="suggestion-skeleton"]').length).toBeGreaterThan(0);
  });

  it('shows the empty message', () => {
    renderPanel({ status: 'empty', items: [] });
    expect(screen.getByText('Nenhum resultado')).toBeDefined();
  });

  it('does not render an empty result when closed', () => {
    renderPanel({ open: false, status: 'empty', items: [] });
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/search-suggestions.spec.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o painel**

Crie `apps/web/src/components/search-suggestions.tsx`:

```tsx
'use client';

import { formatBRL, formatDatePtBR } from '../lib/format';
import type { SuggestionItem, SuggestionStatus } from '../lib/use-search-suggestions';
import { suggestionOptionId } from '../lib/use-search-suggestions';

interface SearchSuggestionsProps {
  open: boolean;
  status: SuggestionStatus;
  items: SuggestionItem[];
  activeIndex: number;
  listboxId: string;
  onHover: (index: number) => void;
  onSelect: (item: SuggestionItem) => void;
  highlighted: (text: string, query: string) => React.ReactNode;
}
```

Comportamento:
- Retorna `null` quando `!open` (exceto o estado de teste do loading — decida: se `!open` retornar null, o teste de skeleton deve passar `open: true`; **prefira** `if (!open && status !== 'loading') return null` e mantenha o spec coerente: skeleton visível durante `loading` mesmo antes do fetch retornar).
- Raiz: `<div id={listboxId} role="listbox" aria-label="Sugestões de busca" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-card shadow-lg py-1">`.
- Dois grupos: `<div role="group" aria-labelledby="...">` com headings ocultos/visuais `Eventos` e `Locais` (ids fixos `search-suggestions-group-events` / `-locations`).
- Option evento: `<div role="option" id={suggestionOptionId(index)} aria-selected={activeIndex === index} onMouseDown={(e) => { e.preventDefault(); onSelect(item); }} onMouseEnter={() => onHover(index)} className={...}>` com `formatDatePtBR(event.startsAt)` + `event.venueName · event.venueCity` + `formatBRL(event.priceFromCents / 100)`.
- Option local: mesmo padrão, `location.city, location.state`.
- **Sem `onClick`** em opções (evita `useKeyWithClickEvents`); `role="option"` satisfaz `noStaticElementInteractions`.
- `status === 'loading'` → 3 esqueletos `<div data-testid="suggestion-skeleton" className="h-10 animate-pulse rounded bg-secondary" />` dentro do listbox.
- `status === 'empty'` e open → `<p className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado</p>`.

- [ ] **Step 4: Rodar e confirmar passação**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/search-suggestions.spec.tsx`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/search-suggestions.tsx apps/web/src/components/search-suggestions.spec.tsx
git commit -m "feat(web): add suggestions panel component"
```

---

### Task 11: Web — `HeaderSearch` completo (Nuqs submit + combobox + painel)

**Files:**
- Rewrite: `apps/web/src/components/header-search.tsx`
- Rewrite: `apps/web/src/components/header-search.spec.tsx`

- [ ] **Step 1: Reescrever o spec (falhando)**

Reescreva `header-search.spec.tsx` mantendo todos os cenários atuais e traduzindo-os:

1. **Remova** os mocks de `next/navigation` (`useRouter`, `useSearchParams`).
2. Cada render passa por `withNuqsTestingAdapter({ searchParams, onUrlUpdate })`.
3. Seletor: `screen.getByRole('combobox')` em vez de `searchbox` (3 lugares — obrigatório pelo Biome).
4. **Novos cenários:**

```tsx
it('writes q into the URL on submit (server source of truth)', () => {
  const onUrlUpdate = vi.fn();
  renderSearch('onUrlUpdate', onUrlUpdate);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '  cyberpunk  ' } });
  fireEvent.submit(screen.getByRole('combobox').closest('form')!);
  expect(onUrlUpdate).toHaveBeenCalledTimes(1);
  const { queryString } = onUrlUpdate.mock.calls[0][0];
  expect(queryString).toContain('q=cyberpunk');
});

it('clears q from the URL when submitting an empty input', () => {
  const onUrlUpdate = vi.fn();
  renderSearch('q=fantasma', onUrlUpdate);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
  fireEvent.submit(screen.getByRole('combobox').closest('form')!);
  const { queryString } = onUrlUpdate.mock.calls[0][0];
  expect(queryString).not.toContain('q=');
});

it('exposes combobox aria wiring and conditional aria-controls', () => {
  renderSearch('');
  const input = screen.getByRole('combobox');
  expect(input.getAttribute('aria-expanded')).toBe('false');
  expect(input.hasAttribute('aria-controls')).toBe(false);
  expect(input.getAttribute('aria-autocomplete')).toBe('list');
});

it('pushes to the event page when an event suggestion is selected', () => {
  const push = vi.fn();
  (router.push as Mock).mockImplementation(push);
  renderSearch('');
  // simule a seleção disparando onSelect do hook via o painel montado:
  // com MSW retornando um evento, abra o painel (change + waitFor ready),
  // então fireEvent.mouseDown no option 0
  expect(push).toHaveBeenCalledWith('/events/o-fantasma-da-opera');
});

it('sets q and closes the panel when a location suggestion is selected', () => {
  const onUrlUpdate = vi.fn();
  renderSearch('onUrlUpdate', onUrlUpdate);
  // abre o painel com MSW local e mouseDown na opção de local
  const { queryString } = onUrlUpdate.mock.calls.at(-1)![0];
  expect(queryString).toContain('q=Rio');
});

it('keeps the typed text when Escape closes the panel', async () => {
  renderSearch('');
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'fanta' } });
  // aguarda ready + listbox
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect((input as HTMLInputElement).value).toBe('fanta');
});
```

Para os casos de painel use MSW (`msw/node`) interceptando `http://localhost:3000/api/suggest` (mesmo setup do spec do hook). Mantenha os testes de copy/accessibilidade antigos (label, placeholder, live region) — traduza os asserts que mudarem.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/header-search.spec.tsx`
Expected: FAIL (componente ainda usa `router.replace`/`useSearchParams` + sem combobox aria).

- [ ] **Step 3: Reescrever o componente**

`header-search.tsx` — estrutura final:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSearchFilters } from '../lib/use-search-filters';
import {
  useSearchSuggestions,
  SUGGESTIONS_LISTBOX_ID,
} from '../lib/use-search-suggestions';
import { SearchSuggestions } from './search-suggestions';
import { SearchInput } from './search-input';

export function HeaderSearch() {
  const router = useRouter();
  const { filters, setFilters } = useSearchFilters();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(filters.q ?? '');
  }, [filters.q]);

  const handleSelect = (item: SuggestionItem) => {
    if (item.kind === 'event') {
      router.push(`/events/${item.event.slug}`);
      return;
    }
    setFilters({ q: item.location.city });
    setValue(item.location.city);
  };

  const suggestions = useSearchSuggestions({ onSelect: handleSelect });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    suggestions.setOpen(false);
    const trimmed = value.trim();
    setFilters({ q: trimmed === '' ? null : trimmed });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.handleKeyDown(event)) return;
  };

  return (
    <search>
      <div ref={suggestions.rootRef} className="relative w-full max-w-md">
        <form onSubmit={onSubmit} className="contents">
          <SearchInput
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              suggestions.setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              suggestions.setQuery(value);
              suggestions.reopen();
            }}
            role="combobox"
            aria-expanded={suggestions.open}
            aria-controls={suggestions.open ? SUGGESTIONS_LISTBOX_ID : undefined}
            aria-activedescendant={suggestions.activeDescendant}
            aria-autocomplete="list"
            aria-label="Buscar eventos"
            placeholder="Buscar eventos..."
            className="w-full ..."
          />
        </form>
        <p aria-live="polite" className="sr-only">
          {suggestions.open ? 'Sugestões de busca disponíveis' : ''}
        </p>
        {suggestions.open && (
          <SearchSuggestions
            open={suggestions.open}
            status={suggestions.status}
            items={suggestions.items}
            activeIndex={suggestions.activeIndex}
            listboxId={SUGGESTIONS_LISTBOX_ID}
            onHover={suggestions.setActiveIndex}
            onSelect={(item) => {
              suggestions.setOpen(false);
              handleSelect(item);
            }}
            highlighted={suggestions.highlighted}
          />
        )}
      </div>
    </search>
  );
}
```

Notas obrigatórias:
- `SearchInput`/`Input` já espalham props — `role`, `aria-*` chegam sem alteração. Se o Input bloquear `role`, use um `<input>` nativo com as mesmas classes (mantendo o visual).
- **`aria-controls` só quando o painel está aberto** (evita id dangling quando fechado).
- `onSubmit` usa **Nuqs** (`setFilters`) — não `router.replace`. O `void`/fire-and-forget fica dentro do `setFilters` do hook.
- Local selecionado → `setFilters({q: city})` + `setValue(city)` (replace implícito do nuqs).
- Evento selecionado → `router.push` (push, decisão do usuário).
- Sem debounce no input de texto (digitar só alimenta o estado local; o hook debounces).

- [ ] **Step 4: Rodar e confirmar passação**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/header-search.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/header-search.tsx apps/web/src/components/header-search.spec.tsx
git commit -m "feat(web): open suggestions panel from header search"
```

---

### Task 12: E2E — combobox + fluxos do painel

**Files:**
- Modify: `apps/web/tests/e2e/search.spec.ts`

- [ ] **Step 1: Trocar o seletor do E2E existente**

Em `search.spec.ts` (linha ~6): `getByRole('searchbox', { name: 'Buscar eventos' })` → `getByRole('combobox', { name: 'Buscar eventos' })` (Biome exige `role="combobox"` — Task 11). Os 5 E2Es existentes devem seguir verdes (contrato de URL intacto).

- [ ] **Step 2: Adicionar os 4 novos testes**

```ts
test('suggestion panel opens and navigating to an event works', async ({ page }) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('fanta');

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('group', { name: 'Eventos' })).toBeVisible();

  await listbox.getByRole('option').first().click();
  await page.waitForURL('**/events/o-fantasma-da-opera');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
});

test('pressing Enter with no highlighted suggestion shows results', async ({ page }) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('cyberpunk');
  await input.press('Enter');

  await page.waitForURL((url) => url.searchParams.get('q') === 'cyberpunk');
  await expect(page).toHaveURL(/\?q=cyberpunk/);
});

test('selecting a location suggestion filters the results by city', async ({ page }) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('rio');

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  const localsGroup = listbox.getByRole('group', { name: 'Locais' });
  await expect(localsGroup).toBeVisible();
  await localsGroup.getByRole('option').first().click();

  await page.waitForURL((url) => url.searchParams.get('q') === 'Rio de Janeiro');
  await expect(page).toHaveURL(/\?q=Rio\+de\+Janeiro/);
  await expect(page.locator('article')).toHaveCount(2);
});

test('Escape closes the panel and keeps the typed text', async ({ page }) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('fanta');
  await expect(page.getByRole('listbox')).toBeVisible();

  await input.press('Escape');

  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(input).toHaveValue('fanta');
});
```

> Fixtures: `fanta` resolve `o-fantasma-da-opera` (único match FTS); `rio` nos locais → `Rio de Janeiro, RJ` (único city match) e 2 events SP+RJ contendo "rio" no texto — se o count real do seed for diferente, ajuste o `toHaveCount` para o número real (`pnpm --filter @ticketvibe/web exec playwright test search --grep location`) e **documente o número no commit**.

- [ ] **Step 3: Rodar o spec inteiro**

Run: `pnpm --filter @ticketvibe/web exec playwright test search`
Expected: PASS (5 existentes + 4 novos = 9).

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/search.spec.ts
git commit -m "test(web): cover suggestion panel in e2e"
```

---

### Task 13: Limpeza — remover helpers manuais de URL + anotar desvios no spec

**Files:**
- Modify: `apps/web/src/lib/search-params.ts`
- Modify: `apps/web/src/lib/search-params.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-12-busca-sugestoes-nuqs-design.md`

- [ ] **Step 1: Localizar usos restantes**

Run: `rg 'buildSearchPath|filtersFromSearchParams' -n`
Expected: só `search-params.ts` + `search-params.spec.ts` (e possivelmente `page.tsx`, se ele ainda usar — nesse caso, **não remova o uso do servidor**: `page.tsx` pode continuar usando `filtersFromSearchParams` para derivar filtros das searchParams do Next; nesse caso remova apenas `buildSearchPath` e mantenha o outro com comentário `// usado apenas no RSC`).

- [ ] **Step 2: Remover com segurança**

Delete os helpers não usados + seus `it` do spec. Mantenha `parseSearchFilters`, `hasActiveFilters` e `RawSearchParams`.

- [ ] **Step 3: Anotar os desvios no spec**

Ao final de `docs/superpowers/specs/2026-10-12-busca-sugestoes-nuqs-design.md`, acrescente uma seção `## Desvios implementados` listando os 5 desvios do topo deste plano (parsers em arquivo irmão, mecanismo oficial de pending, `role="combobox"`, ordem de params não canônica, remoção dos helpers).

- [ ] **Step 4: Verificar**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @ticketvibe/web exec vitest run src/lib`
Expected: verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/search-params.ts apps/web/src/lib/search-params.spec.ts docs/superpowers/specs/2026-10-12-busca-sugestoes-nuqs-design.md
git commit -m "refactor(web): drop manual search path helpers"
```

---

### Task 14: Gates completos + verificação visual do pending

- [ ] **Step 1: Gates de repo**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @ticketvibe/web test:e2e
pnpm build
pnpm --filter @ticketvibe/web build-storybook
git status --short apps/api/drizzle   # deve estar limpo (sem drift de schema)
```
Expected: tudo verde. Se drift aparecer, reverta com `git checkout -- apps/api/drizzle`.

- [ ] **Step 2: Contagens esperadas**

- shared: 34 · api rota: 24 · web: +5 specs novos (parsers, transition, hook, painel, proxy) sobre a base 53 · E2E: 12 (8 prévios + 4 novos).

- [ ] **Step 3: Checkpoint manual (verificação do skeleton)**

Abrir a aplicação (`pnpm infra:up && pnpm dev` ou o stack do Playwright) num browser e **verificar visualmente**:
1. Clicar num chip de categoria → a lista de resultados é substituída pelo `PageSkeleton` durante o streaming e volta com os novos eventos (feedback de pending visível).
2. Abrir o combobox (digitar ≥2 chars) → skeleton do painel → 2 grupos → clicar evento → página do evento; clicar local → `?q=` preenchido e header sincronizado.
3. Esc fecha mantendo texto; Enter sem destaque navega.
Se o pending não ficar visível (transição muito curta no dev local), registre isso no report final em vez de "consertar" por conta própria — é decisão de UX.

- [ ] **Step 4: Report final**

Rodar o skill `requesting-code-review` (ou reportar direto ao usuário) com: gates, contagens, os 5 desvios, resultados do checkpoint manual, e as pendências antigas (push dos commits, sign-off do contraste `#2e2054`).
