# Ticket 07 — Páginas de Artista e Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O visitante abre `/artists/{slug}` e `/venues/{slug}` e vê todos os eventos do artista/do local, com links navegando a partir da página de evento.

**Architecture:** Nova entidade `artists` + tabela de junção `event_artists` (venues já existem normalizados). Módulos hexagonais `artists` e `venues` na API (GET `/artists/:slug`, GET `/venues/:slug`) espelhando o padrão de `categories`. Contrato Zod em `@ticketvibe/shared`. No web, fetchers server-only + páginas App Router que reusam `EventCard` via componente compartilhado `ProfileEvents`. Página de evento ganha link no nome do local + seção de artistas.

**Tech Stack:** Drizzle ORM (Postgres) · Fastify · Zod (`@ticketvibe/shared`) · Next.js 16 App Router · Vitest (unit + MSW + integração Postgres) · Playwright E2E.

**Repo conventions (do not violate):**
- Commits em inglês, Conventional (`feat(scope): ...`), imperativo, sem ponto. Commit por task.
- Português para textos de UI, docs e mensagens de teste.
- `pnpm --filter @ticketvibe/api …`, `pnpm --filter @ticketvibe/web …`, `pnpm test` na raiz.
- Migrações geradas via `db:generate` (nunca editar SQL existente à mão, exceto quando instruído).
- TDD: escrever teste falhante → ver falhar → implementar → ver passar → commit.

---

## Contexto do codebase (para quem chega agora)

- **Monorepo:** `apps/api` (Fastify + Drizzle), `apps/web` (Next), `packages/shared` (schemas Zod).
- **Schema atual** (`apps/api/src/db/schema.ts`): `categories`, `venues` (slug/name/city/state — **já normalizado**), `events` (FK `venueId`, `categoryId`, `searchVector` tsvector), `sectors`. **Não existe tabela de artistas.**
- **Migrations:** `apps/api/drizzle/`, última `0002_organic_firestar.sql`. Gerar com `pnpm --filter @ticketvibe/api db:generate`; aplicar com `db:migrate`.
- **Seed:** fixtures em `apps/api/src/db/fixtures.ts`, seeder `seed-fixtures.ts` (delete sectors→events→venues→categories, insere, mapeia ids por slug). Rodar: `pnpm --filter @ticketvibe/api db:seed`. **Atenção:** `resetDatabase` em `test-helpers.ts:60` trunca `events, venues, categories` — nova tabela precisa entrar aí.
- **Padrão de módulo API:** `modules/<name>/{domain,infra,routes,use-cases}`. Repositório com implementação Drizzle + InMemory (para testes de rota unitários). Rotas registradas em `app.ts`.
- **Contrato:** `packages/shared/src/index.ts` — `xSchema` + `export type XDto = z.infer<...>`. `eventSchema` embute `venueSchema` (**hoje sem slug**).
- **Web:** fetchers server-only em `apps/web/src/lib/events-api.ts` (`API_URL` default `http://localhost:3001`, `cache:'no-store'`, parse Zod, 404→null). Páginas server components. `EventCard` recebe props prontas via `toEventCardProps` (`lib/event-mapper.ts`). Grid de cards: `components/home/search-results.tsx:49-53`.
- **Página de evento** (`app/events/[slug]/page.tsx` + `components/event-detail.tsx`): venue é **texto plano** (linha 42), artistas não aparecem (não existem no DTO).
- **Testes:** rota unitária usa `InMemory*Repository` + `app.inject`; integração usa `ensureTestDatabase` + `migrateTestDatabase` + `seedFixtures` + Drizzle repos (URL do test DB deve terminar `/ticketvibe_test`); web component RTL; E2E Playwright (`apps/web/tests/e2e/`), global-setup roda `db:seed`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `packages/shared/src/index.ts` | Novos schemas: `artistSchema`, `artistDetailSchema`, `venueDetailSchema`, envelopes; `venueSchema` ganha `slug` |
| `packages/shared/src/index.spec.ts` | Testes dos novos schemas + fixture `validEvent` atualizada |
| `apps/api/src/db/schema.ts` | Tabelas `artists`, `event_artists` |
| `apps/api/drizzle/0003_*.sql` | Migração gerada (auto) |
| `apps/api/src/db/test-helpers.ts` | `resetDatabase` inclui novas tabelas |
| `apps/api/src/db/fixtures.ts` | `artistFixtures`, `eventArtistFixtures` |
| `apps/api/src/db/seed-fixtures.ts` | Insert de artists + junção + delete order |
| `apps/api/src/modules/events/domain/event-entity.ts` | `EventEntity.venueSlug`; `EventDetailEntity.artists` |
| `apps/api/src/modules/events/infra/drizzle-events-repository.ts` | Exporta `eventSelect`/`toEventEntity`; select de artists no `findBySlug` |
| `apps/api/src/modules/events/routes/events.routes.ts` | DTO inclui `venue.slug` e `artists` |
| `apps/api/src/modules/artists/**` | Módulo completo (domain/infra/use-cases/routes) |
| `apps/api/src/modules/venues/**` | Módulo completo |
| `apps/api/src/app.ts` | Registra novas rotas |
| `apps/web/src/lib/profiles-api.ts` | `fetchArtistBySlug`, `fetchVenueBySlug` |
| `apps/web/src/components/profile-events.tsx` | Seção reusável: header + grid de EventCards + vazio |
| `apps/web/src/app/artists/[slug]/page.tsx` | Página de artista |
| `apps/web/src/app/venues/[slug]/page.tsx` | Página de local |
| `apps/web/src/components/event-detail.tsx` | Link no venue + seção de artistas |
| `apps/web/tests/e2e/artist-venue.spec.ts` | E2Es de navegação |

## Decisões travadas (não rediscutir)

1. **Venue já é entidade normalizada** — não criar "local" novo; página de local = detalhe de `venues` + eventos.
2. **Artistas:** tabela `artists` (id, slug unique, name) + junção `event_artists` (event_id, artist_id, unique). Muitos-para-muitos (um artista com vários eventos, um evento com vários artistas).
3. **`slug` entra no `venueSchema`** (obrigatório) para o link evento→local. Isso propaga: entity, DTOs, fixtures de teste web.
4. **Artistas no list/card?** Não. `eventSchema` (listagem) não ganha `artists` — só `eventDetailSchema`. YAGNI.
5. **searchVector não muda** neste ticket (FTS por nome de artista é evolução futura, fora do escopo do 07).
6. **Ordenação dos eventos nas páginas:** `startsAt ASC` (mesmo critério da home).
7. **404:** `artist_not_found` / `venue_not_found` (espelha `event_not_found`); web → `notFound()`.
8. **Estados de erro na web** espelham `EventDetailError` (mensagem + link home).

---

### Task 1: Shared — schemas de artista e local

**Files:**
- Modify: `packages/shared/src/index.ts` (adicionar ao final)
- Test: `packages/shared/src/index.spec.ts`

- [ ] **Step 1: Escrever os testes falhantes**

Adicione ao final de `packages/shared/src/index.spec.ts` (imports no topo: inclua `artistDetailSchema`, `artistDetailResponseSchema`, `venueDetailSchema`, `venueDetailResponseSchema` no import existente de `../src/index`):

