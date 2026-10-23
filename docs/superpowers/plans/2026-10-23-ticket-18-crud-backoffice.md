# Ticket 18 — CRUD de eventos, locais, setores e lotes no backoffice — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador cria e edita pelo backoffice (`/organizador`) seus eventos, locais com setores/filas/cadeiras e lotes de preço com vigência — e esses dados alimentam a descoberta pública, a página do evento e o mapa de assentos do comprador.

**Architecture:** Novo repositório de domínio em `modules/organizer/` (port + drizzle + in-memory) sobre as tabelas existentes, com coluna de dono `events.organizer_id` (null = dados da plataforma do seed: leitura para todos, escrita restrita) e tabela nova `price_lots` (vigência por setor). O preço efetivo que o comprador vê passa a ser `lote ativo agora ?? sectors.price_from_cents` (coalesce nas queries de seatmap/detail/repositório de eventos), e `events.price_from_cents` é recalculado como o mínimo dos preços efetivos dos setores após cada escrita de setor/lote. No web, páginas client-side sob o layout protegido do ticket 17 conversam com `src/app/api/organizer/[...all]/route.ts` (proxy com cookie, mesma gramática do proxy de auth).

**Tech Stack:** drizzle-kit (migração única), Fastify 5 + Zod compartilhado (`@ticketvibe/shared`), Better Auth session + `guardOrganizer` (ticket 17), Next App Router client components, MSW (specs de componente), Playwright (helpers existentes).

**Spec:** `.scratch/ticketvibe/issues/18-crud-de-eventos-locais-setores-e-lotes.md` + `.scratch/ticketvibe/spec.md` (histórias 37–39; F4)

## Global Constraints

