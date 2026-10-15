# Ticket 10 — Mapa de assentos (setor → fila → cadeira) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O comprador escolhe seu lugar num mapa hierárquico setor → fila → cadeira, vendo preço e disponibilidade por assento (livre/ocupada/indisponível) e podendo pegar o "melhor lugar disponível" de um setor em um único clique.

**Architecture:** O Postgres ganha duas tabelas penduradas em `sectors` (que já são por evento): `seat_rows` (filas A..Z por setor) e `seats` (cadeiras numeradas por fila, com `status` text `available|occupied|unavailable`). O módulo novo `apps/api/src/modules/seatmaps/` segue a casa em camadas: `domain/` (entidades + interface `SeatmapRepository` + regra pura `pickBestSeat`), `infra/` (`DrizzleSeatmapRepository` com joins + agrupamento em JS, `InMemorySeatmapRepository` para testes unitários), `use-cases/` (`GetSeatmapUseCase`, `FindBestSeatUseCase` com resultado discriminado `kind`), `routes/` (`GET /events/:slug/seatmap` e `GET /events/:slug/best-seat?sector=`), com DI em `buildApp(options)` igual aos demais repositórios. O contrato Zod (`seatmapResponseSchema`, `bestSeatQuerySchema`, `bestSeatResponseSchema`) vive em `packages/shared` e é parseado nos dois lados. Deferral da F1/Story 9 do ticket 06 é cumprido aqui: `sectorSchema` ganha `seatsAvailable: number | null` (null = setor sem mapa; 0 = esgotado), calculado no `DrizzleEventsRepository.findBySlug` por `count(...) filter (where status = 'available')` com `leftJoin`, e exibido no `EventDetail`. No Next, dois route handlers proxy (`/api/events/[slug]/seatmap` e `/api/events/[slug]/best-seat`) espelham o padrão do `suggest` (padrão obrigatório para fetch client-side same-origin); o placeholder de `events/[slug]/ingressos` vira página server que valida o evento via `fetchEventBySlug` e renderiza o componente client `<SeatMap eventSlug>`, que busca o mapa no mount, troca setores por Chip, seleciona cadeiras por `aria-pressed` e consome o best-seat em 1 clique.

**Tech Stack:** drizzle-orm + drizzle-kit (migração `db:generate`), zod v4 (`z.enum`, `z.string().trim()`), Fastify (rotas com `safeParse` + `reply.code`), Next route handlers com `params: Promise<{slug}>`, vitest + MSW (web), vitest + Fastify inject + Postgres (api), Playwright (E2E com seed determinístico).

---

## Fatos verificados no código (não re-descobrir)

Todos confirmados antes deste plano:

1. **Estilo de tabela (drizzle):** callbacks retornam array — `unique('name').on(...)`, `index('name').on(...)`; `id: uuid('id').defaultRandom().primaryKey()`; FKs com `.references(() => tabela.id)` (`apps/api/src/db/schema.ts:39-101`).
2. **`buildApp` DI:** `options: { eventsRepository?, categoriesRepository?, artistsRepository?, venuesRepository?, auth? }` + `?? new DrizzleX(getDefaultDb())` (`apps/api/src/app.ts:19-53`). Rotas registradas via `registerXRoutes(app, repository)`.
3. **TRUNCATE do teste:** `test-helpers.ts:60` lista as tabelas explicitamente com `RESTART IDENTITY CASCADE` — `seat_rows`/`seats` entram na lista.
4. **Seed:** `seed-fixtures.ts` deleta em ordem (`sectors` primeiro), usa `.returning()` nos inserts e mapa slug→id; `seed.ts:8` loga `'Seed completed: 7 categories, 5 venues, 12 events, 24 sectors.'`.
5. **Contagens do seed novo:** 15 entradas de `seatMapFixtures` → **69 seat rows, 800 seats** (plateia fantasma 96, arquibancada 200, camarotes 24×7, etc.). Setores em pé (pista, frontstage, km5, km10) e eventos corrida/cyberpunk ficam **sem linhas**.
6. **Determinismo do melhor lugar (fixture):** plateia do Fantasma = fila A com 12 cadeiras livres; centro = 5.5 → empate pos 5 ('6') vs pos 6 ('7') → vence posição menor → **A-6**. Balcão: 10 cadeiras, A-5 ocupada → centro 4.5 → '6' vence ('4' dist 1.5, '6' dist 0.5) → **A-6** (exercita skip de ocupada).
7. **Disponibilidade por setor:** integração de eventos insere um setor extra `antecamara` com insert raw (`events.routes.integration.spec.ts:300-309`) — sem linhas → `seatsAvailable: null`; plateia = 91 (96 − 4 ocupadas − 1 indisponível), balcao = 39 (40 − 1).
8. **Mapper de detalhe:** `toEventDetailDto` em `events.routes.ts:16-29` monta `sectors` objeto a objeto — é onde entra `seatsAvailable`.
9. **Schemas/entidades a tocar:** `sectorSchema` em `packages/shared/src/index.ts:75-79`; `SectorEntity` em `event-entity.ts:29-33`; query de setores do repo em `drizzle-events-repository.ts:152-160` (só `select...from(sectors)...orderBy(price, slug)` — vira leftJoin+groupBy).
10. **Proxy Next:** `suggest/route.ts` (schema safeParse → fetch `API_URL` com `AbortSignal.timeout(3000)` → 502 upstream/contract, 404 não é tratado lá) e spec `suggest/route.spec.ts` (`vi.hoisted` seta `API_URL`, MSW, `console.error` mockado). Params dinâmicos: `context: { params: Promise<{ all: string[] }> }` (`auth/[...all]/route.ts`).
11. **Página de evento:** `events/[slug]/page.tsx` mostra o padrão exato: `params: Promise<{slug}>`, try/catch → `<EventDetailError />`, `notFound()` se null, `export const instant = false`.
12. **Placeholder atual:** `events/[slug]/ingressos/page.tsx` é síncrono com o texto "O mapa de assentos e a escolha de setor chegam na fase de compra." — substituído inteiro.
13. **E2E/segredos playright:** nunca tocar em `playwright.config.ts`/`global-setup.ts`; auth E2E usa `localhost:3000`, demais rotas `127.0.0.1` (não se aplica aqui — novos testes usam `page.goto` relativo); `pnpm infra:up` antes, `infra:down` proibido.
14. **Gates do ticket 09 (comandos exatos):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test`, `pnpm build`, `pnpm --filter @ticketvibe/api exec drizzle-kit check`. Totais atuais: api 89, web 130, playwright 18.
15. **Padrão de spec web com MSW + componente:** import dinâmico de componente pós `server.listen({ onUnhandledRequest: 'error' })` (jsdom + MSW); fetch relativo funciona (prova: `login-form.spec.tsx`).

## Arquitetura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `apps/api/src/db/schema.ts` | Tabelas `seat_rows` + `seats` (após `sectors`) | Modify |
| `apps/api/src/db/fixtures.ts` | `seatMapFixtures` (15 entradas, 69 filas, 800 cadeiras, marks) | Modify |
| `apps/api/src/db/seed-fixtures.ts` | Delete em ordem + captura de ids de setor + geração de filas/cadeiras com validação de marks | Modify |
| `apps/api/src/db/test-helpers.ts` | `seat_rows, seats` no TRUNCATE | Modify |
| `apps/api/src/db/seed.ts` | Log com contagens novas | Modify |
| `apps/api/src/db/seed-fixtures.integration.spec.ts` | 3 testes red do seed (contagens, marks, setores em pé) | Modify |
| `apps/api/drizzle/0005_*.sql` | Migração gerada | Create (gerado) |
| `packages/shared/src/index.ts` | `seatStatus/seatmap/bestSeat` schemas + `sectorSchema.seatsAvailable` | Modify |
| `packages/shared/src/index.spec.ts` | +7 (seatmap/bestSeat) e +2 (seatsAvailable) | Modify |
| `apps/api/src/modules/seatmaps/domain/seatmap-entity.ts` | Entidades `SeatmapEntity/Sector/Row/Seat/BestSeat` | Create |
| `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts` | Interface `SeatmapRepository` | Create |
| `apps/api/src/modules/seatmaps/domain/pick-best-seat.ts` | Regra pura do melhor lugar | Create |
| `apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts` | Repo em memória (seed por construtor) | Create |
| `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts` | 3 queries (evento, setores, filas, cadeiras) + agrupamento em JS | Create |
| `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.ts` | Lookup do mapa | Create |
| `apps/api/src/modules/seatmaps/use-cases/find-best-seat.use-case.ts` | Resultado discriminado `kind` | Create |
| `apps/api/src/modules/seatmaps/routes/seatmap.routes.ts` | `GET /events/:slug/seatmap` + `GET /events/:slug/best-seat` | Create |
| `apps/api/src/modules/seatmaps/use-cases/*.spec.ts`, `pick-best-seat` specs via use case | Unitários (in-memory) | Create |
| `apps/api/src/modules/seatmaps/routes/seatmap.routes.spec.ts` | Unitário das rotas (in-memory) | Create |
| `apps/api/src/modules/seatmaps/routes/seatmap.routes.integration.spec.ts` | Integração Postgres (9 testes) | Create |
| `apps/api/src/app.ts` | DI `seatmapRepository` + `registerSeatmapRoutes` | Modify |
| `apps/api/src/modules/events/domain/event-entity.ts` | `SectorEntity.seatsAvailable: number \| null` | Modify |
| `apps/api/src/modules/events/infra/drizzle-events-repository.ts` | contagem com `leftJoin` + `count filter` | Modify |
| `apps/api/src/modules/events/routes/events.routes.ts` | mapper passa `seatsAvailable` | Modify |
| specs de fixtures do evento (api) | fixtures `seatsAvailable` + expectativas | Modify |
| `apps/web/src/components/event-detail.tsx` | linha de disponibilidade/Esgotado | Modify |
| `apps/web/src/components/event-detail.spec.tsx` | fixture + 2 testes | Modify |
| `apps/web/src/lib/events-api.spec.ts` | fixture `seatsAvailable` | Modify |
| `apps/web/src/app/api/events/[slug]/seatmap/route.ts` + `.spec.ts` | proxy 200/404/502 | Create |
| `apps/web/src/app/api/events/[slug]/best-seat/route.ts` + `.spec.ts` | proxy 400/200/404/502 | Create |
| `apps/web/src/components/seat-map.tsx` + `seat-map.spec.tsx` | componente client (7 testes MSW) | Create |
| `apps/web/src/app/events/[slug]/ingressos/page.tsx` | vira server page + `<SeatMap>` | Modify |
| `apps/web/tests/e2e/seatmap.spec.ts` | 3 testes E2E | Create |
| `apps/web/tests/e2e/event.spec.ts` | +1 asserção de disponibilidade | Modify |

**Decisões:**

- **D1 — Modelo relacional:** `seat_rows(sector_id, label, position)` + `seats(row_id, label, position, status)` com unicidade `(sector_id,label)` e `(row_id,label)`. Setores ganham linhas só quando têm lugares numerados (plateia, balcao, camarote, mezanino, arquibancada); em pé/corrida ficam sem → fora do DTO do seatmap.
- **D2 — `status` como text + `z.enum`, sem pgEnum** (convenção do repo: nenhum pgEnum no schema; validação é do contrato Zod; coluna tipada com `.$type<'available'|'occupied'|'unavailable'>()`). Ocupação real por Redis é o ticket 11 — aqui é fixture.
- **D3 — Resposta única por evento** (sem paginação/polling): `GET /events/:slug/seatmap` devolve `{seatmap:{eventSlug, sectors:[...com rows]}}`; setores **sem linhas são filtrados no mapper da rota** (o repositório retorna todos, porque `best-seat` precisa deles — setor em pé lá dentro vira `no_available_seat`, não `sector_not_found`). Ordenação (preço, depois slug) é responsabilidade do repositório.
- **D4 — "Melhor lugar"** = regra pura: primeira fila (por `position`) com assento `available`; nela, menor distância ao centro `(len-1)/2` da fila, empate → posição menor. Endpoint `GET` com query `sector`; códigos: 400 `invalid_query`, 404 `event_not_found` | `sector_not_found` | `no_available_seat`.
- **D5 — UI client-side via proxies Next** (padrão `suggest`): ticket 11 (reserva) e 16 (WebSocket) são client-side por natureza; buscar direto do server page criaria dois caminhos de fetch. Evento desconhecido → `notFound()` na página; evento sem setores numerados → estado vazio no componente. Seleção é local (sem persistência — 12).
- **D6 — Disponibilidade por setor (deferred Story 9 do 06):** `seatsAvailable: number | null` em `sectorSchema` (null = sem mapa, 0 = esgotado), contagem em SQL no único `findBySlug`. Setor raw-insert sem linhas (antecamara) prova o null; plateia 91 / balcao 39 amarram ao seed (mudou fixture → atualiza teste).
- **D7 — E2E determinístico pelo seed:** melhor lugar do Fantasma = `Plateia · Fila A · Cadeira 6 · R$ 120,00` (matemática no fato 6); B-7 ocupada exercita estado desabilitado; `corrida-de-rua-sp` exercita estado vazio.

---

### Task 1: Schema das cadeiras + migração + fixtures + seed

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/fixtures.ts`
- Modify: `apps/api/src/db/seed-fixtures.ts`
- Modify: `apps/api/src/db/test-helpers.ts`
- Modify: `apps/api/src/db/seed.ts`
- Modify: `apps/api/src/db/seed-fixtures.integration.spec.ts`
- Create: `apps/api/drizzle/0005_*.sql` (gerada pelo drizzle-kit)

- [ ] **Step 1: Escrever os testes falhantes**

Acrescente ao final de `apps/api/src/db/seed-fixtures.integration.spec.ts` (o arquivo falha na importação — `seatRows`/`seats` ainda não existem em `./schema.js` = red):

```ts
// troque o import de drizzle-orm por:
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
// e o import de schema por (artists/eventArtists continuam):
import { artists, events, eventArtists, seatRows, seats, sectors } from './schema.js';

// dentro do describe, após os helpers existentes:
async function findSectorId(
  db: Db,
  eventSlug: string,
  sectorSlug: string,
): Promise<string> {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.slug, eventSlug))
    .limit(1);
  if (!event) throw new Error(`missing event ${eventSlug}`);
  const [sector] = await db
    .select()
    .from(sectors)
    .where(and(eq(sectors.eventId, event.id), eq(sectors.slug, sectorSlug)))
    .limit(1);
  if (!sector) throw new Error(`missing sector ${sectorSlug}`);
  return sector.id;
}

async function seatStatus(
  db: Db,
  sectorId: string,
  rowLabel: string,
  seatLabel: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(seatRows)
    .where(and(eq(seatRows.sectorId, sectorId), eq(seatRows.label, rowLabel)));
  const [seat] = await db
    .select()
    .from(seats)
    .where(and(eq(seats.rowId, row.id), eq(seats.label, seatLabel)));
  return seat.status;
}

it('seeds seat rows and seats for seated sectors', async () => {
  const allRows = await testDb.select().from(seatRows);
  const allSeats = await testDb.select().from(seats);
  expect(allRows).toHaveLength(69);
  expect(allSeats).toHaveLength(800);

  const plateiaId = await findSectorId(
    testDb,
    'o-fantasma-da-opera',
    'plateia',
  );
  const plateiaRows = await testDb
    .select()
    .from(seatRows)
    .where(eq(seatRows.sectorId, plateiaId))
    .orderBy(asc(seatRows.position));
  expect(plateiaRows.map((row) => row.label)).toEqual([
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
  ]);
});

it('applies occupied and unavailable seat marks', async () => {
  const plateiaId = await findSectorId(
    testDb,
    'o-fantasma-da-opera',
    'plateia',
  );
  const balcaoId = await findSectorId(
    testDb,
    'o-fantasma-da-opera',
    'balcao',
  );
  expect(await seatStatus(testDb, plateiaId, 'A', '6')).toBe('available');
  expect(await seatStatus(testDb, plateiaId, 'B', '7')).toBe('occupied');
  expect(await seatStatus(testDb, plateiaId, 'H', '12')).toBe('unavailable');
  expect(await seatStatus(testDb, balcaoId, 'A', '5')).toBe('occupied');
});

it('keeps standing sectors without rows', async () => {
  const [corrida] = await testDb
    .select()
    .from(events)
    .where(eq(events.slug, 'corrida-de-rua-sp'))
    .limit(1);
  const corridaSectors = await testDb
    .select()
    .from(sectors)
    .where(eq(sectors.eventId, corrida.id));
  const rows = await testDb
    .select()
    .from(seatRows)
    .where(
      inArray(
        seatRows.sectorId,
        corridaSectors.map((sector) => sector.id),
      ),
    );
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 2: Schema das tabelas**

Em `apps/api/src/db/schema.ts`, logo após a definição de `sectors` (linha ~101), acrescente (imports de `integer` já existem):

```ts
export const seatRows = pgTable(
  'seat_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id),
    label: text('label').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    unique('seat_rows_sector_id_label_unique').on(table.sectorId, table.label),
    index('seat_rows_sector_id_idx').on(table.sectorId),
  ],
);

export const seats = pgTable(
  'seats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rowId: uuid('row_id')
      .notNull()
      .references(() => seatRows.id),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    status: text('status')
      .$type<'available' | 'occupied' | 'unavailable'>()
      .notNull()
      .default('available'),
  },
  (table) => [
    unique('seats_row_id_label_unique').on(table.rowId, table.label),
    index('seats_row_id_idx').on(table.rowId),
  ],
);
```

- [ ] **Step 3: Fixtures do mapa**

Acrescente ao final de `apps/api/src/db/fixtures.ts`:

```ts
export interface SeatMapFixture {
  eventSlug: string;
  sectorSlug: string;
  rows: number;
  seatsPerRow: number;
  marks?: { seat: string; status: 'occupied' | 'unavailable' }[];
}

export const seatMapFixtures: SeatMapFixture[] = [
  {
    eventSlug: 'o-fantasma-da-opera',
    sectorSlug: 'plateia',
    rows: 8,
    seatsPerRow: 12,
    marks: [
      { seat: 'B-7', status: 'occupied' },
      { seat: 'C-4', status: 'occupied' },
      { seat: 'C-5', status: 'occupied' },
      { seat: 'D-10', status: 'occupied' },
      { seat: 'H-12', status: 'unavailable' },
    ],
  },
  {
    eventSlug: 'o-fantasma-da-opera',
    sectorSlug: 'balcao',
    rows: 4,
    seatsPerRow: 10,
    marks: [{ seat: 'A-5', status: 'occupied' }],
  },
  {
    eventSlug: 'derby-capital',
    sectorSlug: 'arquibancada',
    rows: 10,
    seatsPerRow: 20,
    marks: [
      { seat: 'A-10', status: 'occupied' },
      { seat: 'A-11', status: 'occupied' },
      { seat: 'B-1', status: 'occupied' },
      { seat: 'J-20', status: 'unavailable' },
    ],
  },
  { eventSlug: 'derby-capital', sectorSlug: 'camarote', rows: 3, seatsPerRow: 8 },
  { eventSlug: 'corpo-em-movimento', sectorSlug: 'plateia', rows: 6, seatsPerRow: 12 },
  { eventSlug: 'corpo-em-movimento', sectorSlug: 'mezanino', rows: 4, seatsPerRow: 10 },
  { eventSlug: 'standup-noite-de-verdades', sectorSlug: 'camarote', rows: 3, seatsPerRow: 8 },
  { eventSlug: 'pequeno-principe-musical', sectorSlug: 'plateia', rows: 6, seatsPerRow: 12 },
  { eventSlug: 'pequeno-principe-musical', sectorSlug: 'camarote', rows: 3, seatsPerRow: 8 },
  {
    eventSlug: 'neon-lights-world-tour',
    sectorSlug: 'camarote',
    rows: 3,
    seatsPerRow: 8,
    marks: [{ seat: 'B-4', status: 'occupied' }],
  },
  { eventSlug: 'sertaneja-rio', sectorSlug: 'camarote', rows: 3, seatsPerRow: 8 },
  { eventSlug: 'melhor-de-standup-grand-finale', sectorSlug: 'camarote', rows: 3, seatsPerRow: 8 },
  { eventSlug: 'a-hora-e-a-vez', sectorSlug: 'plateia', rows: 6, seatsPerRow: 12 },
  { eventSlug: 'a-hora-e-a-vez', sectorSlug: 'balcao', rows: 4, seatsPerRow: 10 },
  { eventSlug: 'festival-de-verao', sectorSlug: 'camarote', rows: 3, seatsPerRow: 8 },
];
```

**Verificado:** as 15 entradas acima cobrem exatamente os 15 pares `(eventSlug, sectorSlug)` de `sectorFixtures` com setores sentados (`plateia`, `balcao`, `camarote`, `mezanino`, `arquibancada`) — conferido por script em 2026-10-15; totais **69 filas / 800 cadeiras**. Slugs fora dessa lista derrubam o seed com `Missing sector for seat map` (guard proposital do Step 4).

- [ ] **Step 4: Seed com geração e validação**

Em `apps/api/src/db/seed-fixtures.ts`:

1. Imports: acrescente `seatMapFixtures` ao import de `./fixtures.js` e `seatRows, seats` ao import de `./schema.js`.
2. Ordem de delete (antes de `tx.delete(sectors)`):

```ts
await tx.delete(seats);
await tx.delete(seatRows);
await tx.delete(sectors);
```

3. Troque `await tx.insert(sectors).values(sectorValues);` por:

```ts
const insertedSectors = await tx
  .insert(sectors)
  .values(sectorValues)
  .returning();
const sectorIds = new Map(
  insertedSectors.map((row) => [`${row.eventId}:${row.slug}`, row.id]),
);
```

4. Ao final da transação (após o insert de setores), acrescente a geração:

```ts
for (const fixture of seatMapFixtures) {
  const eventId = eventIds.get(fixture.eventSlug);
  const sectorId = eventId
    ? sectorIds.get(`${eventId}:${fixture.sectorSlug}`)
    : undefined;
  if (!sectorId) {
    throw new Error(
      `Missing sector for seat map "${fixture.eventSlug}"→"${fixture.sectorSlug}"`,
    );
  }
  for (const mark of fixture.marks ?? []) {
    const [rowLabel = '', seatNumber = ''] = mark.seat.split('-');
    const rowIndex = rowLabel.charCodeAt(0) - 65;
    const number = Number(seatNumber);
    if (
      rowIndex < 0 ||
      rowIndex >= fixture.rows ||
      number < 1 ||
      number > fixture.seatsPerRow
    ) {
      throw new Error(
        `Invalid seat mark "${mark.seat}" for "${fixture.eventSlug}"→"${fixture.sectorSlug}"`,
      );
    }
  }
  const marks = new Map(
    (fixture.marks ?? []).map((mark) => [mark.seat, mark.status]),
  );
  const insertedRows = await tx
    .insert(seatRows)
    .values(
      Array.from({ length: fixture.rows }, (_, index) => ({
        sectorId,
        label: String.fromCharCode(65 + index),
        position: index,
      })),
    )
    .returning();
  const seatValues = insertedRows.flatMap((row) =>
    Array.from({ length: fixture.seatsPerRow }, (_, index) => {
      const label = String(index + 1);
      return {
        rowId: row.id,
        label,
        position: index,
        status: marks.get(`${row.label}-${label}`) ?? ('available' as const),
      };
    }),
  );
  await tx.insert(seats).values(seatValues);
}
```

5. `apps/api/src/db/test-helpers.ts:60` — adicione `seat_rows, seats,` na lista do TRUNCATE:

```ts
sql`TRUNCATE TABLE "user", session, account, verification, event_artists, seat_rows, seats, sectors, events, artists, venues, categories RESTART IDENTITY CASCADE`,
```

6. `apps/api/src/db/seed.ts:8`:

```ts
console.log(
  'Seed completed: 7 categories, 5 venues, 12 events, 24 sectors, 69 seat rows, 800 seats.',
);
```

- [ ] **Step 5: Migração e green**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/api db:generate
pnpm --filter @ticketvibe/api db:migrate
pnpm --filter @ticketvibe/api exec vitest run src/db/seed-fixtures.integration.spec.ts
```

Esperado: migração `0005` criada (commitar a pasta `drizzle/` junto), 4 testes passando (1 existente + 3 novos), sem erro `Missing sector` (Step 3 ajustado se preciso).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): add seat rows and seats schema with seeded seat maps"
```

---

### Task 2: Contratos shared (seatmap + melhor lugar)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/index.spec.ts`

- [ ] **Step 1: Testes falhantes**

Acrescente ao final de `packages/shared/src/index.spec.ts` (e os imports dos novos schemas no topo):

```ts
describe('seatmapResponseSchema', () => {
  it('accepts a seatmap with rows and seat statuses', () => {
    const payload = {
      seatmap: {
        eventSlug: 'o-fantasma-da-opera',
        sectors: [
          {
            slug: 'plateia',
            name: 'Plateia',
            priceFromCents: 12000,
            rows: [
              {
                label: 'A',
                seats: [
                  { label: '1', status: 'available' },
                  { label: '2', status: 'occupied' },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(seatmapResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a seatmap with sectors without rows', () => {
    const payload = {
      seatmap: {
        eventSlug: 'corrida-de-rua-sp',
        sectors: [
          { slug: 'pista', name: 'Pista', priceFromCents: 15000, rows: [] },
        ],
      },
    };
    expect(seatmapResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an unknown seat status', () => {
    const payload = {
      seatmap: {
        eventSlug: 'gig',
        sectors: [
          {
            slug: 'a',
            name: 'A',
            priceFromCents: 100,
            rows: [
              { label: 'A', seats: [{ label: '1', status: 'reserved' }] },
            ],
          },
        ],
      },
    };
    expect(() => seatmapResponseSchema.parse(payload)).toThrow();
  });
});

describe('bestSeatQuerySchema', () => {
  it('trims the sector slug', () => {
    expect(bestSeatQuerySchema.parse({ sector: ' plateia ' }).sector).toBe(
      'plateia',
    );
  });

  it('rejects an empty sector', () => {
    expect(() => bestSeatQuerySchema.parse({ sector: '   ' })).toThrow();
  });
});

describe('bestSeatResponseSchema', () => {
  it('accepts a best seat payload', () => {
    const payload = {
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        priceFromCents: 12000,
      },
    };
    expect(bestSeatResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a negative price', () => {
    expect(() =>
      bestSeatResponseSchema.parse({
        seat: {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          priceFromCents: -1,
        },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Implementar os schemas**

Em `packages/shared/src/index.ts`, logo após o bloco `eventDetailResponseSchema` (linha ~101):

```ts
export const seatStatusSchema = z.enum([
  'available',
  'occupied',
  'unavailable',
]);

export type SeatStatus = z.infer<typeof seatStatusSchema>;

export const seatSchema = z.object({
  label: z.string().min(1),
  status: seatStatusSchema,
});

export const seatRowSchema = z.object({
  label: z.string().min(1),
  seats: z.array(seatSchema),
});

export const seatmapSectorSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  priceFromCents: z.number().int().min(0),
  rows: z.array(seatRowSchema),
});

export const seatmapSchema = z.object({
  eventSlug: z.string().min(1),
  sectors: z.array(seatmapSectorSchema),
});

export const seatmapResponseSchema = z.object({ seatmap: seatmapSchema });

export type SeatmapDto = z.infer<typeof seatmapSchema>;

export const bestSeatQuerySchema = z.object({
  sector: z.string().trim().min(1),
});

export const bestSeatSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  priceFromCents: z.number().int().min(0),
});

export const bestSeatResponseSchema = z.object({ seat: bestSeatSchema });

export type BestSeatDto = z.infer<typeof bestSeatSchema>;
```

- [ ] **Step 3: Verificar e commit**

```bash
pnpm --filter @ticketvibe/shared exec vitest run
pnpm --filter @ticketvibe/shared exec tsc --noEmit
```

Esperado: 7 testes novos passando.

```bash
git add -A && git commit -m "feat(shared): add seatmap and best seat contracts"
```

---

### Task 3: Domínio do seatmap — entidades, repo in-memory e `GetSeatmapUseCase`

**Files:**
- Create: `apps/api/src/modules/seatmaps/domain/seatmap-entity.ts`
- Create: `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts`
- Create: `apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts`
- Create: `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.ts`
- Create: `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.spec.ts`

- [ ] **Step 1: Teste falhante**

`apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SeatmapEntity } from '../domain/seatmap-entity';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository';
import { GetSeatmapUseCase } from './get-seatmap.use-case';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 15000,
      rows: [],
    },
  ],
};

describe('GetSeatmapUseCase', () => {
  it('returns the seatmap for a known event', async () => {
    const repository = new InMemorySeatmapRepository([gig]);
    await expect(new GetSeatmapUseCase(repository).execute('gig')).resolves.toEqual(
      gig,
    );
  });

  it('returns null for an unknown event', async () => {
    const repository = new InMemorySeatmapRepository([gig]);
    await expect(
      new GetSeatmapUseCase(repository).execute('outro'),
    ).resolves.toBeNull();
  });

  it('delegates the lookup to the repository', async () => {
    const spy = vi.fn(async () => gig);
    await new GetSeatmapUseCase({ findSeatmap: spy }).execute('gig');
    expect(spy).toHaveBeenCalledWith('gig');
  });
});
```

- [ ] **Step 2: Entidades e interface**

`apps/api/src/modules/seatmaps/domain/seatmap-entity.ts`:

```ts
export type SeatStatusValue = 'available' | 'occupied' | 'unavailable';

export interface SeatmapSeat {
  label: string;
  status: SeatStatusValue;
}

export interface SeatmapRow {
  label: string;
  seats: SeatmapSeat[];
}

export interface SeatmapSector {
  slug: string;
  name: string;
  priceFromCents: number;
  rows: SeatmapRow[];
}

export interface SeatmapEntity {
  eventSlug: string;
  sectors: SeatmapSector[];
}

export interface BestSeat {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}
```

`apps/api/src/modules/seatmaps/domain/seatmap-repository.ts`:

```ts
import type { SeatmapEntity } from './seatmap-entity.js';

export interface SeatmapRepository {
  findSeatmap(eventSlug: string): Promise<SeatmapEntity | null>;
}
```

`apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts`:

```ts
import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export class InMemorySeatmapRepository implements SeatmapRepository {
  private readonly seatmaps = new Map<string, SeatmapEntity>();

  constructor(seed: SeatmapEntity[] = []) {
    for (const seatmap of seed) {
      this.seatmaps.set(seatmap.eventSlug, seatmap);
    }
  }

  async findSeatmap(eventSlug: string): Promise<SeatmapEntity | null> {
    return this.seatmaps.get(eventSlug) ?? null;
  }
}
```

- [ ] **Step 3: Use case**

`apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.ts`:

```ts
import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export class GetSeatmapUseCase {
  constructor(private readonly seatmapRepository: SeatmapRepository) {}

  execute(eventSlug: string): Promise<SeatmapEntity | null> {
    return this.seatmapRepository.findSeatmap(eventSlug);
  }
}
```

- [ ] **Step 4: Green + commit**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps
pnpm --filter @ticketvibe/api exec tsc --noEmit
git add -A && git commit -m "feat(api): add seatmap use case with in-memory repository"
```

---

### Task 4: Regra do melhor lugar — `pickBestSeat` + `FindBestSeatUseCase`

**Files:**
- Create: `apps/api/src/modules/seatmaps/domain/pick-best-seat.ts`
- Create: `apps/api/src/modules/seatmaps/use-cases/find-best-seat.use-case.ts`
- Create: `apps/api/src/modules/seatmaps/use-cases/find-best-seat.use-case.spec.ts`

- [ ] **Step 1: Testes falhantes**

`apps/api/src/modules/seatmaps/use-cases/find-best-seat.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type {
  SeatmapSector,
  SeatStatusValue,
} from '../domain/seatmap-entity.js';
import { pickBestSeat } from '../domain/pick-best-seat.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { FindBestSeatUseCase } from './find-best-seat.use-case.js';

function seat(label: string, status: SeatStatusValue = 'available') {
  return { label, status };
}

function sectorWith(rows: SeatmapSector['rows']): SeatmapSector {
  return {
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 12000,
    rows,
  };
}

describe('pickBestSeat', () => {
  it('picks the most central seat of the first row with availability', () => {
    expect(
      pickBestSeat(
        sectorWith([
          { label: 'A', seats: [seat('1'), seat('2'), seat('3'), seat('4'), seat('5')] },
        ]),
      ),
    ).toEqual({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '3',
      priceFromCents: 12000,
    });
  });

  it('breaks center ties towards the lower position', () => {
    const best = pickBestSeat(
      sectorWith([
        { label: 'A', seats: [seat('1'), seat('2'), seat('3'), seat('4')] },
      ]),
    );
    expect(best?.seatLabel).toBe('2');
  });

  it('skips occupied seats near the center', () => {
    const best = pickBestSeat(
      sectorWith([
        { label: 'A', seats: [seat('1'), seat('2', 'occupied'), seat('3')] },
      ]),
    );
    expect(best?.seatLabel).toBe('1');
  });

  it('moves to the next row when the first has no free seat', () => {
    const best = pickBestSeat(
      sectorWith([
        {
          label: 'A',
          seats: [seat('1', 'occupied'), seat('2', 'unavailable'), seat('3', 'occupied')],
        },
        { label: 'B', seats: [seat('1'), seat('2'), seat('3')] },
      ]),
    );
    expect(best).toMatchObject({ rowLabel: 'B', seatLabel: '2' });
  });

  it('ignores unavailable seats even when they are central', () => {
    const best = pickBestSeat(
      sectorWith([
        { label: 'A', seats: [seat('1'), seat('2', 'unavailable'), seat('3')] },
      ]),
    );
    expect(best?.seatLabel).toBe('1');
  });

  it('returns null when the sector has no rows', () => {
    expect(pickBestSeat(sectorWith([]))).toBeNull();
  });

  it('returns null when every seat is taken', () => {
    expect(
      pickBestSeat(
        sectorWith([
          { label: 'A', seats: [seat('1', 'occupied'), seat('2', 'occupied')] },
        ]),
      ),
    ).toBeNull();
  });
});

describe('FindBestSeatUseCase', () => {
  const pista: SeatmapSector = {
    slug: 'pista',
    name: 'Pista',
    priceFromCents: 15000,
    rows: [],
  };
  const plateia = sectorWith([
    { label: 'A', seats: [seat('1'), seat('2'), seat('3')] },
  ]);
  const repository = () =>
    new InMemorySeatmapRepository([
      { eventSlug: 'gig', sectors: [plateia, pista] },
    ]);

  it('returns the seat with the sector price', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'gig',
      'plateia',
    );
    expect(result).toEqual({
      kind: 'seat',
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '2',
        priceFromCents: 12000,
      },
    });
  });

  it('returns event_not_found for an unknown event', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'outro',
      'plateia',
    );
    expect(result).toEqual({ kind: 'event_not_found' });
  });

  it('returns sector_not_found for an unknown sector', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'gig',
      'camarote',
    );
    expect(result).toEqual({ kind: 'sector_not_found' });
  });

  it('returns no_available_seat for a sector without rows', async () => {
    const result = await new FindBestSeatUseCase(repository()).execute(
      'gig',
      'pista',
    );
    expect(result).toEqual({ kind: 'no_available_seat' });
  });
});
```

- [ ] **Step 2: Regra pura**

`apps/api/src/modules/seatmaps/domain/pick-best-seat.ts`:

```ts
import type { BestSeat, SeatmapSector } from './seatmap-entity.js';

export function pickBestSeat(sector: SeatmapSector): BestSeat | null {
  for (const row of sector.rows) {
    if (row.seats.length === 0) continue;
    const center = (row.seats.length - 1) / 2;
    let best: { label: string; position: number; distance: number } | null =
      null;
    for (let position = 0; position < row.seats.length; position += 1) {
      const seat = row.seats[position];
      if (seat.status !== 'available') continue;
      const distance = Math.abs(position - center);
      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && position < best.position)
      ) {
        best = { label: seat.label, position, distance };
      }
    }
    if (best) {
      return {
        sectorSlug: sector.slug,
        rowLabel: row.label,
        seatLabel: best.label,
        priceFromCents: sector.priceFromCents,
      };
    }
  }
  return null;
}
```

- [ ] **Step 3: Use case**

`apps/api/src/modules/seatmaps/use-cases/find-best-seat.use-case.ts`:

```ts
import { pickBestSeat } from '../domain/pick-best-seat.js';
import type { BestSeat } from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type FindBestSeatResult =
  | { kind: 'seat'; seat: BestSeat }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'no_available_seat' };

export class FindBestSeatUseCase {
  constructor(private readonly seatmapRepository: SeatmapRepository) {}

  async execute(
    eventSlug: string,
    sectorSlug: string,
  ): Promise<FindBestSeatResult> {
    const seatmap = await this.seatmapRepository.findSeatmap(eventSlug);
    if (!seatmap) {
      return { kind: 'event_not_found' };
    }
    const sector = seatmap.sectors.find((item) => item.slug === sectorSlug);
    if (!sector) {
      return { kind: 'sector_not_found' };
    }
    const seat = pickBestSeat(sector);
    if (!seat) {
      return { kind: 'no_available_seat' };
    }
    return { kind: 'seat', seat };
  }
}
```

- [ ] **Step 4: Green + commit**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps
pnpm --filter @ticketvibe/api exec tsc --noEmit
git add -A && git commit -m "feat(api): add best available seat selection rule"
```

---

### Task 5: `DrizzleSeatmapRepository` + integração Postgres

**Files:**
- Create: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts`
- Create: `apps/api/src/modules/seatmaps/routes/seatmap.routes.integration.spec.ts`

- [ ] **Step 1: Teste falhante (integração)**

`apps/api/src/modules/seatmaps/routes/seatmap.routes.integration.spec.ts` — falha na importação de `../infra/drizzle-seatmap-repository.js` (não existe ainda = red):

```ts
import {
  seatmapResponseSchema,
  bestSeatResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleSeatmapRepository } from '../infra/drizzle-seatmap-repository.js';

describe('seatmap routes (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    app = buildApp({ seatmapRepository: new DrizzleSeatmapRepository(testDb) });
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

  it('returns the seatmap with rows and seat statuses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
    });

    expect(response.statusCode).toBe(200);
    const body = seatmapResponseSchema.parse(response.json());
    expect(body.seatmap.eventSlug).toBe('o-fantasma-da-opera');
    expect(body.seatmap.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);

    const plateia = body.seatmap.sectors[0];
    expect(plateia.priceFromCents).toBe(12000);
    expect(plateia.rows.map((row) => row.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
    ]);
    expect(plateia.rows[0].seats).toHaveLength(12);
    expect(
      plateia.rows[1].seats.find((seat) => seat.label === '7')?.status,
    ).toBe('occupied');
    expect(
      plateia.rows[7].seats.find((seat) => seat.label === '12')?.status,
    ).toBe('unavailable');
    const available = plateia.rows
      .flatMap((row) => row.seats)
      .filter((seat) => seat.status === 'available');
    expect(available).toHaveLength(91);
  });

  it('returns an empty seatmap for events without numbered sectors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/corrida-de-rua-sp/seatmap',
    });

    expect(response.statusCode).toBe(200);
    const body = seatmapResponseSchema.parse(response.json());
    expect(body.seatmap).toEqual({ eventSlug: 'corrida-de-rua-sp', sectors: [] });
  });

  it('returns 404 for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/seatmap',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('returns the most central free seat of the first row', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body).toEqual({
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        priceFromCents: 12000,
      },
    });
  });

  it('skips occupied seats when picking the best seat', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat?sector=balcao',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body.seat.seatLabel).toBe('6');
  });

  it('returns 400 when the sector param is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_query');
  });

  it('returns 404 sector_not_found for an unknown sector', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/best-seat?sector=camarote',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'sector_not_found' });
  });

  it('returns 404 event_not_found for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('returns 404 no_available_seat for sectors without rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/derby-capital/best-seat?sector=km5',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'no_available_seat' });
  });
});
```

**Fluxo esperado desta task (sem verde ainda):**

- Step 1 (red): o spec quebra na importação de `DrizzleSeatmapRepository` (módulo não existe).
- Step 2: implemente o repositório (compila).
- Step 3: rode o spec de novo e confirme que o red **mudou de natureza**: agora as falhas são 404 de rota inexistente (`/events/:slug/seatmap` ainda não foi registrada no `buildApp` — isso acontece na Task 6). Esse é o red correto da integração; o verde completo vem na Task 6, que também commita o repositório. **Não adiente o wiring da Task 6** para forçar verde aqui — manter a ordem do plano deixa a responsabilidade de cada task limpa.

Obs.: o `tsc --noEmit` do api só roda a partir da Task 6 (a opção `seatmapRepository` no literal do spec só existe depois do wiring) — por isso o Step 3 daqui roda só `vitest`.

- [ ] **Step 2: Implementar o repositório**

`apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts`:

```ts
import { asc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { events, seatRows, sectors, seats } from '../../../db/schema.js';
import type {
  SeatmapEntity,
  SeatmapRow,
  SeatmapSeat,
} from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export class DrizzleSeatmapRepository implements SeatmapRepository {
  constructor(private readonly db: Db) {}

  async findSeatmap(eventSlug: string): Promise<SeatmapEntity | null> {
    const [event] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, eventSlug))
      .limit(1);
    if (!event) return null;

    const sectorRows = await this.db
      .select({
        id: sectors.id,
        slug: sectors.slug,
        name: sectors.name,
        priceFromCents: sectors.priceFromCents,
      })
      .from(sectors)
      .where(eq(sectors.eventId, event.id))
      .orderBy(asc(sectors.priceFromCents), asc(sectors.slug));

    const sectorIds = sectorRows.map((sector) => sector.id);
    const rowRecords = sectorIds.length
      ? await this.db
          .select()
          .from(seatRows)
          .where(inArray(seatRows.sectorId, sectorIds))
          .orderBy(asc(seatRows.sectorId), asc(seatRows.position))
      : [];

    const rowIds = rowRecords.map((row) => row.id);
    const seatRecords = rowIds.length
      ? await this.db
          .select()
          .from(seats)
          .where(inArray(seats.rowId, rowIds))
          .orderBy(asc(seats.position))
      : [];

    const seatsByRow = new Map<string, SeatmapSeat[]>();
    for (const seat of seatRecords) {
      const list = seatsByRow.get(seat.rowId) ?? [];
      list.push({ label: seat.label, status: seat.status });
      seatsByRow.set(seat.rowId, list);
    }

    const rowsBySector = new Map<string, SeatmapRow[]>();
    for (const row of rowRecords) {
      const rows = rowsBySector.get(row.sectorId) ?? [];
      rows.push({ label: row.label, seats: seatsByRow.get(row.id) ?? [] });
      rowsBySector.set(row.sectorId, rows);
    }

    return {
      eventSlug,
      sectors: sectorRows.map((sector) => ({
        slug: sector.slug,
        name: sector.name,
        priceFromCents: sector.priceFromCents,
        rows: rowsBySector.get(sector.id) ?? [],
      })),
    };
  }
}
```

- [ ] **Step 3: Confirmar o red mudou de natureza**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes/seatmap.routes.integration.spec.ts
```

Esperado: falhas por 404 de rota inexistente (`/events/:slug/seatmap` ainda não registrada) — não mais "module not found". O verde completo vem na Task 6. **Sem commit nesta task** (o red fica verde junto com a Task 6 num único commit de rotas+repo).

---

### Task 6: Rotas + wiring do `buildApp` + specs unitários

**Files:**
- Create: `apps/api/src/modules/seatmaps/routes/seatmap.routes.ts`
- Create: `apps/api/src/modules/seatmaps/routes/seatmap.routes.spec.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Testes falhantes**

`apps/api/src/modules/seatmaps/routes/seatmap.routes.spec.ts` (unitário, in-memory — hoje as rotas não existem → 404 = red):

```ts
import {
  bestSeatResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import type { SeatmapEntity } from '../domain/seatmap-entity.js';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'available' },
            { label: '2', status: 'available' },
            { label: '3', status: 'available' },
          ],
        },
      ],
    },
    {
      slug: 'balcao',
      name: 'Balcão',
      priceFromCents: 19000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'available' },
            { label: '2', status: 'occupied' },
            { label: '3', status: 'available' },
          ],
        },
      ],
    },
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 15000,
      rows: [],
    },
  ],
};

describe('GET /events/:slug/seatmap', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp({ seatmapRepository: new InMemorySeatmapRepository([gig]) });
    return app.ready();
  });

  afterAll(() => app.close());

  it('returns the seatmap excluding sectors without rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/seatmap',
    });

    expect(response.statusCode).toBe(200);
    const body = seatmapResponseSchema.parse(response.json());
    expect(body.seatmap.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);
  });

  it('returns 404 event_not_found for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/seatmap',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});

describe('GET /events/:slug/best-seat', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp({ seatmapRepository: new InMemorySeatmapRepository([gig]) });
    return app.ready();
  });

  afterAll(() => app.close());

  it('returns the most central free seat of the first row', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body).toEqual({
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '2',
        priceFromCents: 12000,
      },
    });
  });

  it('skips the occupied seat near the center', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=balcao',
    });

    expect(response.statusCode).toBe(200);
    const body = bestSeatResponseSchema.parse(response.json());
    expect(body.seat.seatLabel).toBe('1');
  });

  it('returns 404 no_available_seat for a sector without rows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=pista',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'no_available_seat' });
  });

  it('returns 400 invalid_query when the sector param is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_query');
  });

  it('returns 404 sector_not_found for an unknown sector', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/gig/best-seat?sector=camarote',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'sector_not_found' });
  });

  it('returns 404 event_not_found for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/desconhecido/best-seat?sector=plateia',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });
});
```

- [ ] **Step 2: Rotas**

`apps/api/src/modules/seatmaps/routes/seatmap.routes.ts`:

```ts
import {
  bestSeatQuerySchema,
  bestSeatResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { FindBestSeatUseCase } from '../use-cases/find-best-seat.use-case.js';
import type { GetSeatmapUseCase } from '../use-cases/get-seatmap.use-case.js';

interface SeatmapRoutesDeps {
  getSeatmap: GetSeatmapUseCase;
  findBestSeat: FindBestSeatUseCase;
}

export function registerSeatmapRoutes(
  app: FastifyInstance,
  deps: SeatmapRoutesDeps,
): void {
  app.get('/events/:slug/seatmap', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const seatmap = await deps.getSeatmap.execute(slug);
    if (!seatmap) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const sectors = seatmap.sectors.filter((sector) => sector.rows.length > 0);
    const payload = seatmapResponseSchema.parse({
      seatmap: { eventSlug: seatmap.eventSlug, sectors },
    });
    return reply.send(payload);
  });

  app.get('/events/:slug/best-seat', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { sector?: string };
    const parsed = bestSeatQuerySchema.safeParse({ sector: query.sector ?? '' });
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const result = await deps.findBestSeat.execute(slug, parsed.data.sector);
    if (result.kind === 'event_not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (result.kind === 'sector_not_found') {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    if (result.kind === 'no_available_seat') {
      return reply.code(404).send({ error: 'no_available_seat' });
    }
    return reply.send(bestSeatResponseSchema.parse({ seat: result.seat }));
  });
}
```

- [ ] **Step 3: Wiring no `buildApp`**

`apps/api/src/app.ts`:

1. Imports (junto aos demais):

```ts
import type { SeatmapRepository } from './modules/seatmaps/domain/seatmap-repository.js';
import { DrizzleSeatmapRepository } from './modules/seatmaps/infra/drizzle-seatmap-repository.js';
import { registerSeatmapRoutes } from './modules/seatmaps/routes/seatmap.routes.js';
import { FindBestSeatUseCase } from './modules/seatmaps/use-cases/find-best-seat.use-case.js';
import { GetSeatmapUseCase } from './modules/seatmaps/use-cases/get-seatmap.use-case.js';
```

2. Na assinatura de `options`: `seatmapRepository?: SeatmapRepository;`
3. Após os repositórios existentes:

```ts
const seatmapRepository =
  options.seatmapRepository ?? new DrizzleSeatmapRepository(getDefaultDb());
```

4. Após `registerVenueRoutes`:

```ts
registerSeatmapRoutes(app, {
  getSeatmap: new GetSeatmapUseCase(seatmapRepository),
  findBestSeat: new FindBestSeatUseCase(seatmapRepository),
});
```

- [ ] **Step 4: Green + commit**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps
pnpm --filter @ticketvibe/api exec tsc --noEmit
pnpm --filter @ticketvibe/api exec vitest run
```

Esperado: 8 unitários novos + 9 da integração (Task 5) verdes, suíte api completa verde (89 → ~124).

```bash
git add -A && git commit -m "feat(api): expose seatmap and best-seat routes"
```

---

### Task 7: `seatsAvailable` por setor (deferred Story 9)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/index.spec.ts`
- Modify: `apps/api/src/modules/events/domain/event-entity.ts`
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.spec.ts`
- Modify: `apps/api/src/modules/events/routes/events.routes.integration.spec.ts`
- Modify: `apps/api/src/modules/events/use-cases/get-event-detail.use-case.spec.ts`

- [ ] **Step 1: Testes falhantes (shared)**

Em `packages/shared/src/index.spec.ts`, troque o `validSector` (linha 168) e acrescente testes no describe `sectorSchema`:

```ts
const validSector = {
  slug: 'plateia',
  name: 'Plateia',
  priceFromCents: 12000,
  seatsAvailable: 91,
};

// dentro do describe sectorSchema:
it('accepts a null seatsAvailable for sectors without a seat map', () => {
  expect(
    sectorSchema.parse({ ...validSector, seatsAvailable: null }).seatsAvailable,
  ).toBeNull();
});

it('rejects a negative seatsAvailable', () => {
  expect(() =>
    sectorSchema.parse({ ...validSector, seatsAvailable: -1 }),
  ).toThrow();
});
```

(Red garantido: o zod atual *stripa* a chave desconhecida — `.seatsAvailable` vira `undefined` e `toBeNull()` falha; com `-1` stripado, não lança.)

- [ ] **Step 2: Schema shared**

Em `packages/shared/src/index.ts`, `sectorSchema` (linha 75) vira:

```ts
export const sectorSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  priceFromCents: z.number().int().min(0),
  seatsAvailable: z.number().int().min(0).nullable(),
});
```

Rode `pnpm --filter @ticketvibe/shared exec vitest run` → verde (+2). A partir daqui o parse do `eventDetailResponseSchema` **exige** a chave — os testes de api que parseiam detalhe ficam red (confirmo no Step 3).

- [ ] **Step 3: Red no api**

```bash
pnpm --filter @ticketvibe/api exec vitest run src/modules/events
```

Esperado: falhas de parse (`seatsAvailable` ausente) em `events.routes.spec` e `events.routes.integration.spec` + falhas de typecheck nos fixtures de `EventDetailEntity` (rode `pnpm --filter @ticketvibe/api exec tsc --noEmit` para ver a lista completa).

- [ ] **Step 4: Entidade, contagem e mapper**

1. `event-entity.ts` — `SectorEntity` (linha 29):

```ts
export interface SectorEntity {
  slug: string;
  name: string;
  priceFromCents: number;
  seatsAvailable: number | null;
}
```

2. `drizzle-events-repository.ts` — imports de schema: acrescente `seatRows, seats`. Troque a query de setores do `findBySlug` (linhas 152-160) por:

```ts
const sectorRows = await this.db
  .select({
    slug: sectors.slug,
    name: sectors.name,
    priceFromCents: sectors.priceFromCents,
    availableCount: sql<number>`(count(${seats.id}) filter (where ${seats.status} = 'available'))::int`,
    totalCount: sql<number>`count(${seats.id})::int`,
  })
  .from(sectors)
  .leftJoin(seatRows, eq(seatRows.sectorId, sectors.id))
  .leftJoin(seats, eq(seats.rowId, seatRows.id))
  .where(eq(sectors.eventId, row.events.id))
  .groupBy(sectors.id, sectors.slug, sectors.name, sectors.priceFromCents)
  .orderBy(asc(sectors.priceFromCents), asc(sectors.slug));
```

E o retorno:

```ts
sectors: sectorRows.map((sector) => ({
  slug: sector.slug,
  name: sector.name,
  priceFromCents: sector.priceFromCents,
  seatsAvailable: sector.totalCount === 0 ? null : sector.availableCount,
})),
```

(`::int` é obrigatório: `count` volta como bigint/string sem cast. `totalCount === 0` cobre setores sem linhas → `null`.)

3. `events.routes.ts` — `toEventDetailDto` (linha 19):

```ts
sectors: entity.sectors.map((sector) => ({
  slug: sector.slug,
  name: sector.name,
  priceFromCents: sector.priceFromCents,
  seatsAvailable: sector.seatsAvailable,
})),
```

- [ ] **Step 5: Atualizar fixtures e expectativas (api)**

1. `events.routes.spec.ts` (linhas 70-71 e 234-237):

```ts
sectors: [
  { slug: 'pista', name: 'Pista', priceFromCents: 15000, seatsAvailable: null },
  { slug: 'camarote', name: 'Camarote', priceFromCents: 21000, seatsAvailable: 10 },
],
```

```ts
expect(body.event.sectors).toEqual([
  { slug: 'pista', name: 'Pista', priceFromCents: 15000, seatsAvailable: null },
  { slug: 'camarote', name: 'Camarote', priceFromCents: 21000, seatsAvailable: 10 },
]);
```

2. `get-event-detail.use-case.spec.ts` — fixtures:
   - stub fantasma: plateia `seatsAvailable: 91`, balcao `seatsAvailable: 39`
   - stub standup: pista `seatsAvailable: null`
   - fixture `unordered`: balcao 39, plateia 91
   - fixture `tied`: zona-b `null`, zona-a `null`
   (asserções são só de slug — mudam apenas os objetos.)

3. `events.routes.integration.spec.ts` — expectativa existente (linhas ~321-324):

```ts
expect(body.event.sectors).toEqual([
  { slug: 'antecamara', name: 'Antecâmara', priceFromCents: 12000, seatsAvailable: null },
  { slug: 'plateia', name: 'Plateia', priceFromCents: 12000, seatsAvailable: 91 },
  { slug: 'balcao', name: 'Balcão', priceFromCents: 19000, seatsAvailable: 39 },
]);
```

4. Novo teste no mesmo describe de integração:

```ts
it('returns seat availability per sector', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/events/o-fantasma-da-opera',
  });

  expect(response.statusCode).toBe(200);
  const body = eventDetailResponseSchema.parse(response.json());
  const availability = Object.fromEntries(
    body.event.sectors.map((sector) => [sector.slug, sector.seatsAvailable]),
  );
  expect(availability).toEqual({ plateia: 91, balcao: 39 });
});
```

- [ ] **Step 6: Green + commit**

```bash
pnpm --filter @ticketvibe/shared exec vitest run
pnpm --filter @ticketvibe/api exec vitest run
pnpm --filter @ticketvibe/api exec tsc --noEmit
git add -A && git commit -m "feat(api): expose seat availability per sector"
```

---

### Task 8: Disponibilidade no `EventDetail` (web)

**Files:**
- Modify: `apps/web/src/components/event-detail.tsx`
- Modify: `apps/web/src/components/event-detail.spec.tsx`
- Modify: `apps/web/src/lib/events-api.spec.ts`

- [ ] **Step 1: Testes falhantes**

`event-detail.spec.tsx` — fixture `evento.sectors` (linhas 27-28) vira:

```ts
sectors: [
  { slug: 'plateia', name: 'Plateia', priceFromCents: 12000, seatsAvailable: 91 },
  { slug: 'balcao', name: 'Balcão', priceFromCents: 19000, seatsAvailable: null },
],
```

Acrescente 2 testes no describe `EventDetail`:

```tsx
test('shows published seat availability per sector', () => {
  render(<EventDetail event={evento} />);

  expect(screen.getByText('91 lugares disponíveis')).toBeInTheDocument();
});

test('marks a sector as esgotado when no seats are left', () => {
  render(
    <EventDetail
      event={{
        ...evento,
        sectors: [
          { slug: 'plateia', name: 'Plateia', priceFromCents: 12000, seatsAvailable: 0 },
        ],
      }}
    />,
  );

  expect(screen.getByText('Esgotado')).toBeInTheDocument();
});
```

`events-api.spec.ts` — fixture de detalhe (linhas 37-40):

```ts
sectors: [
  { slug: 'plateia', name: 'Plateia', priceFromCents: 12000, seatsAvailable: 91 },
  { slug: 'camarote', name: 'Camarote', priceFromCents: 25000, seatsAvailable: null },
],
```

Rode `pnpm --filter @ticketvibe/web exec vitest run src/components/event-detail src/lib/events-api` → vermelho (texto ausente + parse da fixture).

- [ ] **Step 2: Implementar a linha**

Em `event-detail.tsx`, dentro do `li` do setor (linhas 106-111), substitua o bloco por:

```tsx
<span className="font-medium text-foreground">
  {sector.name}
</span>
<div className="flex items-center gap-3 text-sm">
  {sector.seatsAvailable !== null && (
    <span
      className={
        sector.seatsAvailable === 0
          ? 'font-medium text-destructive'
          : 'text-muted-foreground'
      }
    >
      {sector.seatsAvailable === 0
        ? 'Esgotado'
        : sector.seatsAvailable === 1
          ? '1 lugar disponível'
          : `${sector.seatsAvailable} lugares disponíveis`}
    </span>
  )}
  <span className="font-bold text-primary">
    {formatBRL(sector.priceFromCents)}
  </span>
</div>
```

- [ ] **Step 3: Green + commit**

```bash
pnpm --filter @ticketvibe/web exec vitest run src
pnpm --filter @ticketvibe/web exec tsc --noEmit
git add -A && git commit -m "feat(web): show seat availability on event sectors"
```

---

### Task 9: Proxies Next do seatmap e do best-seat

**Files:**
- Create: `apps/web/src/app/api/events/[slug]/seatmap/route.ts`
- Create: `apps/web/src/app/api/events/[slug]/seatmap/route.spec.ts`
- Create: `apps/web/src/app/api/events/[slug]/best-seat/route.ts`
- Create: `apps/web/src/app/api/events/[slug]/best-seat/route.spec.ts`

- [ ] **Step 1: Testes falhantes**

`apps/web/src/app/api/events/[slug]/seatmap/route.spec.ts` (espelho de `suggest/route.spec.ts`; falha na importação do `./route` = red):

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
import { GET } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

function request(slug: string) {
  return new Request(`http://localhost:3000/api/events/${slug}/seatmap`);
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

const validPayload = {
  seatmap: {
    eventSlug: 'o-fantasma-da-opera',
    sectors: [
      {
        slug: 'plateia',
        name: 'Plateia',
        priceFromCents: 12000,
        rows: [
          { label: 'A', seats: [{ label: '1', status: 'available' }] },
        ],
      },
    ],
  },
};

describe('GET /api/events/[slug]/seatmap', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('passes a valid seatmap through the schema', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/seatmap',
        () => HttpResponse.json(validPayload),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(200);
    expect((await res.json()).seatmap.eventSlug).toBe('o-fantasma-da-opera');
  });

  it('returns 404 when the event does not exist', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/seatmap',
        () => HttpResponse.json({ error: 'event_not_found' }, { status: 404 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('event_not_found');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/seatmap',
        () => HttpResponse.error(),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/seatmap',
        () => HttpResponse.json({ seatmap: { eventSlug: 'x', sectors: 'nope' } }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });
});
```

`apps/web/src/app/api/events/[slug]/best-seat/route.spec.ts`:

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
import { GET } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

function request(slug: string, sector?: string) {
  const query = sector ? `?sector=${encodeURIComponent(sector)}` : '';
  return new Request(
    `http://localhost:3000/api/events/${slug}/best-seat${query}`,
  );
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

describe('GET /api/events/[slug]/best-seat', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('returns 400 when the sector param is missing', async () => {
    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
  });

  it('passes a valid best seat through the schema', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () =>
          HttpResponse.json({
            seat: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '6',
              priceFromCents: 12000,
            },
          }),
      ),
    );

    const res = await GET(
      request('o-fantasma-da-opera', 'plateia'),
      context,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).seat.seatLabel).toBe('6');
  });

  it('passes the 404 error body through', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () =>
          HttpResponse.json({ error: 'no_available_seat' }, { status: 404 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera', 'plateia'), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('no_available_seat');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/best-seat',
        () => HttpResponse.error(),
      ),
    );

    const res = await GET(
      request('o-fantasma-da-opera', 'plateia'),
      context,
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });
});
```

- [ ] **Step 2: Implementar os proxies**

`apps/web/src/app/api/events/[slug]/seatmap/route.ts`:

```ts
import { seatmapResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type SeatmapContext = { params: Promise<{ slug: string }> };

export async function GET(
  _request: Request,
  context: SeatmapContext,
): Promise<Response> {
  const { slug } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/seatmap`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
  } catch (error) {
    console.error('Seatmap upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 404) {
    return Response.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!upstream.ok) {
    console.error(`Seatmap upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = seatmapResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Seatmap upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
```

`apps/web/src/app/api/events/[slug]/best-seat/route.ts`:

```ts
import { bestSeatQuerySchema, bestSeatResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type BestSeatContext = { params: Promise<{ slug: string }> };

export async function GET(
  request: Request,
  context: BestSeatContext,
): Promise<Response> {
  const { slug } = await context.params;
  const sector = new URL(request.url).searchParams.get('sector') ?? '';
  const parsed = bestSeatQuerySchema.safeParse({ sector });
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/best-seat?sector=${encodeURIComponent(parsed.data.sector)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
  } catch (error) {
    console.error('Best seat upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 404) {
    const body = await upstream.json();
    return Response.json(body, { status: 404 });
  }
  if (!upstream.ok) {
    console.error(`Best seat upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = bestSeatResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Best seat upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
```

- [ ] **Step 3: Green + commit**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/app/api
pnpm --filter @ticketvibe/web exec tsc --noEmit
git add -A && git commit -m "feat(web): proxy seatmap endpoints from next"
```

Esperado: 8 testes novos (4+4) verdes.

---

### Task 10: Componente `SeatMap` + página de ingressos

**Files:**
- Create: `apps/web/src/components/seat-map.tsx`
- Create: `apps/web/src/components/seat-map.spec.tsx`
- Modify: `apps/web/src/app/events/[slug]/ingressos/page.tsx`

- [ ] **Step 1: Testes falhantes**

`apps/web/src/components/seat-map.spec.tsx` (import dinâmico obrigatório pós `server.listen`):

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

const server = setupServer();

let SeatMap: typeof import('./seat-map').SeatMap;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ SeatMap } = await import('./seat-map'));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const seatmapPayload = {
  seatmap: {
    eventSlug: 'o-fantasma-da-opera',
    sectors: [
      {
        slug: 'plateia',
        name: 'Plateia',
        priceFromCents: 12000,
        rows: [
          {
            label: 'A',
            seats: [
              { label: '1', status: 'available' },
              { label: '2', status: 'occupied' },
              { label: '3', status: 'unavailable' },
            ],
          },
          {
            label: 'B',
            seats: [
              { label: '1', status: 'available' },
              { label: '2', status: 'available' },
              { label: '3', status: 'available' },
            ],
          },
        ],
      },
      {
        slug: 'balcao',
        name: 'Balcão',
        priceFromCents: 19000,
        rows: [
          {
            label: 'A',
            seats: [
              { label: '1', status: 'available' },
              { label: '2', status: 'available' },
            ],
          },
        ],
      },
    ],
  },
};

function useSeatmap() {
  server.use(
    http.get(
      /\/api\/events\/o-fantasma-da-opera\/seatmap$/,
      () => HttpResponse.json(seatmapPayload),
    ),
  );
}

describe('SeatMap', () => {
  it('renders sectors, rows and seat states', async () => {
    useSeatmap();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Cadeira 2, fila A' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cadeira 3, fila A' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Plateia' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/4 de 6 livres/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));
    expect(screen.getByRole('button', { name: 'Balcão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Cadeira 3, fila A' }),
    ).not.toBeInTheDocument();
  });

  it('selects a free seat and shows the summary', async () => {
    useSeatmap();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Você selecionou: Plateia · Fila A · Cadeira 1 · R$ 120,00',
    );
    expect(
      screen.getByRole('button', { name: 'Cadeira 1, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('clears the selection when switching sectors', async () => {
    useSeatmap();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );
    expect(await screen.findByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('picks the best available seat in one click', async () => {
    useSeatmap();
    server.use(
      http.get(/\/api\/events\/.+\/best-seat$/, () =>
        HttpResponse.json({
          seat: {
            sectorSlug: 'plateia',
            rowLabel: 'A',
            seatLabel: '1',
            priceFromCents: 12000,
          },
        }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Melhor lugar disponível' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Cadeira 1',
    );
  });

  it('warns when the sector has no free seats', async () => {
    useSeatmap();
    server.use(
      http.get(/\/api\/events\/.+\/best-seat$/, () =>
        HttpResponse.json({ error: 'no_available_seat' }, { status: 404 }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Melhor lugar disponível' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não há assentos livres neste setor.',
    );
  });

  it('shows an error when the seatmap request fails', async () => {
    server.use(
      http.get(/\/api\/events\/.+\/seatmap$/, () => HttpResponse.error()),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o mapa de assentos.',
    );
  });

  it('shows an empty state for events without numbered sectors', async () => {
    server.use(
      http.get(/\/api\/events\/.+\/seatmap$/, () =>
        HttpResponse.json({
          seatmap: { eventSlug: 'corrida-de-rua-sp', sectors: [] },
        }),
      ),
    );
    render(<SeatMap eventSlug="corrida-de-rua-sp" />);

    expect(
      await screen.findByText(
        'O mapa de assentos ainda não foi publicado para este evento.',
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Componente completo**

`apps/web/src/components/seat-map.tsx` (arquivo inteiro de uma vez — o teste cobre por comportamento):

```tsx
'use client';

import { seatmapResponseSchema, type SeatmapDto } from '@ticketvibe/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from 'cn';

import { Chip } from '@/components/chip';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';

interface SeatMapProps {
  eventSlug: string;
}

interface SelectedSeat {
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}

function LegendItem({
  swatch,
  label,
}: {
  swatch: ReactNode;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-hidden="true" className={cn('size-4 rounded border', swatch)} />
      {label}
    </li>
  );
}

export function SeatMap({ eventSlug }: SeatMapProps) {
  const [seatmap, setSeatmap] = useState<SeatmapDto | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bestPending, setBestPending] = useState(false);
  const [bestError, setBestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/events/${eventSlug}/seatmap`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.status === 404) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!response.ok) throw new Error('seatmap_request_failed');
        const payload = seatmapResponseSchema.parse(await response.json());
        if (!cancelled) {
          setSeatmap(payload.seatmap);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventSlug]);

  async function pickBestSeat(sectorSlug: string) {
    setBestPending(true);
    setBestError(null);
    try {
      const response = await fetch(
        `/api/events/${eventSlug}/best-seat?sector=${encodeURIComponent(sectorSlug)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        setBestError('Não há assentos livres neste setor.');
        return;
      }
      if (!response.ok) throw new Error('best_seat_request_failed');
      const payload = (await response.json()) as {
        seat: {
          sectorSlug: string;
          rowLabel: string;
          seatLabel: string;
          priceFromCents: number;
        };
      };
      const sector = seatmap?.sectors.find(
        (item) => item.slug === payload.seat.sectorSlug,
      );
      if (!sector) throw new Error('best_seat_unknown_sector');
      setActiveSlug(sector.slug);
      setSelected({
        sectorName: sector.name,
        rowLabel: payload.seat.rowLabel,
        seatLabel: payload.seat.seatLabel,
        priceFromCents: payload.seat.priceFromCents,
      });
    } catch {
      setBestError('Não foi possível escolher o melhor lugar agora.');
    } finally {
      setBestPending(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando mapa de assentos...
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o mapa de assentos.
      </p>
    );
  }

  if (!seatmap || seatmap.sectors.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        O mapa de assentos ainda não foi publicado para este evento.
      </p>
    );
  }

  const sector =
    seatmap.sectors.find((item) => item.slug === activeSlug) ??
    seatmap.sectors[0];
  const totalSeats = sector.rows.reduce(
    (sum, row) => sum + row.seats.length,
    0,
  );
  const availableSeats = sector.rows.reduce(
    (sum, row) =>
      sum + row.seats.filter((seat) => seat.status === 'available').length,
    0,
  );

  return (
    <section aria-label="Mapa de assentos" className="flex flex-col gap-6">
      <ul className="flex flex-wrap gap-2">
        {seatmap.sectors.map((item) => (
          <li key={item.slug}>
            <Chip
              label={item.name}
              selected={item.slug === sector.slug}
              onClick={() => {
                setActiveSlug(item.slug);
                setSelected(null);
                setBestError(null);
              }}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium text-foreground">
          {sector.name} · {formatBRL(sector.priceFromCents)} · {availableSeats}{' '}
          de {totalSeats} livres
        </p>
        <p className="text-xs text-muted-foreground">
          Fila A fica mais perto do palco.
        </p>
      </div>

      <ul className="flex flex-wrap gap-4">
        <LegendItem swatch="bg-secondary border-border" label="Livre" />
        <LegendItem
          swatch="bg-muted opacity-60"
          label="Ocupada"
        />
        <LegendItem
          swatch="bg-destructive/10 opacity-60"
          label="Indisponível"
        />
        <LegendItem swatch="bg-primary border-primary" label="Selecionada" />
      </ul>

      <div className="overflow-x-auto pb-2">
        <ul className="flex w-max flex-col gap-2">
          {sector.rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center gap-2"
            >
              <span className="w-6 shrink-0 text-xs font-medium text-muted-foreground">
                {row.label}
              </span>
              <div className="flex gap-1.5">
                {row.seats.map((seat) => {
                  const isSelected =
                    selected !== null &&
                    selected.rowLabel === row.label &&
                    selected.seatLabel === seat.label &&
                    selected.sectorName === sector.name;
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      disabled={seat.status !== 'available'}
                      aria-label={`Cadeira ${seat.label}, fila ${row.label}`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelected({
                          sectorName: sector.name,
                          rowLabel: row.label,
                          seatLabel: seat.label,
                          priceFromCents: sector.priceFromCents,
                        })
                      }
                      className={cn(
                        'size-8 shrink-0 rounded-md border text-xs font-medium transition-colors',
                        seat.status === 'available' &&
                          'bg-secondary border-border hover:border-primary',
                        seat.status === 'occupied' &&
                          'cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60',
                        seat.status === 'unavailable' &&
                          'cursor-not-allowed bg-destructive/10 text-muted-foreground opacity-60',
                        isSelected &&
                          'bg-primary text-primary-foreground border-primary',
                      )}
                    >
                      {seat.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={bestPending}
            onClick={() => pickBestSeat(sector.slug)}
          >
            {bestPending ? 'Escolhendo...' : 'Melhor lugar disponível'}
          </Button>
        </div>

        {bestError && (
          <p role="alert" className="text-sm text-destructive">
            {bestError}
          </p>
        )}

        <div aria-live="polite">
          {selected && (
            <p role="status" className="text-sm font-medium text-foreground">
              Você selecionou: {selected.sectorName} · Fila {selected.rowLabel}{' '}
              · Cadeira {selected.seatLabel} ·{' '}
              {formatBRL(selected.priceFromCents)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
```

Ajustes finos esperados (o lint/formatter manda):
- Confirme as classes utilitárias usadas (`bg-secondary`, `text-destructive`, `bg-destructive/10`) existindo no tema (as mesmas de `event-detail`/`login-form`).
- A asserção do spec `4 de 6 livres` bate com o fixture: plateia tem 6 cadeiras (A: 1 livre/1 ocupada/1 indisponível + B: 3 livres) → `availableSeats=4`, `totalSeats=6`.

- [ ] **Step 3: Página de ingressos**

Substitua `apps/web/src/app/events/[slug]/ingressos/page.tsx` inteiro:

```tsx
import type { EventDetailDto } from '@ticketvibe/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EventDetailError } from '@/components/event-detail';
import { Header } from '@/components/header';
import { SeatMap } from '@/components/seat-map';
import { fetchEventBySlug } from '@/lib/events-api';

export const instant = false;

type IngressosPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function IngressosPage({ params }: IngressosPageProps) {
  const { slug } = await params;

  let event: EventDetailDto | null;
  try {
    event = await fetchEventBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <EventDetailError />
        </main>
      </>
    );
  }

  if (!event) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <Link
            href={`/events/${slug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Voltar para o evento
          </Link>
          <h1 className="font-heading text-3xl font-bold">
            Escolha seu lugar
          </h1>
          <p className="text-muted-foreground">{event.title}</p>
        </div>
        <SeatMap eventSlug={slug} />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Green + commit**

```bash
pnpm --filter @ticketvibe/web exec vitest run src/components
pnpm --filter @ticketvibe/web exec tsc --noEmit
pnpm --filter @ticketvibe/web exec biome check src/components/seat-map.tsx src/app/events
```

Esperado: 7 testes novos verdes; se o Biome reclamar de formatação, rode `pnpm format` (biome check --write) e recommit.

```bash
git add -A && git commit -m "feat(web): render seat map with sector row seat selection"
```

---

### Task 11: E2E do mapa de assentos

**Files:**
- Create: `apps/web/tests/e2e/seatmap.spec.ts`
- Modify: `apps/web/tests/e2e/event.spec.ts`

- [ ] **Step 1: Testes E2E**

`apps/web/tests/e2e/seatmap.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('exibe o mapa e permite selecionar um assento livre', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await expect(
    page.getByRole('heading', { name: 'Escolha seu lugar' }),
  ).toBeVisible();

  const seat = page.getByRole('button', { name: 'Cadeira 6, fila A' });
  await expect(seat).toBeEnabled();
  await seat.click();

  await expect(page.getByRole('status')).toHaveText(
    'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
  );
  await expect(
    page.getByRole('button', { name: 'Cadeira 7, fila B' }),
  ).toBeDisabled();
});

test('escolhe o melhor lugar disponível com um clique', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page
    .getByRole('button', { name: 'Melhor lugar disponível' })
    .click();

  await expect(page.getByRole('status')).toHaveText(
    'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
  );
});

test('mostra o estado vazio para eventos sem mapa de assentos', async ({
  page,
}) => {
  await page.goto('/events/corrida-de-rua-sp/ingressos');

  await expect(
    page.getByText(
      'O mapa de assentos ainda não foi publicado para este evento.',
    ),
  ).toBeVisible();
});
```

Em `apps/web/tests/e2e/event.spec.ts`, no primeiro teste (após a asserção do heading de setores), acrescente:

```ts
await expect(page.getByText('91 lugares disponíveis')).toBeVisible();
```

- [ ] **Step 2: Rodar**

```bash
pnpm infra:up
pnpm --filter @ticketvibe/web exec playwright test seatmap event
```

Esperado: 5 testes passando (3 novos + 2 do `event.spec`). Se o `role="status"` do loading disputar com o do resumo, escope a asserção por texto parcial (`Você selecionou:`) — o retry do Playwright resolve na maioria dos casos.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(web): cover seat map selection end to end"
```

---

### Task 12: Gates completos + relatório final

- [ ] **Step 1: Bateria de gates (ordem exata do ticket 09)**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test
pnpm build
pnpm --filter @ticketvibe/api exec drizzle-kit check
```

Esperado:
- lint 0 erros; typecheck 5/5 workspaces; build ok; `drizzle-kit check` sem mudanças pendentes (migração 0005 já commitada na Task 1).
- Suítes: **api ≈ 124** (89 +35: seed +3, get-seatmap +3, best-seat +11, rotas unit +8, integração +9, disponibilidade +1), **web ≈ 147** (130 +17: event-detail +2, proxies +8, seat-map +7), **shared +9** (seatmap/bestSeat +7, seatsAvailable +2). Root/suíte de pacotes permanece 43. Reporte os totais **reais** no relatório — se divergirem muito (>3), investigue antes de fechar.
- Playwright: **21** (18 + 3).

- [ ] **Step 2: Verificação de higiene**

```bash
git status --short        # limpo, exceto nada
git log --oneline -12     # 10 commits feat/test + 1 commit docs (este plano)
```

Nenhum processo estranho rodando à mão (dev servers do Playwright morrem sozinhos); **não** rodar `pnpm infra:down`.

- [ ] **Step 3: Relatório final**

Reporte: saídas dos 6 gates com números, totais reais de teste por suíte, lista de arquivos alterados, os 10 commits feat/test, decisões relevantes tomadas na execução (D1–D7), deferrals novos (se houver) e o próximo passo (fechar a issue 10 + decidir push — push só com pedido explícito do usuário).

---

## Cobertura dos critérios do ticket

| Critério (`.scratch/ticketvibe/issues/10-...md`) | Tasks |
|---|---|
| 1. Schema locais com setores/filas/cadeiras + fixtures coerentes | Task 1 (schema, migração, fixtures 69/800, seed, reset, log) |
| 2. Endpoint REST disponibilidade+preço por assento (estado por cadeira) + Zod compartilhado | Task 2 (contratos), Task 5+6 (repos + rotas + DI), Task 7 (preço/disponibilidade por setor no detalhe) |
| 3. UI hierarquia setor→fila→cadeira com estados livre/ocupado/indisponível | Task 9 (proxies), Task 10 (componente + página) |
| 4. "Melhor lugar disponível" em 1 clique | Task 4 (regra + use case), Task 6 (endpoint), Task 10 (botão), Task 11 (E2E) |
| 5. Testes: integração da rota, unitários da regra, componente MSW, E2E | Task 1/5 (integração), Task 4/6 (unit), Task 10 (MSW), Task 11 (E2E) |

## Fora de escopo (deferrals)

- **Reserva/hold de assento** (Redis + TTL) — ticket 11.
- **Status em tempo real** (polling/WebSocket do mapa) — ticket 16.
- **Seleção de setor como fluxo de compra** na página de evento / carrinho — tickets 11/12.
- **Paginação/lazy-load** de setores com milhares de cadeiras — só se o volume exigir.
- **Storybook** para `SeatMap` (ingere dado remoto via fetch; spec MSW cobre).
- **README/envs novas** — nenhuma variável nova.
- Alterações em `playwright.config.ts`/`global-setup.ts` — proibido.

## Riscos e mitigações

1. **Números amarrados ao seed** (91/39/800/69, 'Cadeira 6'): qualquer mudança em `seatMapFixtures` ou `sectorFixtures` quebra teste de intenção — é de propósito; atualize teste + log juntos.
2. **`count(...)::int`**: sem cast, o Postgres devolve bigint→string e o contrato `z.number()` quebra. O `::int` já está no código acima — não remova.
3. **Zod strip vs required**: os red tests de `seatsAvailable` dependem de `.seatsAvailable`/`toThrow()` (strip faz o parse "passar" sem a chave — por isso asserções de valor, não de sucesso).
4. **Ordem das Tasks 5→6**: o verde real do `DrizzleSeatmapRepository` só acontece com as rotas registradas (Task 6). Não "adiante" wiring para forçar verde na Task 5 — o red de rota 404 é esperado.
5. **MSW + jsdom**: import dinâmico do componente pós `server.listen` é obrigatório (padrão `login-form.spec`); handler com regex relativa (`/\/api\/events\/.+\/seatmap$/`).
6. **Playwright `role="status"`**: loading e resumo usam o mesmo role sequencialmente — se flakar, troque a asserção por `getByText('Você selecionou:')`.
7. **Biome/lefthook**: pre-commit reformata; se o commit falhar, rode o fix sugerido pelo hook e recommit.

## Fontes do plano

- Issue: `.scratch/ticketvibe/issues/10-mapa-de-assentos-setor-fila-cadeira.md`
- Spec: `docs/superpowers/specs/ticketvibe.md` (Stories 9, 15–17, 22)
- Plano de referência (formato/gates): `docs/superpowers/plans/2026-10-13-ticket-09-login-com-google.md`
- Código âncora citado na seção "Fatos verificados" (linhas conferidas em 2026-10-15)