```ts
describe('artistDetailSchema', () => {
  const validArtist = {
    slug: 'andrew-lloyd-webber',
    name: 'Andrew Lloyd Webber',
    events: [
      {
        id: '3d8f2f3a-8c1b-4a2e-9c3d-1b2a3c4d5e6f',
        slug: 'o-fantasma-da-opera',
        title: 'O Fantasma da Ópera',
        description: 'Um musical famoso.',
        category: { slug: 'shows', name: 'Shows' },
        venue: { name: 'Teatro Renault', city: 'São Paulo', state: 'SP' },
        startsAt: '2026-10-22T23:00:00.000Z',
        priceFromCents: 12000,
        imageUrl: null,
        badgeLabel: null,
      },
    ],
  };

  it('accepts an artist with events', () => {
    expect(artistDetailSchema.parse(validArtist)).toEqual(validArtist);
  });

  it('accepts an artist with zero events', () => {
    expect(artistDetailSchema.parse({ ...validArtist, events: [] }).events).toEqual([]);
  });

  it('rejects an artist without slug', () => {
    const { slug: _slug, ...withoutSlug } = validArtist;
    expect(artistDetailSchema.safeParse(withoutSlug).success).toBe(false);
  });

  it('rejects an artist with empty name', () => {
    expect(
      artistDetailSchema.safeParse({ ...validArtist, name: '' }).success,
    ).toBe(false);
  });
});

describe('artistDetailResponseSchema', () => {
  it('wraps the artist', () => {
    const payload = {
      artist: {
        slug: 'comediantes-afiados',
        name: 'Comediantes Afiados',
        events: [],
      },
    };
    expect(artistDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('venueDetailSchema', () => {
  const validVenue = {
    slug: 'teatro-renault',
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'SP',
    events: [],
  };

  it('accepts a venue with city and state', () => {
    expect(venueDetailSchema.parse(validVenue)).toEqual(validVenue);
  });

  it('rejects a venue with invalid state', () => {
    expect(
      venueDetailSchema.safeParse({ ...validVenue, state: 'São Paulo' })
        .success,
    ).toBe(false);
  });
});

describe('venueDetailResponseSchema', () => {
  it('wraps the venue', () => {
    const payload = {
      venue: {
        slug: 'vivo-rio',
        name: 'Vivo Rio',
        city: 'Rio de Janeiro',
        state: 'RJ',
        events: [],
      },
    };
    expect(venueDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL — `artistDetailSchema is not defined` (ReferenceError) nos novos describes.

- [ ] **Step 3: Implementar os schemas**

Adicione ao final de `packages/shared/src/index.ts`:

```ts
export const artistSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export type ArtistDto = z.infer<typeof artistSchema>;

export const artistDetailSchema = artistSchema.extend({
  events: z.array(eventSchema),
});

export type ArtistDetailDto = z.infer<typeof artistDetailSchema>;

export const artistDetailResponseSchema = z.object({
  artist: artistDetailSchema,
});

export type ArtistDetailResponse = z.infer<typeof artistDetailResponseSchema>;

export const venueDetailSchema = venueSchema.extend({
  slug: z.string().min(1),
  events: z.array(eventSchema),
});

export type VenueDetailDto = z.infer<typeof venueDetailSchema>;

export const venueDetailResponseSchema = z.object({
  venue: venueDetailSchema,
});

export type VenueDetailResponse = z.infer<typeof venueDetailResponseSchema>;
```

> Nota: `venueSchema` **não** ganha `slug` aqui — isso acontece na Task 3 junto com o DTO do evento (evita quebrar fixtures web no meio do caminho).

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: PASS — todos (34 existentes + 10 novos = 44).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.spec.ts
git commit -m "feat(shared): add artist and venue detail schemas"
```


---

### Task 2: DB — tabelas `artists`/`event_artists`, migração e seed

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/test-helpers.ts:56-62`
- Modify: `apps/api/src/db/fixtures.ts`
- Modify: `apps/api/src/db/seed-fixtures.ts`
- Create: `apps/api/drizzle/0003_*.sql` (gerada pelo drizzle-kit)

- [ ] **Step 1: Escrever o teste falhante do seed (verde = seed completo)**

Crie `apps/api/src/db/seed-fixtures.integration.spec.ts`:

```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type Db, createDb, TEST_DATABASE_URL } from './client.js';
import { artists, eventArtists } from './schema.js';
import { seedFixtures } from './seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from './test-helpers.js';