- Idioma português; commits Conventional em inglês, imperativo; nada de `--no-verify`.
- Sem comentários de código.
- Testes API/web em pt-BR; **exceção:** `packages/shared/src/index.spec.ts` continua em inglês.
- Migração única do ticket por `pnpm --filter @ticketvibe/api db:generate` (drizzle-kit é a fonte do SQL; último índice é `0012`; nova deve ser `0013`); `pnpm --filter @ticketvibe/api db:migrate` + `pnpm exec drizzle-kit check` limpo.
- Sem nova dependência em nenhum package; não tocar em `playwright.config.ts`/`global-setup.ts`/`.github/`; `pnpm infra:down` PROIBIDO.
- `guardOrganizer` é a primeira barreira de toda rota nova (401 sem sessão, 403 anônimo/comprador) — a ordem com a checagem de dono é guarda → permissão.
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test --force`, `pnpm --filter @ticketvibe/web test:e2e`, `pnpm build`.

## Review Focus

1. **Lote sobreposto no mesmo setor:** criar/ajustar um lote que cruza outro (janela `starts_at/ends_at`) deve falhar com 409 e nunca deixar duas vigências ativas — **teste:** Task 4 (integração: segundo lote sobreposto → `lot_overlaps`, e o preço do map resolve pelo vigente).
2. **Edição de dado da plataforma por outro organizador:** `PATCH`/`DELETE` em evento `organizer_id null` → 403 (não 404 que esconde o dado); leitura/listação mostra com selo `platform` — **teste:** Task 2 (integração: organizador B tenta editar evento da plataforma → 403).
3. **Delete com vendas:** excluir evento/fila/setor referenciado por pedidos → 409 com corpo claro (`event_has_orders` / `row_has_orders` / `sector_has_orders`), nunca 500 por violação de FK — **testes:** Task 2 (evento) e Task 3 (fila/setor), fixtures com `order_items` reais.
4. **Vigência invertida ou com campo faltando:** `endsAt <= startsAt` ou datas inválidas → 400 de validação de schema, sem escrita parcial — **teste:** Task 4 (integração: lote com fim antes do início → 400 `invalid_period`).
5. **Geração de cadeiras por fila:** `seatCount` de 1 até o teto gera labels `'1'..'N'` com posição estável e contagem correta no mapa público (`seatsTotal`) — **teste:** Task 3 (integração do criador de setores: 1 e N cadeiras; contagem no detail).

---

### Task 1: Migração de dono e lotes + schemas compartilhados do backoffice

**Files:**
- Modify: `apps/api/src/db/schema.ts` (tabelas `events`, nova `price_lots`)
- Create: `apps/api/drizzle/0013_<slug_gerado>.sql` (via drizzle-kit generate)
- Modify: `packages/shared/src/index.ts` (EOF)
- Test: `packages/shared/src/index.spec.ts`

**Interfaces:**
- Consumes: tabela `events`/`sectors` existentes; convenções do schema (`uuid().defaultRandom()`, `timestamp withTimezone mode 'date'`).
- Produces (consumido por Tasks 2–4, 5–8):

```ts
// apps/api/src/db/schema.ts (acréscimos)
events: organizerId: text('organizer_id').references(() => user.id), // null = plataforma
price_lots: pgTable('price_lots', {
  id: uuid().defaultRandom().primaryKey(),
  sectorId: uuid('sector_id').notNull().references(() => sectors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => [index('price_lots_sector_id_starts_at_idx').on(t.sectorId, t.startsAt)]);
```

Schemas compartilhados (no fim de `packages/shared/src/index.ts`, reutilizando `categorySchema`/`venueSchema` já exportados):

```ts
organizerEventCreateSchema: { title: trim min(3) max(120), description: trim min(10) max(2000), categorySlug: min(1), venueSlug: min(1), startsAt: z.iso.datetime() }
organizerVenueCreateSchema: { name: trim min(3) max(120), city: trim min(2) max(60), state: trim length(2) transform toUpperCase }
organizerSectorCreateSchema: { name: trim min(1) max(60), priceFromCents: int min(0), rows: array({ label: trim min(1) max(10), seatCount: int min(1) max(200) }).min(1).max(60) }
organizerRowCreateSchema: { label: trim min(1) max(10), seatCount: int min(1) max(200) }
organizerLotCreateSchema: { name: trim min(1) max(60), priceCents: int min(0), startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }
organizerEventDtoSchema: { id: z.uuid(), slug, title, description, category: categorySchema, venue: venueSchema, startsAt: z.iso.datetime(), priceFromCents: int min(0), platform: z.boolean() }
organizerSeatRowDtoSchema: { id: z.uuid(), label, seatCount: int min(0) }
organizerLotDtoSchema: { id: z.uuid(), name, priceCents, startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }
organizerSectorDtoSchema: { id: z.uuid(), slug, name, priceFromCents, seatsTotal: int min(0), rows: array(organizerSeatRowDtoSchema), lots: array(organizerLotDtoSchema) }
organizerEventDetailSchema: organizerEventDtoSchema.extend({ sectors: array(organizerSectorDtoSchema) })
organizerEventListResponseSchema: { events: array(organizerEventDtoSchema) }
organizerVenueDtoSchema: { id: z.uuid(), slug, name, city, state }
organizerVenueListResponseSchema: { venues: array(organizerVenueDtoSchema) }
organizerEventResponseSchema: { event: organizerEventDtoSchema }
organizerEventDetailResponseSchema: { event: organizerEventDetailSchema }
organizerVenueResponseSchema: { venue: organizerVenueDtoSchema }
```

Tipos TS exportados (`z.infer`/`z.input` dos schemas acima, nomes fixos que a web consome): `OrganizerEventDto`, `OrganizerEventDetailDto` (de `organizerEventDetailSchema`), `OrganizerSeatRowDto`, `OrganizerLotDto`, `OrganizerSectorDto`, `OrganizerVenueDto`, `OrganizerEventCreate`, `OrganizerVenueCreate`, `OrganizerSectorCreate`, `OrganizerRowCreate`, `OrganizerLotCreate`.
```

- [ ] **Step 1: Testes que falham (inglês, arquivo existente em EN)** — `packages/shared/src/index.spec.ts`: cada schema novo recebe pelo menos um caso de parse válido e um caso de rejeição (ex.: `organizerSectorCreateSchema` rejeita `rows: []`, `seatCount: 0`; `organizerLotCreateSchema` rejeita datas não-ISO; `organizerVenueCreateSchema` transforma `state` para maiúscula).
- [ ] **Step 2:** `pnpm --filter @ticketvibe/shared test` → novos casos RED por falta dos schemas → adicionar os schemas → PASS.
- [ ] **Step 3: Migração:** `pnpm --filter @ticketvibe/api db:generate` → `0013_*.sql` (coluna `organizer_id` + tabela `price_lots`); aplicar com `db:migrate`; `cd apps/api && pnpm exec drizzle-kit check` → limpo.
- [ ] **Step 4:** `pnpm --filter @ticketvibe/api test` → suíte verde (nenhum consumidor quebrado: `organizerId` é opcional).
- [ ] **Step 5:** Commit `feat(api): add organizer ownership and price lots schema`

---

### Task 2: CRUD de eventos do organizador (dono + plataforma)

**Files:**
- Create: `apps/api/src/modules/organizer/domain/organizer-repository.ts`
- Create: `apps/api/src/modules/organizer/domain/slugify.ts`
- Create: `apps/api/src/modules/organizer/infra/in-memory-organizer-repository.ts`
- Create: `apps/api/src/modules/organizer/infra/drizzle-organizer-repository.ts`
- Create: `apps/api/src/modules/organizer/use-cases/{list-organizer-events,get-organizer-event-detail,create-event,update-event,delete-event}.use-case.ts` (+ `.spec.ts` cada)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.ts` (novas rotas; `deps` ganha `organizerRepository`)
- Modify: `apps/api/src/app.ts` (construir o repositório drizzle e injetar)
- Test: `apps/api/src/modules/organizer/routes/organizer.routes.spec.ts` (extensão)
- Test: `apps/api/src/modules/organizer/routes/organizer.routes.integration.spec.ts` (extensão)

**Interfaces:**
- Consumes: `guardOrganizer`, `GetSessionFn` (Task 17); `organizerEvent*` schemas (Task 1); infra real de teste (postgres).
- Produces (porte do repositório — Tasks 3–4 adicionam métodos; Tasks 5–8 nada além de HTTP):

```ts
// domain/organizer-repository.ts
export interface OrganizerEventRecord {
  id: string; slug: string; title: string; description: string;
  categoryId: string; categorySlug: string; categoryName: string;
  venueId: string; venueSlug: string; venueName: string;
  startsAt: Date; priceFromCents: number; organizerId: string | null;
}
export interface OrganizerSectorRecord {
  id: string; slug: string; name: string; priceFromCents: number; seatsTotal: number;
  rows: { id: string; label: string; seatCount: number }[];
  lots: { id: string; name: string; priceCents: number; startsAt: Date; endsAt: Date }[];
}
export interface OrganizerRepository {
  listEventsForOrganizer(userId: string): Promise<OrganizerEventRecord[]>;       // organizer_id = :user OR organizer_id IS NULL (ordem startsAt asc)
  findEventForOrganizer(input: { eventId: string; userId: string }):
    Promise<{ kind: 'ok'; event: OrganizerEventRecord } | { kind: 'not_found' } | { kind: 'forbidden' }>; // forbidden = evento de outro dono; evento da plataforma (null) entra como 'ok'
  createEvent(input: { title: string; description: string; categorySlug: string; venueSlug: string; startsAt: Date; organizerId: string }):
    Promise<{ kind: 'ok'; event: OrganizerEventRecord } | { kind: 'category_not_found' } | { kind: 'venue_not_found' }>;
  updateEvent(input: { eventId: string; userId: string; title: string; description: string; categorySlug: string; venueSlug: string; startsAt: Date }):
    Promise<{ kind: 'ok'; event: OrganizerEventRecord } | { kind: 'not_found' } | { kind: 'forbidden' } | { kind: 'category_not_found' } | { kind: 'venue_not_found' }>;
  deleteEvent(input: { eventId: string; userId: string }):
    Promise<'ok' | 'not_found' | 'forbidden' | 'has_orders'>;
}
// detalhe de rotas da Task 2 resolve setores como lista vazia: OrganizerSectorRecord[] vazio
// `deleteEvent` apaga em cascata setores→filas→cadeiras→lotes (FKs existentes), depois o evento
```

- `domain/slugify.ts`: `export function slugify(value: string): string` (NFD → strip diacríticos → lowercase → não-alfanumérico → `-` → sem dashes duplicados/nas pontas). Unicidade de slug é responsabilidade do repositório drizzle (loop com sufixo `-2`, `-3`, ...); o in-memory espelha a semântica num Map.
- `createEvent` cria com `priceFromCents: 0` (recalc entra na Task 3 quando houver setores).
- Slug é gerado uma vez e nunca muda no `updateEvent` (renomear é mudança de `title` apenas).
- Rotas (todas atrás de `guardOrganizer`; guarda → permissão; nomes de erro fixados):
  - `GET /organizer/events` → 200 `organizerEventListResponseSchema`
  - `POST /organizer/events` → 201 `organizerEventResponseSchema`; `category_not_found`/`venue_not_found` → 404
  - `GET /organizer/events/:id` → 200 `organizerEventDetailResponseSchema` (detail carry `sectors: []` nesta task — editor completa na Task 3); `not_found` → 404; `forbidden` → 403
  - `PATCH /organizer/events/:id` → 200 (mesma semântica)
  - `DELETE /organizer/events/:id` → `ok` → 200; `has_orders` → 409 `{ error: 'event_has_orders' }`
- Body de PATCH usa `organizerEventCreateSchema` (campos completos, form de edição guarda tudo).

- [ ] **Step 1: Tests RED (unit)** — specs por use-case com o in-memory: listagem misturando próprio + plataforma ordenada por data; create/valida category e venue inexistentes; update é decidido por `findEventForOrganizer`; delete com pedidos → `has_orders`.
- [ ] **Step 2:** `pnpm vitest run src/modules/organizer` → RED (módulos faltando).
- [ ] **Step 3:** Implementar port + slugify + in-memory + use-cases → unit GREEN.
- [ ] **Step 4: Tests RED (integration)** — extensões do `organizer.routes.integration.spec.ts` (padrão ticket 17: fixtures de `user`/`events` direto no BD):
  - "organizador lista próprios eventos e os da plataforma" (3 eventos: 2 próprios de donos distintos + 1 plataforma; resposta marca `platform`)
  - "organizador cria evento e slug único para título repetido" (POST 2× mesmo título → 201 com slugs distintos)
  - "organizador edita evento próprio" (PATCH → 200 + persistência)
  - "dados da plataforma são de leitura" (PATCH/DELETE em `organizer_id = null` → 403)
  - "outro organizador não acessa evento alheio" (GET/PATCH/DELETE de evento de outro dono → 403)
  - "evento com pedidos não é excluído" (DELETE com fixture de `orders` → 409 `event_has_orders`; sem pedidos → 200 e setores removidos)
  - "guard primeiro": comprador → 403, sem sessão → 401 (fast path das rotas novas)
- [ ] **Step 5:** Implementar rotas + wiring de `app.ts` + drizzle repo (inclui checagem `has_orders` por `select count` de `orders` antes do delete) → integration GREEN.
- [ ] **Step 6:** `pnpm --filter @ticketvibe/api test` verde; `pnpm --filter @ticketvibe/api typecheck` limpo.
- [ ] **Step 7:** Commit `feat(api): add organizer event crud with ownership`

---

### Task 3: CRUD de locais, setores, filas e cadeiras

**Files:**
- Modify: `apps/api/src/modules/organizer/domain/organizer-repository.ts` (novos métodos)
- Modify: `apps/api/src/modules/organizer/infra/{in-memory,drizzle}-organizer-repository.ts`
- Create: `apps/api/src/modules/organizer/use-cases/{list-venues,create-venue,update-venue,create-sector,delete-sector,create-row,delete-row}.use-case.ts` (+ `.spec.ts` cada)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.ts` + `apps/api/src/app.ts` (sem mudanças — deps já existem)
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts` (detail de setores: preço vigente — só o coalesce, Task 4 conclui; aqui fica `priceFromCents` normal)
- Test: `packages/shared` nada; `apps/api/src/modules/organizer/use-cases/*` + integração de rotas (extensões)

**Interfaces:**
- Consumes: port e infra da Task 2; `organizerVenueCreateSchema`, `organizerSectorCreateSchema`, `organizerRowCreateSchema` (Task 1).
- Produces (acréscimos ao port):

```ts
export interface OrganizerVenueRecord { id: string; slug: string; name: string; city: string; state: string; }
export interface CreateSectorInput {
  eventId: string; userId: string; name: string; priceFromCents: number;
  rows: { label: string; seatCount: number }[];
}
export interface OrganizerRepository {
  listVenues(): Promise<OrganizerVenueRecord[]>;                                  // catálogo compartilhado, ordem name asc
  findVenue(venueId: string): Promise<OrganizerVenueRecord | null>;
  createVenue(input: { name: string; city: string; state: string }): Promise<OrganizerVenueRecord>;
  updateVenue(input: { venueId: string; name: string; city: string; state: string }): Promise<OrganizerVenueRecord | null>;
  createSector(input: CreateSectorInput):
    Promise<{ kind: 'ok'; sector: OrganizerSectorRecord } | { kind: 'not_found' } | { kind: 'forbidden' } | { kind: 'label_conflict' }>; // cria setor + filas + cadeiras em transação; slug de setor a partir do name; 'label_conflict' = slug/fila duplicada no evento
  deleteSector(input: { sectorId: string; userId: string }):
    Promise<'ok' | 'not_found' | 'forbidden' | 'has_orders'>;                     // has_orders = alguma cadeira do setor em order_items
  createRow(input: { sectorId: string; userId: string; label: string; seatCount: number }):
    Promise<...mesmo discriminante de createSector...>;
  deleteRow(input: { rowId: string; userId: string }): Promise<'ok' | 'not_found' | 'forbidden' | 'has_orders'>;
}
```

- Detalhe fixado: criação de fila gera `seatCount` cadeiras com `label` `'1'..'N'` e `position 1..N`; `seatsTotal` do setor é `sum(seatCount)`.
- Permissões derivadas: `sectorId`/`rowId` → `sectors.event_id` → `organizer_id` (regra igual à Task 2: null é leitura para todos, escrita 403).
- Delete de fila/setor com cadeiras vendidas → 409 `row_has_orders`/`sector_has_orders` (checagem por `order_items.seat_id` antes do remove; sem pedidos, delete de filas/setores apagam cadeiras em cascata do repositório).
- Rotas: `GET /organizer/venues`, `POST /organizer/venues`, `PATCH /organizer/venues/:id`; `POST /organizer/events/:id/sectors`; `DELETE /organizer/sectors/:sectorId`; `POST /organizer/sectors/:sectorId/rows`; `DELETE /organizer/rows/:rowId`; mapeamento de erros igual à Task 2 (`label_conflict` → 409 `{ error: 'row_label_conflict' }`, `has_orders` → `row_has_orders`/`sector_has_orders`).
- Ao criar/deletar setor com sucesso, o repositório recalcula `events.price_from_cents` (min dos preços base dos setores; sem setores → mantém o valor anterior) — novo método do port, reutilizado pela Task 4: `recalculateEventPriceFrom(eventId: string): Promise<void>`.

- [ ] **Step 1: Tests RED (unit)** — specs com in-memory: geração de cadeiras (1 e N), `label_conflict` por fila duplicada, deletes com/sem pedidos, recalc de `priceFromCents` do evento após setor criado/deletado (0 → min).
- [ ] **Step 2:** `pnpm vitest run src/modules/organizer` → RED → implementar → GREEN.
- [ ] **Step 3: Tests RED (integration)** — extensões do spec de rotas:
  - "catálogo de locais é compartilhado" (GET lista; POST cria; PATCH renomeia mantendo o slug)
  - "setor com filas e cadeiras é criado" (POST setor com rows `[{label:'A',seatCount:3},{label:'B',seatCount:1}]` → detail traz 2 filas, `seatsTotal: 4`, status do price base e evento `price_from_cents` recalculado no BD)
  - "fila nova e fila não entre" (POST row com label 'A' repetida → 409 `row_label_conflict`)
  - "fila com cadeiras vendidas não é excluída" (fixture `order_items` → 409; sem vendas → 200 e cadeiras somem)
  - "setor de outro organizador é 403" (POST row / DELETE setor via id de evento alheio e evento da plataforma)
- [ ] **Step 4:** Implementar demais repositórios/rotas → integration GREEN.
- [ ] **Step 5:** `pnpm --filter @ticketvibe/api test` verde; typecheck.
- [ ] **Step 6:** Commit `feat(api): add backoffice venues sectors and rows crud`

---

### Task 4: Lotes com vigência + preço efetivo no fluxo do comprador

**Files:**
- Modify: `apps/api/src/modules/organizer/domain/organizer-repository.ts` (+3 métodos)
- Modify: `apps/api/src/modules/organizer/infra/{in-memory,drizzle}-organizer-repository.ts`
- Create: `apps/api/src/modules/organizer/use-cases/{create-lot,update-lot,delete-lot}.use-case.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts` (getSeatmap, findSeatByCoords, findHoldsByUser)
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts` (findBySlug: coalesce no detail dos setores)
- Test: `apps/api/src/modules/organizer/use-cases/*` + integrações (extensões)
- Test: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.integration.spec.ts` (extensão)

**Interfaces:**
- Consumes: port/infra das Tasks 2–3; `organizerLotCreateSchema` (Task 1); tabelas `price_lots`.
- Produces:

```ts
export interface OrganizerLotRecord { id: string; name: string; priceCents: number; startsAt: Date; endsAt: Date; }
// no OrganizerRepository:
listLotsBySector(sectorId: string): Promise<OrganizerLotRecord[]>;                // ordem startsAt asc
findLotForOrganizer(input: { lotId: string; userId: string }):
  Promise<{ kind: 'ok'; lot: OrganizerLotRecord & { sectorId: string } } | { kind: 'not_found' } | { kind: 'forbidden' }>;
createLot(input: { sectorId: string; userId: string; name: string; priceCents: number; startsAt: Date; endsAt: Date }):
  Promise<{ kind: 'ok'; lot: OrganizerLotRecord } | { kind: 'not_found' } | { kind: 'forbidden' } | { kind: 'overlapping' } | { kind: 'invalid_period' }>;
updateLot(input: { lotId: string; userId: string } & Omit par→mesmos campos de criação):
  Promise<...mesmo discriminante de createLot...>;
deleteLot(input: { lotId: string; userId: string }): Promise<'ok' | 'not_found' | 'forbidden'>;
```

- Regras fixadas:
  - `invalid_period`/`lot_overlaps` são resolvidos em camadas distintas: schema Zod + use-case rejeitam `endsAt <= startsAt` com 400 `{ error: 'invalid_period' }`; sobreposição é do repositório drizzle (SQL transactional `overlaps (starts_at, ends_at)` por setor) com 409 `{ error: 'lot_overlaps' }`.
  - **Preço efetivo do comprador** = `coalesce(lote ativo (starts_at <= now() < ends_at, mais recente por starts_at), sectors.price_from_cents)` — aplicar em `get-seatmap` (preço por setor), `find-seat-by-coords`, `find-holds-by-user` e no detail de setores de `drizzle-events-repository.findBySlug`. O SQL usa lateral/exists com `order by starts_at desc limit 1` para determinismo.
  - `recalculateEventPriceFrom` (recalc de `events.price_from_cents`, Task 3) passa a considerar lotes: `min(preço efetivo por setor)`; chamado após create/update/delete de setor **e** create/update/delete de lote.
  - Rotas: `POST /organizer/sectors/:sectorId/lots`, `PATCH /organizer/lots/:lotId`, `DELETE /organizer/lots/:lotId`, com mapeamento dos discriminantes (400/403/404/409) como nas anteriores.

- [ ] **Step 1: Tests RED (unit)** — specs com in-memory: `invalid_period`, sobreposição por janela em listLots (in-memory replica a regra), delete não altera preço de outros lotes, `recalculateEventPriceFrom` usa lote ativo.
- [ ] **Step 2:** `pnpm vitest run src/modules/organizer` → RED → implementar use-cases/in-memory → GREEN.
- [ ] **Step 3: Tests RED (integration)** — rotas: criar lote válido 201; sobreposição → 409 `lot_overlaps`; `endsAt <= startsAt` → 400 `invalid_period`; PATCH/DELETE de lote e recalc no BD (`events.price_from_cents` após lote caro somir).
- [ ] **Step 4: Tests RED (buyer side)** — `drizzle-seatmap-repository.integration.spec.ts` com evento+setor base `10000` e lotes: passado `8000` (não ativo), futuro, **lote ativo `12000`**: getSeatmap traz `priceFromCents: 12000`; remove o lote ativo (SQL) → volta `10000`. Extender também o spec de integração do evento (`events.routes.integration.spec.ts` → detail setores com preço vigente).
- [ ] **Step 5:** Implementar drizzle repo (rotas, coalesce, recalc) → GREEN.
- [ ] **Step 6:** `pnpm --filter @ticketvibe/api test` verde; typecheck.
- [ ] **Step 7:** Commit `feat(api): add price lots with validity and effective buyer pricing`

---

### Task 5: Web — proxy do organizer + listagem/criação de eventos

**Files:**
- Create: `apps/web/src/app/api/organizer/[...all]/route.ts`
- Create: `apps/web/src/lib/organizer-api.ts`
- Modify: `apps/web/src/app/organizador/page.tsx` → passa a renderizar a área: painel ganha link "Meus eventos"; NÃO alterar layout/guard (ticket 17)
- Create: `apps/web/src/app/organizador/eventos/page.tsx` (listagem)
- Create: `apps/web/src/app/organizador/eventos/novo/page.tsx` (form de criar)
- Modify: `apps/web/src/components/header-search.tsx`? NÃO. Modify nada além dos listados.
- Test: `apps/web/src/app/api/organizer/[...all]/route.spec.ts`
- Test: `apps/web/src/app/organizador/eventos/page.spec.tsx`
- Test: `apps/web/src/app/organizador/eventos/novo/page.spec.tsx`

**Interfaces:**
- Consumes: rota `GET /api/organizer/*` da API; `authClient.useSession()` layout guard (ticket 17); `fetchCategories`/`fetchEvents`/`fetchVenues`? — **usa `lib/events-api.ts` apenas par categories** (venues vêm do organizar API novo).
- Produces:

```ts
// apps/web/src/lib/organizer-api.ts
export function fetchOrganizerEvents(): Promise<OrganizerEventDto[]>
export function fetchOrganizerEvent(id: string): Promise<OrganizerEventDetailDto>
export function createOrganizerEvent(input: OrganizerEventCreate): Promise<OrganizerEventDto>
export function updateOrganizerEvent(id: string, input: OrganizerEventCreate): Promise<OrganizerEventDto>
export function fetchOrganizerVenues(): Promise<OrganizerVenueDto[]>
export function createOrganizerVenue(input: OrganizerVenueCreate): Promise<OrganizerVenueDto>
export function updateOrganizerVenue(id: string, input: OrganizerVenueCreate): Promise<OrganizerVenueDto>
// todas via fetch('/api/organizer/...') com cookies implícitos; lançam Error com message amigável pt-BR derivadas dos corpos { error }
```

- Proxy `api/organizer/[...all]/route.ts`: repete o padrão do proxy de auth (method GET/POST/PATCH/DELETE, body text, cookie forward, `cache: 'no-store'`, `AbortSignal.timeout(3000)`): upstream `API_URL/organizer/<path>`; erro de rede → 502; `!upstream.ok` → relança o body do upstream com o status (mesmo comportamento do auth proxy — **sem parse de contrato**, validação fica na API); `ok` → JSON direto.

- [ ] **Step 1: Test RED (proxy)** — `route.spec.ts`: repassa método/body/cookie; 502 na queda; `!ok` relança erro e status (ex.: 403 `not_organizer`).
- [ ] **Step 2:** rodar spec → RED → implementar proxy → GREEN.
- [ ] **Step 3: Tests RED (componentes)** — specs MSW (padrão auth-menu):
  - listagem: cards de eventos (título, data/venue, `platform` chip "Da plataforma"), estado de erro pt-BR "Não foi possível carregar seus eventos." e vazio "Nenhum evento cadastrado ainda." com CTA criar.
  - novo: selects de categoria (via `fetchCategories`) e locais (via `fetchOrganizerVenues`, com link "Cadastrar local" → `/organizador/locais`), campos title/description/datetime → submit createOrganizerEvent → `router.push(/organizador/eventos/<id>)`; erro de validação mostrado.
- [ ] **Step 4:** Implementar páginas + `organizer-api.ts` → GREEN (`pnpm --filter @ticketvibe/web test`).
- [ ] **Step 5:** Atualizar o painel `/organizador` (tabela de atalhos: Painel, Meus eventos, Locais — link novo existe a partir da Task 5/7).
- [ ] **Step 6:** typecheck + `pnpm --filter @ticketvibe/web test` verde.
- [ ] **Step 7:** Commit `feat(web): add organizer events list and creation`

---

### Task 6: Web — edição do evento + setores/filas/lotes no backoffice

**Files:**
- Create: `apps/web/src/app/organizador/eventos/[id]/page.tsx` (form de edição + setor/listagem de setores)
- Create: `apps/web/src/components/organizer-sector-editor.tsx` (setores: criar com rows, add/delete row, criar/deletar lotes)
- Modify: `apps/web/src/lib/organizer-api.ts` (+createSector/createRow/deleteRow/createLot/updateLot/deleteLot, tolerando erros 409/400)
- Test: `apps/web/src/components/organizer-sector-editor.spec.tsx`
- Test: `apps/web/src/app/organizador/eventos/[id]/page.spec.tsx`

**Interfaces:**
- Consumes: `organizerSectorDtoSchema`, `organizerLot*` schemas; use-case de edição do evento (`updateOrganizerEvent`) da Task 5.
- Produces: `OrganizerSectorEditor({ event, onChanged }?: os props exatos saem do uso no page)` e mensagens fixas:
  - criar setor: título "Criar setor"; campos nome, preço base (formatação BRL com `lib/format.ts` existente), filas dinâmicas (`label`, `seatCount`); erros de 409 `row_label_conflict`/`seat label` pt-BR; sucesso recarrega via `fetchOrganizerEvent(id)`.
  - lotes: por setor, lista com nome/preço/vigência (formato período curto), botão deletar; form "Criar lote"; 409 `lot_overlaps` → "Setor já tem um lote nesse período."
  - filas: add row e delete row (botão com `aria-label` `Excluir fila <label>`); 409 `has_orders` → "Há ingressos vendidos nessa fila."
  - evento: form de edição (`PATCH`) com título/descrição/categoria/local/data; sem edit de slug (rotulado "URL é fixada no primeiro cadastro: /events/<slug>").

- [ ] **Step 1: Tests RED (MSW)** — flows: render carga (setores, filas com contagem, lotes com vigência), criar setor com 2 filas (POST com rows), criar/deletar lote, add/delete fila, 409 → mensagens pt-BR acima; salvar edição do evento (PATCH body completo).
- [ ] **Step 2:** `pnpm --filter @ticketvibe/web test` → RED → implementar page + editor + add/remove métodos no `organizer-api.ts` → GREEN.
- [ ] **Step 3:** `pnpm --filter @ticketvibe/web typecheck && pnpm lint` limpos.
- [ ] **Step 4:** Commit `feat(web): add organizer event editor with sectors and lots`

---

### Task 7: Web — página de locais

**Files:**
- Create: `apps/web/src/app/organizador/locais/page.tsx`
- Test: `apps/web/src/app/organizador/locais/page.spec.tsx`

**Interfaces:**
- Consumes: `fetchOrganizerVenues`/`createOrganizerVenue`/`updateOrganizerVenue` (Task 5); layout guard `/organizador`.
- Produces: copy fixada — heading "Locais"; form de criar (nome, cidade, estado) hidden até clicar "Cadastrar local"; lista de locais com cidade/UF; edição inline (PATCH); vazio pt-BR "Nenhum local cadastrado ainda.".

- [ ] **Step 1: Tests RED (MSW)** — lista, criar, editar e estado vazio.
- [ ] **Step 2:** implementar → `pnpm --filter @ticketvibe/web test` GREEN.
- [ ] **Step 3:** Commit `feat(web): add organizer venues page`

---

### Task 8: E2E — criar evento pelo backoffice e vê-lo na home

**Files:**
- Create: `apps/web/tests/e2e/backoffice.spec.ts`
- Modify: nada nos helpers existentes (reusa `registerVerifiedBuyer`, `promoteOrganizerByEmail`)
- Test: e2e completo.

**Roteiro fixado (um único `test`, dois contextos):**
1. Contexto A (organizador): `registerVerifiedBuyer` + `promoteOrganizerByEmail`; reload; link 'Painel do organizador'.
2. Em `/organizador/locais`: criar local "Teatro E2E Backoffice"/"São Paulo"/"SP" → aparece na lista.
3. Em `/organizador/eventos/novo`: preencher título "Show do Organizador E2E", descrição, categoria (primeira opção), local (select "Teatro E2E Backoffice"), data futura; submit → URL `/organizador/eventos/<id>`.
4. Goto `/` → `getByText('Show do Organizador E2E')` visível na seção de eventos (home all).
5. Contexto B (comprador sem login? novo contexto anônimo): goto `/events` (ou home) → título do evento visível; abrir o card → página do evento mostra título.

- [ ] **Step 1:** escrever o spec conforme roteiro (labels dos forms: mesmos dos specs de componente, pt-BR).
- [ ] **Step 2:** `pnpm --filter @ticketvibe/web test:e2e backoffice` → PASS (iterar em falhas reais sem afrouxar asserts).
- [ ] **Step 3:** `pnpm --filter @ticketvibe/web test:e2e` → suíte completa verde.
- [ ] **Step 4:** Commit `test(web): verify backoffice event creation end to end`

---

### Task 9: Gates finais + fechar a issue

**Files:**
- Modify: `.scratch/ticketvibe/issues/18-crud-de-eventos-locais-setores-e-lotes.md` (status done, checkboxes, tabelas de commits/gates/deferrals — formato da issue 17/16)

- [ ] **Step 1:** `pnpm lint` → 0 erros (1 info pré-existente permitida)
- [ ] **Step 2:** `pnpm typecheck` → 5/5
- [ ] **Step 3:** `pnpm test --force` → API/web/shared pass, números reais no report
- [ ] **Step 4:** `pnpm --filter @ticketvibe/web test:e2e` → todas pass
- [ ] **Step 5:** `pnpm build` → ok
- [ ] **Step 6:** Subagent de revisão final do branch inteiro (spec coverage ×issue, seam drift, security: ownership enforcement em todas as rotas; e2e roda "backoffice").
- [ ] **Step 7:** Atualizar a issue (tabelas com SHAs, gates com números reais, deferrals) → commit `docs: close ticket 18 backoffice crud for events venues sectors and lots`

## Deferrals conhecidos (declarar na issue)

- **Status `published/draft` do evento:** backoffice publica imediatamente (sem fila de revisão); campos `featured`/`isHot`/`badgeLabel`/`imageUrl` continuam região do seed administrativo.
- **Renomear slug:** slug de evento/venue/local/setor é fixado na criação (URL estável p/ comprador).
- **Owner de venue:** catálogo de locais é compartilhado entre organizadores (qualquer organizador edita qualquer local) — permissionamento por venue é decisão futura.
- **Edit de lote na UI:** API expõe `PATCH /organizer/lots/:id` (testada), UI do editor de lotes cobre criar/deletar.
- **Keyword:** preço efetivo do comprador não revalida pedidos já criados (preço capturado no hold/set-cart como hoje).