describe('seedFixtures (postgres integration)', () => {
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  it('seeds artists linked to their events', async () => {
    const artistRows = await testDb.select().from(artists);
    expect(artistRows.map((row) => row.slug).sort()).toEqual([
      'andrew-lloyd-webber',
      'comediantes-afiados',
    ]);

    const linkRows = await testDb
      .select({
        artistSlug: artists.slug,
        eventSlug: sql`(select slug from events where events.id = ${eventArtists.eventId})`.as('event_slug'),
      })
      .from(eventArtists)
      .innerJoin(artists, sql`${eventArtists.artistId} = ${artists.id}`);

    const links = linkRows.map((row) => `${row.artistSlug}:${row.eventSlug}`);
    expect(links.sort()).toEqual([
      'andrew-lloyd-webber:o-fantasma-da-opera',
      'comediantes-afiados:melhor-de-standup-grand-finale',
      'comediantes-afiados:standup-noite-de-verdades',
    ]);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/db/seed-fixtures.integration.spec.ts`
Expected: FAIL — `artists is not defined` (import de `./schema.js`).

- [ ] **Step 3: Implementar schema, resetDatabase, fixtures e seed**

Em `apps/api/src/db/schema.ts`, adicione **antes** de `export const events` (para leitura; ordem de import não importa no JS, mas mantenha venues→artists→events):

```ts
export const artists = pgTable('artists', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const eventArtists = pgTable(
  'event_artists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id),
  },
  (table) => [
    unique('event_artists_event_id_artist_id_unique').on(
      table.eventId,
      table.artistId,
    ),
  ],
);
```

> Como `eventArtists` referencia `events`, declare-o **depois** de `events` no arquivo (TS resolve forward refs, mas Drizzle prefere definição posterior para leitura). Ordem final: categories, venues, artists, events, eventArtists, sectors.

Em `apps/api/src/db/test-helpers.ts`, troque o TRUNCATE:

```ts
  await db.execute(
    sql`TRUNCATE TABLE event_artists, sectors, events, artists, venues, categories RESTART IDENTITY CASCADE`,
  );
```

Em `apps/api/src/db/fixtures.ts`, adicione:

```ts
export interface ArtistFixture {
  slug: string;
  name: string;
}

export interface EventArtistFixture {
  eventSlug: string;
  artistSlug: string;
}
```

E os arrays (após `venueFixtures`):

```ts
export const artistFixtures: ArtistFixture[] = [
  { slug: 'andrew-lloyd-webber', name: 'Andrew Lloyd Webber' },
  { slug: 'comediantes-afiados', name: 'Comediantes Afiados' },
];

export const eventArtistFixtures: EventArtistFixture[] = [
  {
    eventSlug: 'o-fantasma-da-opera',
    artistSlug: 'andrew-lloyd-webber',
  },
  {
    eventSlug: 'standup-noite-de-verdades',
    artistSlug: 'comediantes-afiados',
  },
  {
    eventSlug: 'melhor-de-standup-grand-finale',
    artistSlug: 'comediantes-afiados',
  },
];
```

Em `apps/api/src/db/seed-fixtures.ts`, ajuste imports e o corpo do transaction:

```ts
import {
  artistFixtures,
  categoryFixtures,
  eventArtistFixtures,
  eventFixtures,
  sectorFixtures,
  venueFixtures,
} from './fixtures.js';
import {
  artists,
  categories,
  eventArtists,
  events,
  sectors,
  venues,
} from './schema.js';
```

Delete order no início do transaction (antes de categories):

```ts
    await tx.delete(sectors);
    await tx.delete(eventArtists);
    await tx.delete(events);
    await tx.delete(artists);
    await tx.delete(venues);
    await tx.delete(categories);
```

Após o loop de eventos (`eventIds` preenchido) e **antes** do insert de sectors, adicione o insert da junção:

```ts
    const insertedArtists = await tx.insert(artists).values(artistFixtures).returning();
    const artistIds = new Map(insertedArtists.map((row) => [row.slug, row.id]));

    const eventArtistValues = eventArtistFixtures.map((fixture) => {
      const eventId = eventIds.get(fixture.eventSlug);
      const artistId = artistIds.get(fixture.artistSlug);
      if (!eventId || !artistId) {
        throw new Error(
          `Missing event or artist for link "${fixture.eventSlug}"→"${fixture.artistSlug}"`,
        );
      }
      return { eventId, artistId };
    });
    await tx.insert(eventArtists).values(eventArtistValues);
```

- [ ] **Step 4: Gerar migração, aplicar e rodar seed**

```bash
pnpm infra:up   # postgres rodando
pnpm --filter @ticketvibe/api db:generate   # cria 0003_*.sql — NÃO edite à mão
pnpm --filter @ticketvibe/api db:migrate
pnpm --filter @ticketvibe/api db:seed
```

Expected: migração 0003 criada com `CREATE TABLE "artists"` + `CREATE TABLE "event_artists"` (+ unique + FKs); seed termina sem erro.

Verificação manual (opcional mas recomendada):

```bash
curl -s http://localhost:3001/health
```

- [ ] **Step 5: Rodar o teste do seed**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/db/seed-fixtures.integration.spec.ts`
Expected: PASS (2 artistas, 3 links).

- [ ] **Step 6: Rodar suíte api inteira (garante que reset/seed existentes não quebraram)**

Run: `pnpm --filter @ticketvibe/api test`
Expected: PASS — todos os testes antigos + o novo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db apps/api/drizzle
git commit -m "feat(api): add artists and event_artists tables with seed fixtures"
```


---

### Task 3: Events — `venueSlug`, artists no detalhe, `venue.slug` no DTO

Esta task expande o contrato do evento: `venueSchema` ganha `slug` (link evento→local) e `eventDetailSchema` ganha `artists` (seção na página). O diff toca fixtures de teste em 3 pacotes — é esperado e deve ser feito **antes** da implementação (red → green).

**Files:**
- Modify: `packages/shared/src/index.ts:14-18` (`venueSchema`)
- Modify: `packages/shared/src/index.spec.ts` (fixture `validEvent`)
- Modify: `apps/api/src/modules/events/domain/event-entity.ts`
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.spec.ts` (3 stubs)
- Modify: `apps/api/src/modules/events/use-cases/{list-events,get-event-detail,suggest-events}.use-case*.spec.ts` (fixtures EventEntity)
- Modify: web specs que montam `venue: {...}`: `apps/web/src/components/event-detail.spec.tsx`, `apps/web/src/components/home/search-results.spec.tsx`, `apps/web/src/lib/event-mapper.spec.ts`, `apps/web/src/lib/events-api.spec.ts`

- [ ] **Step 1: Atualizar fixtures de teste (fica vermelho)**

a) `packages/shared/src/index.spec.ts` — na fixture `validEvent` (linha ~34) troque:

```ts
  venue: { name: 'Audio Club', city: 'São Paulo', state: 'SP' },
```

por:

```ts
  venue: { slug: 'audio-club', name: 'Audio Club', city: 'São Paulo', state: 'SP' },
```

> Se houver outras ocorrências de `venue: {` no mesmo arquivo (ex.: testes de `eventDetailSchema`), adicione `slug` da mesma forma com slug coerente (`'teatro-renault'`, `'audio-club'`…).

b) Nos 4 specs web listados acima, procure cada `venue: { name: ..., city: ..., state: ... }` e adicione `slug` como primeiro campo. Slug plausível por fixture: `'teatro-renault'` (event-detail.spec), `'audio-club'` (events-api.spec), e nos demais use o mesmo nome do venue slugificado em kebab-case.

c) `apps/api/src/modules/events/routes/events.routes.spec.ts` — cada um dos 3 stubs (`EventDetailEntity[]`) ganha os campos novos. Ex. para o stub com `venueName: 'Arena Central'`:

```ts
    venueSlug: 'arena-central',
    ...
    artists: [{ slug: 'banda-exemplo', name: 'Banda Exemplo' }],
```

Aplique o mesmo padrão aos outros dois (`Teatro Municipal` → `venueSlug: 'teatro-municipal'`, `Parque Central` → `venueSlug: 'parque-central'`), com `artists: []` onde não fizer sentido artista, exceto um dos stubs que deve ter 1 artista para exercitar o DTO. **Todos os stubs de `EventEntity`/`EventDetailEntity` nos use-case specs** (`list-events.use-case.spec.ts`, `get-event-detail.use-case.spec.ts`, `suggest-events.use-case.spec.ts`) ganham `venueSlug: '<kebab-do-venueName>'`; `get-event-detail.use-case.spec.ts` também ganha `artists: []`.

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/shared test && pnpm --filter @ticketvibe/api exec vitest run && pnpm --filter @ticketvibe/web exec vitest run`
Expected: FAIL — TypeScript/expects reclamando: `venue.slug` ausente nos DTOs (API ainda não manda), `artists` ausente no entity.

- [ ] **Step 3: Implementar**

`packages/shared/src/index.ts` — `venueSchema` vira:

```ts
export const venueSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
});
```

`eventDetailSchema` (linha ~82) vira:

```ts
export const eventDetailSchema = eventSchema.extend({
  sectors: z.array(sectorSchema),
  artists: z.array(artistSchema),
});
```

`apps/api/src/modules/events/domain/event-entity.ts`:

```ts
export interface EventEntity {
  id: string;
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  venueSlug: string;
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

export interface ArtistRefEntity {
  slug: string;
  name: string;
}

export interface EventDetailEntity extends EventEntity {
  sectors: SectorEntity[];
  artists: ArtistRefEntity[];
}
```

`apps/api/src/modules/events/infra/drizzle-events-repository.ts`:

- No objeto `eventSelect`, dentro do sub-objeto `venues`, adicione `slug: venues.slug` como primeiro campo; no `EventRow` correspondente, `venues: { slug: string; name: string; city: string; state: string }`.
- Em `toEventEntity`, adicione `venueSlug: row.venues.slug,` antes de `venueName`.
- Troque a declaração `const eventSelect = {` para `export const eventSelect = {` e `function toEventEntity` para `export function toEventEntity` (será reusado pelos módulos artists/venues nas Tasks 4–5).
- Em `findBySlug`, após carregar os setores, carregue os artistas:

```ts
    const artistRows = await this.db
      .select({ slug: artists.slug, name: artists.name })
      .from(eventArtists)
      .innerJoin(artists, eq(eventArtists.artistId, artists.id))
      .where(eq(eventArtists.eventId, row.events.id))
      .orderBy(asc(artists.name), asc(artists.slug));
```

(importe `artists, eventArtists` de `../../../db/schema.js` e `eq` já está importado.) Retorne no objeto final: `artists: artistRows,` (além de `sectors`).

`apps/api/src/modules/events/routes/events.routes.ts` — em `toEventDto`:

```ts
    venue: {
      slug: entity.venueSlug,
      name: entity.venueName,
      city: entity.venueCity,
      state: entity.venueState,
    },
```

em `toEventDetailDto`:

```ts
    artists: entity.artists.map((artist) => ({
      slug: artist.slug,
      name: artist.name,
    })),
```

`apps/api/src/modules/events/infra/in-memory-events-repository.ts` — `findBySlug` já faz spread `...item`, então `artists` flui sem mudança.

- [ ] **Step 4: Rodar tudo e ver passar**

```bash
pnpm --filter @ticketvibe/shared test
pnpm --filter @ticketvibe/api exec vitest run
pnpm --filter @ticketvibe/web exec vitest run
pnpm typecheck
```

Expected: PASS em todos. Se algum spec web ainda reclamar de `slug` ausente, complete a fixture.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/api apps/web
git commit -m "feat(api): expose venue slug and artists on event detail"
```


---

### Task 4: API — módulo `artists` (`GET /artists/:slug`)

**Files:**
- Create: `apps/api/src/modules/artists/domain/artist-entity.ts`
- Create: `apps/api/src/modules/artists/domain/artists-repository.ts`
- Create: `apps/api/src/modules/artists/infra/drizzle-artists-repository.ts`
- Create: `apps/api/src/modules/artists/infra/in-memory-artists-repository.ts`
- Create: `apps/api/src/modules/artists/use-cases/get-artist-detail.use-case.ts`
- Create: `apps/api/src/modules/artists/routes/artists.routes.ts`
- Create: `apps/api/src/modules/artists/routes/artists.routes.spec.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever o teste de rota falhante**

`apps/api/src/modules/artists/routes/artists.routes.spec.ts`:

```ts
import { artistDetailResponseSchema } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import { InMemoryArtistsRepository } from '../infra/in-memory-artists-repository.js';

const stubEvents: EventDetailEntity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'standup-noite-de-verdades',
    title: 'Stand-up: Noite de Verdades',
    description: 'Uma noite de piadas.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueSlug: 'espaco-unimed',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-11-06T00:00:00.000Z'),
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
    artists: [{ slug: 'comediantes-afiados', name: 'Comediantes Afiados' }],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'melhor-de-standup-grand-finale',
    title: 'Melhor de Stand-up: Grand Finale',
    description: 'A grande final.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueSlug: 'espaco-unimed',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-12-13T00:00:00.000Z'),
    priceFromCents: 11000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
    artists: [{ slug: 'comediantes-afiados', name: 'Comediantes Afiados' }],
  },
];

describe('GET /artists/:slug', () => {
  it('returns the artist with their events sorted by date', async () => {
    const app = buildApp({
      artistsRepository: new InMemoryArtistsRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/artists/comediantes-afiados',
    });

    expect(response.statusCode).toBe(200);
    const body = artistDetailResponseSchema.parse(response.json());
    expect(body.artist.slug).toBe('comediantes-afiados');
    expect(body.artist.name).toBe('Comediantes Afiados');
    expect(body.artist.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'melhor-de-standup-grand-finale',
    ]);
    await app.close();
  });

  it('returns 404 artist_not_found for unknown slug', async () => {
    const app = buildApp({
      artistsRepository: new InMemoryArtistsRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/artists/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'artist_not_found' });
    await app.close();
  });
});
```

> O `InMemoryArtistsRepository` recebe os **eventos** (cada um com `artists[]`) e deriva o artista pelo slug — simplifica o stub. Nome/começo do construtor: `new InMemoryArtistsRepository(stubEvents)`.

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/artists`
Expected: FAIL — `InMemoryArtistsRepository`/`artistsRepository` não existem; `buildApp` sem opção `artistsRepository`.

- [ ] **Step 3: Implementar o módulo**

`domain/artist-entity.ts`:

```ts
import type { EventEntity } from '../../events/domain/event-entity.js';

export interface ArtistDetailEntity {
  slug: string;
  name: string;
  events: EventEntity[];
}
```

`domain/artists-repository.ts`:

```ts
import type { ArtistDetailEntity } from './artist-entity.js';

export interface ArtistsRepository {
  findBySlug(slug: string): Promise<ArtistDetailEntity | null>;
}
```

`infra/in-memory-artists-repository.ts`:

```ts
import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';

export class InMemoryArtistsRepository implements ArtistsRepository {
  constructor(private readonly items: EventDetailEntity[]) {}

  findBySlug(slug: string): Promise<ArtistDetailEntity | null> {
    const withArtist = this.items.filter((item) =>
      item.artists.some((artist) => artist.slug === slug),
    );
    if (withArtist.length === 0) {
      return Promise.resolve(null);
    }
    const name =
      withArtist[0].artists.find((artist) => artist.slug === slug)?.name ??
      slug;
    const events = [...withArtist].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    return Promise.resolve({ slug, name, events });
  }
}
```

`infra/drizzle-artists-repository.ts`:

```ts
import { asc, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { artists, eventArtists } from '../../../db/schema.js';
import { eventSelect, toEventEntity } from '../../events/infra/drizzle-events-repository.js';
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';

export class DrizzleArtistsRepository implements ArtistsRepository {
  constructor(private readonly db: Db) {}

  async findBySlug(slug: string): Promise<ArtistDetailEntity | null> {
    const [artistRow] = await this.db
      .select({ slug: artists.slug, name: artists.name })
      .from(artists)
      .where(eq(artists.slug, slug))
      .limit(1);

    if (!artistRow) return null;

    const eventRows = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .innerJoin(eventArtists, eq(eventArtists.eventId, events.id))
      .innerJoin(artists, eq(eventArtists.artistId, artists.id))
      .where(eq(artists.slug, slug))
      .orderBy(asc(events.startsAt), asc(events.id));

    return {
      slug: artistRow.slug,
      name: artistRow.name,
      events: eventRows.map(toEventEntity),
    };
  }
}
```

> Importe também `categories, events, venues` de `'../../../db/schema.js'`.

`use-cases/get-artist-detail.use-case.ts`:

```ts
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';

export class GetArtistDetailUseCase {
  constructor(private readonly artistsRepository: ArtistsRepository) {}

  execute(slug: string): Promise<ArtistDetailEntity | null> {
    return this.artistsRepository.findBySlug(slug);
  }
}
```

`routes/artists.routes.ts`:

```ts
import { type ArtistDetailDto, type ArtistDetailResponse } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';
import { GetArtistDetailUseCase } from '../use-cases/get-artist-detail.use-case.js';
import type { EventEntity } from '../../events/domain/event-entity.js';
import type { EventDto } from '@ticketvibe/shared';

function toEventDto(entity: EventEntity): EventDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    category: { slug: entity.categorySlug, name: entity.categoryName },
    venue: {
      slug: entity.venueSlug,
      name: entity.venueName,
      city: entity.venueCity,
      state: entity.venueState,
    },
    startsAt: entity.startsAt.toISOString(),
    priceFromCents: entity.priceFromCents,
    imageUrl: entity.imageUrl,
    badgeLabel: entity.badgeLabel,
  };
}

function toArtistDetailDto(entity: ArtistDetailEntity): ArtistDetailDto {
  return {
    slug: entity.slug,
    name: entity.name,
    events: entity.events.map(toEventDto),
  };
}

export function registerArtistRoutes(
  app: FastifyInstance,
  artistsRepository: ArtistsRepository,
): void {
  const detailUseCase = new GetArtistDetailUseCase(artistsRepository);

  app.get<{ Params: { slug: string } }>(
    '/artists/:slug',
    async (request, reply) => {
      const artist = await detailUseCase.execute(request.params.slug);
      if (!artist) {
        return reply.code(404).send({ error: 'artist_not_found' });
      }
      const payload: ArtistDetailResponse = { artist: toArtistDetailDto(artist) };
      return reply.send(payload);
    },
  );
}
```

> Nota: o mapper `toEventDto` aqui **duplica** o de `events.routes.ts`. Não abstraia agora (YAGNI); se a duplicação incomodar em revisão, extrair para `modules/events/routes/to-event-dto.ts` é refactor aceitável.

`apps/api/src/app.ts` — adicione imports e opções:

```ts
import type { ArtistsRepository } from './modules/artists/domain/artists-repository.js';
import { DrizzleArtistsRepository } from './modules/artists/infra/drizzle-artists-repository.js';
import { registerArtistRoutes } from './modules/artists/routes/artists.routes.js';
```

No `buildApp`, após os repositories existentes:

```ts
  const artistsRepository =
    options.artistsRepository ?? new DrizzleArtistsRepository(getDefaultDb());
```

E registre **antes** do health (após as rotas existentes):

```ts
  registerArtistRoutes(app, artistsRepository);
```

Adicione `artistsRepository?: ArtistsRepository;` ao tipo do options.

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/artists && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS (2 testes) e tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/artists apps/api/src/app.ts
git commit -m "feat(api): expose GET /artists/:slug with events"
```


---

### Task 5: API — módulo `venues` (`GET /venues/:slug`)

**Files:**
- Create: `apps/api/src/modules/venues/domain/venue-entity.ts`
- Create: `apps/api/src/modules/venues/domain/venues-repository.ts`
- Create: `apps/api/src/modules/venues/infra/drizzle-venues-repository.ts`
- Create: `apps/api/src/modules/venues/infra/in-memory-venues-repository.ts`
- Create: `apps/api/src/modules/venues/use-cases/get-venue-detail.use-case.ts`
- Create: `apps/api/src/modules/venues/routes/venues.routes.ts`
- Create: `apps/api/src/modules/venues/routes/venues.routes.spec.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever o teste de rota falhante**

`apps/api/src/modules/venues/routes/venues.routes.spec.ts`:

```ts
import { venueDetailResponseSchema } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import { InMemoryVenuesRepository } from '../infra/in-memory-venues-repository.js';

const stubEvents: EventDetailEntity[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'o-fantasma-da-opera',
    title: 'O Fantasma da Ópera',
    description: 'Um musical famoso.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueSlug: 'teatro-renault',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-23T00:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: true,
    isHot: true,
    sectors: [],
    artists: [],
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    slug: 'a-hora-e-a-vez',
    title: 'A Hora é a Vez',
    description: 'Comédia dramática.',
    categorySlug: 'teatro',
    categoryName: 'Teatro',
    venueSlug: 'teatro-renault',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-12-19T00:00:00.000Z'),
    priceFromCents: 14000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: false,
    sectors: [],
    artists: [],
  },
];

describe('GET /venues/:slug', () => {
  it('returns the venue with their events sorted by date', async () => {
    const app = buildApp({
      venuesRepository: new InMemoryVenuesRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/venues/teatro-renault',
    });

    expect(response.statusCode).toBe(200);
    const body = venueDetailResponseSchema.parse(response.json());
    expect(body.venue).toMatchObject({
      slug: 'teatro-renault',
      name: 'Teatro Renault',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(body.venue.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'a-hora-e-a-vez',
    ]);
    await app.close();
  });

  it('returns 404 venue_not_found for unknown slug', async () => {
    const app = buildApp({
      venuesRepository: new InMemoryVenuesRepository(stubEvents),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/venues/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'venue_not_found' });
    await app.close();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/venues`
Expected: FAIL — `InMemoryVenuesRepository`/`venuesRepository` não existem.

- [ ] **Step 3: Implementar o módulo**

`domain/venue-entity.ts`:

```ts
import type { EventEntity } from '../../events/domain/event-entity.js';

export interface VenueDetailEntity {
  slug: string;
  name: string;
  city: string;
  state: string;
  events: EventEntity[];
}
```

`domain/venues-repository.ts`:

```ts
import type { VenueDetailEntity } from './venue-entity.js';

export interface VenuesRepository {
  findBySlug(slug: string): Promise<VenueDetailEntity | null>;
}
```

`infra/in-memory-venues-repository.ts`:

```ts
import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';

export class InMemoryVenuesRepository implements VenuesRepository {
  constructor(private readonly items: EventDetailEntity[]) {}

  findBySlug(slug: string): Promise<VenueDetailEntity | null> {
    const matching = this.items.filter((item) => item.venueSlug === slug);
    if (matching.length === 0) {
      return Promise.resolve(null);
    }
    const first = matching[0];
    const events = [...matching].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    return Promise.resolve({
      slug,
      name: first.venueName,
      city: first.venueCity,
      state: first.venueState,
      events,
    });
  }
}
```

`infra/drizzle-venues-repository.ts`:

```ts
import { asc, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories, events, venues } from '../../../db/schema.js';
import {
  eventSelect,
  toEventEntity,
} from '../../events/infra/drizzle-events-repository.js';
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';

export class DrizzleVenuesRepository implements VenuesRepository {
  constructor(private readonly db: Db) {}

  async findBySlug(slug: string): Promise<VenueDetailEntity | null> {
    const [venueRow] = await this.db
      .select({
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      })
      .from(venues)
      .where(eq(venues.slug, slug))
      .limit(1);

    if (!venueRow) return null;

    const eventRows = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(eq(venues.slug, slug))
      .orderBy(asc(events.startsAt), asc(events.id));

    return {
      ...venueRow,
      events: eventRows.map(toEventEntity),
    };
  }
}
```

`use-cases/get-venue-detail.use-case.ts`:

```ts
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';

export class GetVenueDetailUseCase {
  constructor(private readonly venuesRepository: VenuesRepository) {}

  execute(slug: string): Promise<VenueDetailEntity | null> {
    return this.venuesRepository.findBySlug(slug);
  }
}
```

`routes/venues.routes.ts`:

```ts
import type { EventDto, VenueDetailDto, VenueDetailResponse } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { EventEntity } from '../../events/domain/event-entity.js';
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';
import { GetVenueDetailUseCase } from '../use-cases/get-venue-detail.use-case.js';

function toEventDto(entity: EventEntity): EventDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    category: { slug: entity.categorySlug, name: entity.categoryName },
    venue: {
      slug: entity.venueSlug,
      name: entity.venueName,
      city: entity.venueCity,
      state: entity.venueState,
    },
    startsAt: entity.startsAt.toISOString(),
    priceFromCents: entity.priceFromCents,
    imageUrl: entity.imageUrl,
    badgeLabel: entity.badgeLabel,
  };
}

function toVenueDetailDto(entity: VenueDetailEntity): VenueDetailDto {
  return {
    slug: entity.slug,
    name: entity.name,
    city: entity.city,
    state: entity.state,
    events: entity.events.map(toEventDto),
  };
}

export function registerVenueRoutes(
  app: FastifyInstance,
  venuesRepository: VenuesRepository,
): void {
  const detailUseCase = new GetVenueDetailUseCase(venuesRepository);

  app.get<{ Params: { slug: string } }>(
    '/venues/:slug',
    async (request, reply) => {
      const venue = await detailUseCase.execute(request.params.slug);
      if (!venue) {
        return reply.code(404).send({ error: 'venue_not_found' });
      }
      const payload: VenueDetailResponse = { venue: toVenueDetailDto(venue) };
      return reply.send(payload);
    },
  );
}
```

`apps/api/src/app.ts` — mesmos 3 pontos da Task 4:

```ts
import type { VenuesRepository } from './modules/venues/domain/venues-repository.js';
import { DrizzleVenuesRepository } from './modules/venues/infra/drizzle-venues-repository.js';
import { registerVenueRoutes } from './modules/venues/routes/venues.routes.js';
```

```ts
  const venuesRepository =
    options.venuesRepository ?? new DrizzleVenuesRepository(getDefaultDb());
```

```ts
  registerVenueRoutes(app, venuesRepository);
```

E `venuesRepository?: VenuesRepository;` no options.

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/venues && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS (2 testes) e tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/venues apps/api/src/app.ts
git commit -m "feat(api): expose GET /venues/:slug with events"
```


---

### Task 6: API — testes de integração Postgres de artist e venue

**Files:**
- Create: `apps/api/src/modules/artists/routes/artists.routes.integration.spec.ts`
- Create: `apps/api/src/modules/venues/routes/venues.routes.integration.spec.ts`

- [ ] **Step 1: Escrever os testes falhantes**

`apps/api/src/modules/artists/routes/artists.routes.integration.spec.ts`:

```ts
import { artistDetailResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleArtistsRepository } from '../infra/drizzle-artists-repository.js';
import { DrizzleEventsRepository } from '../../events/infra/drizzle-events-repository.js';
import { DrizzleCategoriesRepository } from '../../categories/infra/drizzle-categories-repository.js';

describe('GET /artists/:slug (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
      artistsRepository: new DrizzleArtistsRepository(testDb),
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

  it('returns the seeded artist with their events in date order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/artists/comediantes-afiados',
    });

    expect(response.statusCode).toBe(200);
    const body = artistDetailResponseSchema.parse(response.json());
    expect(body.artist.name).toBe('Comediantes Afiados');
    expect(body.artist.events.map((event) => event.slug)).toEqual([
      'standup-noite-de-verdades',
      'melhor-de-standup-grand-finale',
    ]);
  });

  it('returns 404 for an artist that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/artists/desconhecido',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'artist_not_found' });
  });
});
```

`apps/api/src/modules/venues/routes/venues.routes.integration.spec.ts`:

```ts
import { venueDetailResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleVenuesRepository } from '../infra/drizzle-venues-repository.js';
import { DrizzleEventsRepository } from '../../events/infra/drizzle-events-repository.js';
import { DrizzleCategoriesRepository } from '../../categories/infra/drizzle-categories-repository.js';

describe('GET /venues/:slug (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    await seedFixtures(testDb);
    app = buildApp({
      venuesRepository: new DrizzleVenuesRepository(testDb),
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

  it('returns the seeded venue with their events in date order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/venues/teatro-renault',
    });

    expect(response.statusCode).toBe(200);
    const body = venueDetailResponseSchema.parse(response.json());
    expect(body.venue).toMatchObject({
      name: 'Teatro Renault',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(body.venue.events.map((event) => event.slug)).toEqual([
      'o-fantasma-da-opera',
      'pequeno-principe-musical',
      'a-hora-e-a-vez',
    ]);
  });

  it('returns 404 for a venue that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/venues/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'venue_not_found' });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar/passar conforme esperado**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/api exec vitest run src/modules/artists/routes/artists.routes.integration.spec.ts src/modules/venues/routes/venues.routes.integration.spec.ts
```

Expected: se a implementação das Tasks 4–5 está correta contra o seed real, PASS (4 testes). Se falhar por ordem/quantidade de eventos, corrija o **código** (não o seed) — a ordem esperada é a data real dos fixtures.

- [ ] **Step 3: Suíte api completa**

Run: `pnpm --filter @ticketvibe/api test`
Expected: PASS — todos (61 existentes + novos).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/artists apps/api/src/modules/venues
git commit -m "test(api): cover artist and venue routes with postgres"
```

---

### Task 7: Web — fetchers `fetchArtistBySlug` / `fetchVenueBySlug`

**Files:**
- Create: `apps/web/src/lib/profiles-api.ts`
- Create: `apps/web/src/lib/profiles-api.spec.ts`

- [ ] **Step 1: Escrever o teste falhante (MSW)**

`apps/web/src/lib/profiles-api.spec.ts`:

```ts
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { fetchArtistBySlug, fetchVenueBySlug } from './profiles-api';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchArtistBySlug', () => {
  it('returns the artist payload parsed by zod', async () => {
    server.use(
      http.get('http://localhost:3001/artists/andrew-lloyd-webber', () =>
        HttpResponse.json({
          artist: {
            slug: 'andrew-lloyd-webber',
            name: 'Andrew Lloyd Webber',
            events: [],
          },
        }),
      ),
    );

    const result = await fetchArtistBySlug('andrew-lloyd-webber');

    expect(result).toEqual({
      slug: 'andrew-lloyd-webber',
      name: 'Andrew Lloyd Webber',
      events: [],
    });
  });

  it('returns null on 404', async () => {
    server.use(
      http.get('http://localhost:3001/artists/desconhecido', () =>
        HttpResponse.json({ error: 'artist_not_found' }, { status: 404 }),
      ),
    );

    expect(await fetchArtistBySlug('desconhecido')).toBeNull();
  });

  it('throws on unexpected status', async () => {
    server.use(
      http.get('http://localhost:3001/artists/boom', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    await expect(fetchArtistBySlug('boom')).rejects.toThrow();
  });
});

describe('fetchVenueBySlug', () => {
  it('returns the venue payload parsed by zod', async () => {
    server.use(
      http.get('http://localhost:3001/venues/teatro-renault', () =>
        HttpResponse.json({
          venue: {
            slug: 'teatro-renault',
            name: 'Teatro Renault',
            city: 'São Paulo',
            state: 'SP',
            events: [],
          },
        }),
      ),
    );

    expect(await fetchVenueBySlug('teatro-renault')).toEqual({
      slug: 'teatro-renault',
      name: 'Teatro Renault',
      city: 'São Paulo',
      state: 'SP',
      events: [],
    });
  });

  it('returns null on 404', async () => {
    server.use(
      http.get('http://localhost:3001/venues/desconhecido', () =>
        HttpResponse.json({ error: 'venue_not_found' }, { status: 404 }),
      ),
    );

    expect(await fetchVenueBySlug('desconhecido')).toBeNull();
  });
});
```

> Alinhe o import do `server` com o que `apps/web/src/lib/events-api.spec.ts` já usa (copie o setup dele se não houver módulo compartilhado — não crie infra nova).

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/lib/profiles-api.spec.ts`
Expected: FAIL — módulo `./profiles-api` não existe.

- [ ] **Step 3: Implementar**

`apps/web/src/lib/profiles-api.ts`:

```ts
import 'server-only';

import {
  type ArtistDetailDto,
  type VenueDetailDto,
  artistDetailResponseSchema,
  venueDetailResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type { ArtistDetailDto, VenueDetailDto };

export async function fetchArtistBySlug(
  slug: string,
): Promise<ArtistDetailDto | null> {
  try {
    const response = await fetch(
      `${API_URL}/artists/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const payload = artistDetailResponseSchema.parse(await response.json());
    return payload.artist;
  } catch (error) {
    console.error('Failed to fetch artist:', error);
    throw error;
  }
}

export async function fetchVenueBySlug(
  slug: string,
): Promise<VenueDetailDto | null> {
  try {
    const response = await fetch(
      `${API_URL}/venues/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const payload = venueDetailResponseSchema.parse(await response.json());
    return payload.venue;
  } catch (error) {
    console.error('Failed to fetch venue:', error);
    throw error;
  }
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/lib/profiles-api.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/profiles-api.ts apps/web/src/lib/profiles-api.spec.ts
git commit -m "feat(web): add artist and venue fetchers"
```


---

### Task 8: Web — componente `ProfileEvents` + páginas `/artists/[slug]` e `/venues/[slug]`

**Files:**
- Create: `apps/web/src/components/profile-events.tsx`
- Create: `apps/web/src/components/profile-events.spec.tsx`
- Create: `apps/web/src/app/artists/[slug]/page.tsx`
- Create: `apps/web/src/app/venues/[slug]/page.tsx`

- [ ] **Step 1: Escrever o teste do componente falhante**

`apps/web/src/components/profile-events.spec.tsx`:

```tsx
import type { EventDto } from '@ticketvibe/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProfileEvents } from './profile-events';

const events: EventDto[] = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    slug: 'standup-noite-de-verdades',
    title: 'Stand-up: Noite de Verdades',
    description: 'Piadas sem filtro.',
    category: { slug: 'comedy', name: 'Comédia' },
    venue: {
      slug: 'espaco-unimed',
      name: 'Espaço Unimed',
      city: 'São Paulo',
      state: 'SP',
    },
    startsAt: '2026-11-06T00:00:00.000Z',
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
  },
];

describe('ProfileEvents', () => {
  it('renders heading, count and the event cards', () => {
    render(
      <ProfileEvents
        name="Comediantes Afiados"
        cityState={null}
        events={events}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Comediantes Afiados' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 evento encontrado')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Ver Ingressos/ }),
    ).toHaveAttribute('href', '/events/standup-noite-de-verdades');
  });

  it('renders the empty state when there are no events', () => {
    render(
      <ProfileEvents name="Sem Shows" cityState={null} events={[]} />,
    );

    expect(screen.getByText('Nenhum evento no momento.')).toBeInTheDocument();
  });

  it('renders city and state when provided', () => {
    render(
      <ProfileEvents
        name="Teatro Renault"
        cityState="São Paulo/SP"
        events={events}
      />,
    );

    expect(screen.getByText('São Paulo/SP')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/profile-events.spec.tsx`
Expected: FAIL — módulo `./profile-events` não existe.

- [ ] **Step 3: Implementar o componente e as páginas**

`apps/web/src/components/profile-events.tsx`:

```tsx
import type { EventDto } from '@ticketvibe/shared';
import { MapPin } from 'lucide-react';

import { EventCard } from './event-card';
import { toEventCardProps } from '@/lib/event-mapper';

export type ProfileEventsProps = {
  name: string;
  cityState: string | null;
  events: EventDto[];
};

function ProfileEvents({ name, cityState, events }: ProfileEventsProps) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          {name}
        </h1>
        {cityState ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {cityState}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {events.length === 1
            ? '1 evento encontrado'
            : `${events.length} eventos encontrados`}
        </p>
      </header>
      {events.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} {...toEventCardProps(event)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum evento no momento.
        </p>
      )}
    </section>
  );
}

function ProfileEventsError({ title }: { title: string }) {
  return (
    <section className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-heading text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Tente novamente em instantes.</p>
      <a
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        Voltar para a home
      </a>
    </section>
  );
}

function ProfileEventsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="h-10 w-64 animate-pulse rounded-full bg-card" />
      <div className="h-4 w-40 animate-pulse rounded-full bg-card" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}

export { ProfileEvents, ProfileEventsError, ProfileEventsSkeleton };
```

`apps/web/src/app/artists/[slug]/page.tsx`:

```tsx
import type { ArtistDetailDto } from '@ticketvibe/shared';
import { notFound } from 'next/navigation';

import { Header } from '@/components/header';
import {
  ProfileEvents,
  ProfileEventsError,
} from '@/components/profile-events';
import { fetchArtistBySlug } from '@/lib/profiles-api';

export const instant = false;

type ArtistPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;

  let artist: ArtistDetailDto | null;
  try {
    artist = await fetchArtistBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <ProfileEventsError title="Não foi possível carregar o artista" />
        </main>
      </>
    );
  }

  if (!artist) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <ProfileEvents
          name={artist.name}
          cityState={null}
          events={artist.events}
        />
      </main>
    </>
  );
}
```

`apps/web/src/app/venues/[slug]/page.tsx`:

```tsx
import type { VenueDetailDto } from '@ticketvibe/shared';
import { notFound } from 'next/navigation';

import { Header } from '@/components/header';
import {
  ProfileEvents,
  ProfileEventsError,
} from '@/components/profile-events';
import { fetchVenueBySlug } from '@/lib/profiles-api';

export const instant = false;

type VenuePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function VenuePage({ params }: VenuePageProps) {
  const { slug } = await params;

  let venue: VenueDetailDto | null;
  try {
    venue = await fetchVenueBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <ProfileEventsError title="Não foi possível carregar o local" />
        </main>
      </>
    );
  }

  if (!venue) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <ProfileEvents
          name={venue.name}
          cityState={`${venue.city}/${venue.state}`}
          events={venue.events}
        />
      </main>
    </>
  );
}
```

> A âncora em `ProfileEventsError` usa `<a href="/">` para evitar importar `Link` num componente de erro compartilhado; se o code review pedir consistência com `EventDetailError` (que usa `Link`), troque para `import Link from 'next/link'` e `<Link href="/">`.

- [ ] **Step 4: Rodar testes + typecheck**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components/profile-events.spec.tsx
pnpm --filter @ticketvibe/web exec tsc --noEmit
```

Expected: PASS (3 testes) e tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/profile-events.tsx apps/web/src/components/profile-events.spec.tsx apps/web/src/app/artists apps/web/src/app/venues
git commit -m "feat(web): add artist and venue pages"
```

---

### Task 9: Web — links na página de evento (local + artistas)

**Files:**
- Modify: `apps/web/src/components/event-detail.tsx:29-44`
- Modify: `apps/web/src/components/event-detail.spec.tsx`

- [ ] **Step 1: Atualizar o teste (falhante)**

Em `apps/web/src/components/event-detail.spec.tsx`, na fixture do evento adicione artists ao evento de teste:

```ts
  artists: [{ slug: 'andrew-lloyd-webber', name: 'Andrew Lloyd Webber' }],
```

E adicione estes testes:

```tsx
it('links the venue name to the venue page', () => {
  render(<EventDetail event={event} />);

  const venueLink = screen.getByRole('link', { name: /Teatro Renault/ });
  expect(venueLink).toHaveAttribute('href', '/venues/teatro-renault');
});

it('lists artists linking to their pages', () => {
  render(<EventDetail event={event} />);

  const artistLink = screen.getByRole('link', {
    name: 'Andrew Lloyd Webber',
  });
  expect(artistLink).toHaveAttribute('href', '/artists/andrew-lloyd-webber');
});
```

> Garanta que a fixture `event` do spec tenha `venue.slug: 'teatro-renault'` (Task 3 já adicionou; confira).

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/event-detail.spec.tsx`
Expected: FAIL — links ainda não existem no componente.

- [ ] **Step 3: Implementar**

Em `apps/web/src/components/event-detail.tsx`, no bloco do MapPin (linhas 37-43), troque `{event.venue.name} · ...` por:

```tsx
            <span className="flex items-center gap-2">
              <MapPin
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <Link
                href={`/venues/${event.venue.slug}`}
                className="hover:text-foreground hover:underline"
              >
                {event.venue.name}
              </Link>
              <span aria-hidden="true">·</span>
              {event.venue.city}/{event.venue.state}
            </span>
```

Logo após o fechamento dessa `<p>` (linha ~44) e antes da `<p>` de description, adicione a seção de artistas:

```tsx
          {event.artists.length > 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Artistas:</span>
              {event.artists.map((artist, index) => (
                <span key={artist.slug}>
                  <Link
                    href={`/artists/${artist.slug}`}
                    className="text-foreground hover:underline"
                  >
                    {artist.name}
                  </Link>
                  {index < event.artists.length - 1 ? (
                    <span aria-hidden="true">, </span>
                  ) : null}
                </span>
              ))}
            </p>
          ) : null}
```

(`Link` já está importado no arquivo.)

- [ ] **Step 4: Rodar para ver passar**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components/event-detail.spec.tsx
pnpm --filter @ticketvibe/web exec vitest run
```

Expected: PASS — todos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/event-detail.tsx apps/web/src/components/event-detail.spec.tsx
git commit -m "feat(web): link event page to artist and venue pages"
```


---

### Task 10: E2E de navegação + gates completos

**Files:**
- Create: `apps/web/tests/e2e/artist-venue.spec.ts`

- [ ] **Step 0: Tornar o `not-found.tsx` genérico**

`apps/web/src/app/not-found.tsx` hoje mostra "Evento não encontrado" para **todos** os 404s — errado para artista/local. Troque os textos:

```tsx
        <h1 className="font-heading text-3xl font-bold">
          Página não encontrada
        </h1>
        <p className="text-muted-foreground">
          O conteúdo que você procura não existe ou saiu do ar.
        </p>
```

Atualize o E2E existente `apps/web/tests/e2e/event.spec.ts:24` para esperar `'Página não encontrada'` (e o parágrafo, se assertado). Rode `pnpm --filter @ticketvibe/web exec playwright test event` para confirmar (2 testes).

- [ ] **Step 1: Escrever os E2Es falhantes**

`apps/web/tests/e2e/artist-venue.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('página de evento navega para o local e lista os eventos do local', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera');

  await page.getByRole('link', { name: 'Teatro Renault' }).click();

  await expect(page).toHaveURL(/\/venues\/teatro-renault$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Teatro Renault' }),
  ).toBeVisible();
  await expect(page.getByText('São Paulo/SP')).toBeVisible();
  await expect(page.getByText('3 eventos encontrados')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ver Ingressos' }),
  ).toHaveCount(3);
});

test('página de evento navega para o artista e lista os eventos do artista', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera');

  await page.getByRole('link', { name: 'Andrew Lloyd Webber' }).click();

  await expect(page).toHaveURL(/\/artists\/andrew-lloyd-webber$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Andrew Lloyd Webber' }),
  ).toBeVisible();
  await expect(page.getByText('1 evento encontrado')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ver Ingressos' }),
  ).toHaveCount(1);
});

test('página de artista inexistente responde 404', async ({ page }) => {
  const response = await page.goto('/artists/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
});

test('página de local inexistente responde 404', async ({ page }) => {
  const response = await page.goto('/venues/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/api db:seed
pnpm --filter @ticketvibe/web exec playwright test artist-venue
```

Expected: FAIL — links ainda não são clicáveis (fora se a Task 9 já passou; nesse caso os testes devem PASSAR e este step vira confirmação).

- [ ] **Step 3: Gates completos**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @ticketvibe/web exec playwright test
pnpm build
pnpm --filter @ticketvibe/web build-storybook
git status --short apps/api/drizzle
```

Expected:
- lint: exit 0 (1 info pré-existente em `test-helpers.ts` é aceitável).
- typecheck: 5/5 tasks.
- test: shared ≥44, api ≥69, web ≥ todos os anteriores + novos.
- playwright: 12 anteriores + 4 novos = 16.
- build: OK (rotas `/artists/[slug]` e `/venues/[slug]` aparecem no output do next).
- `git status --short apps/api/drizzle`: limpo (migração commitada na Task 2).

- [ ] **Step 4: Checkpoint visual (controller/browser)**

Com `pnpm infra:up`, API e web dev rodando:
1. Home → card "O Fantasma da Ópera" → página de evento mostra "Artistas: Andrew Lloyd Webber" (link) e "Teatro Renault" (link).
2. Clique em Teatro Renault → `/venues/teatro-renault` com heading, "São Paulo/SP", 3 cards.
3. Voltar → clique em Andrew Lloyd Webber → `/artists/andrew-lloyd-webber` com 1 card.
4. `/artists/nao-existe` → 404.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/artist-venue.spec.ts apps/web/tests/e2e/event.spec.ts apps/web/src/app/not-found.tsx
git commit -m "test(web): cover artist and venue navigation e2e"
```

---

## Critérios de aceitação (ticket 07) → tasks

| Critério do ticket | Task |
|---|---|
| Entidade artista no schema, relacionada a eventos, fixtures seedadas | 2 |
| Endpoints REST de artista e local com Zod compartilhado | 1, 4, 5 |
| Páginas de artista e local listando eventos nos cards existentes | 7, 8 |
| Links da página de evento (artista/local) navegando | 3, 9 |
| Testes: integração das rotas, componentes com MSW, E2E navegação evento→artista | 6, 7, 8, 10 |

## Fora de escopo (não fazer)

- FTS/suggest por nome de artista (searchVector não muda).
- Imagem/bio de artista, paginação (YAGNI — seed tem no máximo 3 eventos/local).
- Link de local/cidade no painel de sugestões do header (evolução futura).
- Corrigir o heading do `not-found.tsx` para ser específico por rota (se o 404 genérico servir, manter).

## Riscos conhecidos

1. **Slug com acento** (`comediantes-afiados`): URL e Fastify decodificam via `encodeURIComponent`; E2E cobre o fluxo ASCII do artista do Fantasma. Se houver problema de encoding no navegador, trocar o fixture para `comediantes-afiados` (sem acento) em `fixtures.ts` — decisão do implementer, documentar no commit se mudar.
2. **Propagação do `venue.slug` obrigatório** (Task 3) quebra fixtures em 3 pacotes de uma vez — é intencional; fazer Step 1 completo antes de implementar.
3. **`db:generate` pode ordenar FKs de forma inesperada** — revisar o SQL gerado (0003) antes de commitar; nunca editar migração já aplicada.
