# Ticket 16 — WebSocket de disponibilidade de assentos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O comprador no mapa de assentos vê lugares ocupados e liberados em tempo real via WebSocket, com degradação para o polling existente quando o WS não está de pé.

**Architecture:** Toda mudança de `seats.status` na API publica um delta e-esquesque via Redis pub/sub (`seat-availability`), única camada válida porque a captura de pagamento roda em processo separado (`worker.ts`) do servidor WS (API). A rota WebSocket (com `@fastify/websocket`) mantém rooms por `eventSlug` e envia os deltas que chegam do assinante Redis. O mapa no web abre o WS nativo do navegador, aplica deltas com uma função pura, refaz o fetch REST ao conectar (fecha a janela de corrida com o carregamento inicial) e só faz polling quando o WS não está aberto.

**Tech Stack:** Fastify 5 + `@fastify/websocket` ^11, ioredis pub/sub, WebSocket nativo do navegador (sem nova dependência no web), Zod schemas em `@ticketvibe/shared`.

**Spec:** `.scratch/ticketvibe/spec.md` (história 35) + issue `.scratch/ticketvibe/issues/16-websocket-de-disponibilidade.md`

## Global Constraints

- Idioma português; commits Conventional em inglês, imperativo; nada de `--no-verify`.
- Sem comentários de código.
- Testes API/web descritos em pt-BR; exceção: `packages/shared/src/index.spec.ts` em inglês.
- `playwright.config.ts` e `global-setup.ts` do web NUNCA são tocados; a suíte nova é descoberta pelo glob padrão.
- `pnpm infra:down` PROIBIDO (infra sobe com `pnpm infra:up`, já está de pé).
- Não tocar em `.github/`.
- Nenhuma migração neste ticket: é mudança só de runtime; não criar SQL no `apps/api/drizzle/`.
- Única nova dependência: `@ticketvibe/api` → `@fastify/websocket@^11` (`pnpm --filter @ticketvibe/api add @fastify/websocket`). Nenhuma dependência nova no web.
- Gatels: `pnpm lint`, `pnpm typecheck`, `pnpm test --force` (com a infra de pé), `pnpm --filter @ticketvibe/web test:e2e`.

## Review Focus

1. Mensagem WS corrompida/inválida vinda do servidor → ignorada, o mapa não quebra e o polling dá o heal — **teste:** Task 5 (parse guardado + mapa intacto).
2. WS cai (API reinicia no meio da escolha) → reconexão com backoff e polling retomado enquanto offline — **teste:** Task 5 (fake WS fecha → reconecta de novo).
3. WebSocket indisponível no runtime (SSR sem `WebSocket`, env ausente) → o hook não lança e o mapa segue com polling na URL default — **teste:** Task 5 (montar sem `WebSocket` global → sem crash).
4. Assento expira enquanto outro usuário assiste → o sweep publica `'available'` com a identidade certa e NÃO mexe em hold ainda válido — **teste:** Task 3 (integração do repository).
5. Captura pagando uma ordem: publicação dos deltas DEPOIS da resolução da transação (delta de estado que pode sofrer rollback não vaza) — **teste:** Task 3 (gateway com capture fake + broker fantasma).

---

### Task 1: Contrato compartilhado das mensagens WS

**Files:**
- Modify: `packages/shared/src/index.ts` (adição ao final, junto dos schemas de seat/seatmap)
- Test: `packages/shared/src/index.spec.ts` (em inglês, conforme exceção)

**Interfaces:**
- Consumes: `seatStatusSchema` já existente (`'available' | 'occupied' | 'unavailable'`).
- Produces (usado por Tasks 2–5):

```ts
export const seatStatusChangeSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  status: seatStatusSchema, // visão pública: hold de OUTREM é 'occupied' (como a rota REST já mapeia 'reserved' → 'occupied')
});
export const seatAvailabilityMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connected'), eventSlug: z.string().min(1) }),
  z.object({
    type: z.literal('seat_status_changed'),
    eventSlug: z.string().min(1),
    changes: z.array(seatStatusChangeSchema).min(1),
  }),
]);
export type SeatStatusChange = z.infer<typeof seatStatusChangeSchema>;
export type SeatAvailabilityMessage = z.infer<typeof seatAvailabilityMessageSchema>;
```

- [ ] **Step 1: Testes que falham (inglês)** — em `packages/shared/src/index.spec.ts`:

```ts
describe('seatAvailabilityMessageSchema', () => {
  it('accepts a connected message', () => {
    expect(
      seatAvailabilityMessageSchema.safeParse({
        type: 'connected',
        eventSlug: 'o-fantasma-da-opera',
      }).success,
    ).toBe(true);
  });

  it('accepts a seat_status_changed message', () => {
    const parsed = seatAvailabilityMessageSchema.safeParse({
      type: 'seat_status_changed',
      eventSlug: 'o-fantasma-da-opera',
      changes: [
        { sectorSlug: 'plateia', rowLabel: 'Fila A', seatLabel: 'Cadeira 1', status: 'occupied' },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ type: 'seat_status_changed' });
  });

  it('rejects unknown types and empty change lists', () => {
    expect(
      seatAvailabilityMessageSchema.safeParse({ type: 'seat_added', eventSlug: 'x' }).success,
    ).toBe(false);
    expect(
      seatAvailabilityMessageSchema.safeParse({
        type: 'seat_status_changed',
        eventSlug: 'x',
        changes: [],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2:** `cd packages/shared && pnpm vitest run src/index.spec.ts` → FAIL (`seatAvailabilityMessageSchema` não existe)
- [ ] **Step 3:** Implementar os schemas acima em `packages/shared/src/index.ts`
- [ ] **Step 4:** `cd packages/shared && pnpm vitest run src/index.spec.ts` → PASS
- [ ] **Step 5:** Commit: `feat(shared): add websocket seat availability message schemas`

---

### Task 2: Port do broker + fan-out por room (API)

**Files:**
- Create: `apps/api/src/modules/seatmaps/domain/seat-availability-broker.ts`
- Create: `apps/api/src/modules/seatmaps/infra/in-memory-seat-availability-broker.ts` (fake de teste, gravador)
- Create: `apps/api/src/modules/seatmaps/infra/redis-seat-availability-broker.ts`
- Create: `apps/api/src/modules/seatmaps/infra/seat-availability-fanout.ts`
- Test: `apps/api/src/modules/seatmaps/infra/seat-availability-fanout.spec.ts` (unit, sem infra)
- Test: `apps/api/src/modules/seatmaps/infra/redis-seat-availability-broker.integration.spec.ts` (Redis real, precisa da infra de pé)

**Interfaces:**
- Consumes: `seatAvailabilityMessageSchema` / `SeatStatusChange` (Task 1) e `createRedis`/`RedisClient` de `src/redis/client.ts`.
- Produces (usado por Tasks 3–4):

```ts
// domain/seat-availability-broker.ts
import type { SeatStatus } from '@ticketvibe/shared';

export interface SeatStatusDelta {
  eventSlug: string;
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  status: SeatStatus;
}

export interface SeatAvailabilityBroker {
  // disparo-e-esqueque: nunca lança, pode devolver antes do Redis confirmar
  publish(deltas: SeatStatusDelta[]): void;
}

// infra/in-memory-seat-availability-broker.ts — fake usada nos testes das Tasks 3 e 4
export class InMemorySeatAvailabilityBroker implements SeatAvailabilityBroker {
  readonly published: SeatStatusDelta[] = []; // grava os deltas na ordem recebida
  publish(deltas: SeatStatusDelta[]): void {
    this.published.push(...deltas);
  }
}
```

```ts
// infra/redis-seat-availability-broker.ts
export const SEAT_AVAILABILITY_CHANNEL = 'seat-availability';
export function createRedisSeatAvailabilityBroker(redis: RedisClient): SeatAvailabilityBroker
// agrupa deltas por eventSlug → uma mensagem seat_status_changed por evento → redis.publish(channel, JSON) com .catch(() => {})

export function subscribeSeatAvailabilityFanout(
  redis: RedisClient,
  fanout: { fanout(text: string): void },
): void
// redis.on('message', (channel, text) => channel === SEAT_AVAILABILITY_CHANNEL && fanout.fanout(text))
// void redis.subscribe(SEAT_AVAILABILITY_CHANNEL)
```

```ts
// infra/seat-availability-fanout.ts — registro de rooms por eventSlug (puro, sem Redis)
export interface FanoutTarget {
  send(text: string): void;
}
export class SeatAvailabilityFanout {
  // devolve uma função de desregistro (chamada pelo handler no 'close' do socket)
  register(eventSlug: string, target: FanoutTarget): () => void;
  // decodifica com seatAvailabilityMessageSchema; só distribui o tipo 'seat_status_changed';
  // payload inválido → ignora; send que lança → remove o alvo e segue os demais
  fanout(text: string): void;
}
```

Decisões que o implementer não re-decide: um delta e por msg — o broker agrupa por `eventSlug` (o sweep pode devolver assentos de eventos distintos numa chamada); mensagens `connected` nunca passam pelo Redis; mensagem inválida no fan-out é descartada sem log explosivo.

- [ ] **Step 1: Testes que falham (pt-BR)** — `seat-availability-fanout.spec.ts`:
  - "distribui o delta apenas para os sockets da room do evento": dois sockets fake registrados em `'o-fantasma-da-opera'` e um em `'les-miserables'`; `fanout(JSON.stringify({ type:'seat_status_changed', eventSlug:'o-fantasma-da-opera', changes:[{sectorSlug:'plateia', rowLabel:'Fila A', seatLabel:'Cadeira 1', status:'occupied'}] }))` → os dois primeiros receberam o texto, o terceiro não.
  - "descarta mensagem inválida sem quebrar": `fanout('nao-json')` e `fanout('{"type":"desconhecido"}')` → nenhum socket recebe e nem lança.
  - "remove socket morto e segue entregando": socket cujo `send` lança → os demais da mesma room recebem a mensagem.
- [ ] **Step 2:** `cd apps/api && pnpm vitest run src/modules/seatmaps/infra/seat-availability-fanout.spec.ts` → FAIL (classe não existe)
- [ ] **Step 3:** Implementar fan-out, broker Redis e o fake in-memory conforme as assinaturas acima
- [ ] **Step 4:** `cd apps/api && pnpm vitest run src/modules/seatmaps/infra/seat-availability-fanout.spec.ts` → PASS
- [ ] **Step 5: Teste de integração Redis (pt-BR)** — `redis-seat-availability-broker.integration.spec.ts`: duas conexões `createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1')` conectadas; `subscribeSeatAvailabilityFanout(subscriber, spyFanout)` onde `spyFanout` resolve uma Promise no primeiro texto; `broker.publish([delta de 'o-fantasma-da-opera' → 'occupied', delta de outro evento → 'available'])`; esperar Promise (timeout 3s) → JSON recebido parseia com `seatAvailabilityMessageSchema` como `seat_status_changed` do evento `'o-fantasma-da-opera'` (agrupado, contendo só o delta desse evento).
- [ ] **Step 6:** `cd apps/api && pnpm vitest run src/modules/seatmaps/infra/redis-seat-availability-broker.integration.spec.ts` → PASS
- [ ] **Step 7:** Commit: `feat(api): add seat availability broker and room fanout`

---

### Task 3: Publicar os deltas nas mudanças de status (repository, sweep, capture gateway)

**Files:**
- Modify: `apps/api/src/db/hold-expiry.ts`
- Modify: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts`
- Modify: `apps/api/src/modules/seatmaps/jobs/expire-seat-holds.ts` (+ quem o constrói)
- Modify: `apps/api/src/modules/orders/infra/drizzle-seat-capture-gateway.ts`
- Modify: todos os sites de construção (`new DrizzleSeatmapRepository(`, `new DrizzleSeatCaptureGateway(`, `createExpireSeatHoldsJob(`) — em `src/app.ts` e nos jobs do payments — para receber o broker
- Test: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.integration.spec.ts`
- Test: spec de integração do capture gateway (o arquivo já existente em `apps/api/src/modules/orders/infra/`)

**Interfaces:**
- Consumes: `SeatAvailabilityBroker`/`SeatStatusDelta` (Task 2).
- Produces: nenhum nome novo público; as classes ganham o broker no construtor (último parâmetro):

```ts
export class DrizzleSeatmapRepository implements SeatmapRepository {
  constructor(db: Db, broker: SeatAvailabilityBroker) {}
}
export class DrizzleSeatCaptureGateway implements SeatCaptureGateway {
  constructor(db: Db, broker: SeatAvailabilityBroker) {}
}
export async function expireExpiredHolds(db: Db): Promise<ExpiredHoldSeat[]>
export interface ExpiredHoldSeat {
  seatId: string;
  eventSlug: string;
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
}
```

Regras de publicação (o que o implementer não re-decide):
- `reserveSeat` com `rowCount > 0` (transição available → reserved) → publica **um** delta `status: 'occupied'` para o assento; a identidade (eventSlug, sectorSlug, rowLabel, seatLabel) vem de um select de join por `seatId` reutilizando os joins de `findSeatByCoords` (seats → filas → setores → eventos).
- `renewSeatHold` → **nunca** publica (sem mudança de status).
- `releaseSeat` com `rowCount > 0` → publica **um** delta `status: 'available'`. O método continua `Promise<void>` (a decisão de publicar fica aqui dentro; a port não muda).
- `expireHolds()` (o sweep oportunista chamado pelos use-cases) → publica `'available'` para cada assento devolvido por `expireExpiredHolds`.
- `expireExpiredHolds` é reescrito de `update` direto para **select com `.for('update', { skipLocked: true })` dos rows elegíveis (`status = 'reserved' and hold_expires_at <= now()`, joins até events → sectors → seat_rows → filas) seguido de `update` por ids** — devolve as identidades; manter o número de assentos mexidos idêntico ao comportamento atual. Corridas entre sweepees ficam seguras por SKIP LOCKED; corrida sweep vs nova reserva é inofensiva (o delta `'available'` em cima de um novo `'occupied'` é curado pelo próximo delta/poll e fica documentado no deferral).
- O job de expiração (`expire-seat-holds.ts`) ganha o broker como dependência e publica o resultado do sweep (o sweep é idempotente: se a varredura in-process da API já liberou os rows, o job publica vazio — `publish([])` não emite nada).
- `DrizzleSeatCaptureGateway.confirmOrderPayment`: na resolução `'paid'` publica `'occupied'` (por item: labels de `orderItems` + `order.eventSlug`) — **depois** que `this.db.transaction(...)` resolve (nada publicado dentro da transação); em `'already'` e `'seats_lost'` publica nada.
- `releaseOrderSeats` publica `'available'` por assento liberado (labels de items + `order.eventSlug`), após a consulta/atualização concluir.
- `publish([])` (lista vazia) não emite mensagem redis.

- [ ] **Step 1: Testes que falham (pt-BR)** — extensões no spec de integração do repository:
  - "publica occupied ao reservar um assento": reservar seat livre com `InMemorySeatAvailabilityBroker` injetado → publicado um delta com `{ status: 'occupied', eventSlug, sectorSlug, rowLabel, seatLabel }` do assento reservado.
  - "não publica nada ao renovar hold": renovar hold existente → `broker.published.length === 0`.
  - "publica available ao liberar": liberar hold do dono → delta `'available'` do assento.
  - "sweep publica available só dos assentos expirados": um seat com `hold_expires_at` no passado e outro ainda válido → sweep devolve só o expirado, o válido fica `'reserved'` e o broker recebe apenas o delta `'available'` do expirado.
- [ ] **Step 2:** `cd apps/api && pnpm vitest run src/modules/seatmaps/infra/drizzle-seatmap-repository.integration.spec.ts` → novos casos FAIL
- [ ] **Step 3:** Implementar `expireExpiredHolds`, publishes do repository e reescrever todos os sites de construção com o broker (nos jobs do payments, o `pnpm dev` roda com worker in-process; o `worker.ts` separado usa o mesmo broker por Redis — exatamente por isso a publicação é Redis pub/sub e o processo do worker consegue notificar o servidor WS da API)
- [ ] **Step 4:** Rodar o spec do repository → PASS
- [ ] **Step 5: Testes que falham no capture gateway (pt-BR)** — no spec de integração existente:
  - "publica occupied por item pago após a transação": confirmar com pago → deltas `'occupied'` por item, com labels dos items + eventSlug da ordem, e (se observável) entregues após o commit; cantidade igual aos itens de assento.
  - "publica available para assentos liberados": `releaseOrderSeats` → deltas `'available'` por assento constatado liberado pela suíte (checando `seats.status === 'available'`).
  - "não publica em seats_lost nem em already": `confirmOrderPayment` repetido ou com assento roubado → `broker.published.length === 0`.
- [ ] **Step 6:** `cd apps/api && pnpm vitest run src/modules/orders/infra` → PASS
- [ ] **Step 7:** `pnpm test --force` (raiz, infra de pé) — garantir que nenhum teste antigo quebra pelo novo argumento de construtor
- [ ] **Step 8:** Commit: `feat(api): publish seat status changes on reserve, release, expire and capture`

---

### Task 4: Rota WebSocket na API com rooms por evento

**Files:**
- Modify: `apps/api/package.json` (`@fastify/websocket@^11`)
- Create: `apps/api/src/modules/seatmaps/routes/seat-availability.routes.ts`
- Modify: `apps/api/src/app.ts` (registrar plugin WS, fan-out, assinante Redis dedicado + hook de fecho)
- Test: `apps/api/src/modules/seatmaps/routes/seat-availability.integration.spec.ts` (API real com `app.listen`, cliente `new WebSocket` — Node ≥ 22 tem WS global)

**Interfaces:**
- Consumes: `GetSeatmapUseCase` (rota REST já usa), `SeatAvailabilityFanout` + `subscribeSeatAvailabilityFanout` + `SEAT_AVAILABILITY_CHANNEL` (Task 2), `seatAvailabilityMessageSchema` (Task 1).
- Produces: rota **`GET /events/:slug/seat-availability`** (upgrade WS, sem autenticação — a disponibilidade é pública como a rota REST do seatmap):

Comportamento fixado:
- Após o upgrade, resolver o seatmap com `getSeatmap.execute(slug)`: `null` → `socket.close(4004, 'event_not_found')`; senão registrar o socket na room `slug` e enviar imediatamente `{"type":"connected","eventSlug":"<slug>"}`.
- No `close` do socket, desregistrar via a função devolvida por `fanout.register(...)`.
- O assinante Redis é uma **conexão dedicada** (`createRedis()` própria — `subscribe` coloca a conexão em modo subscriber e não pode ser a mesma do `getRedis()` de hold/cart). Fechada no hook `onClose` do app, seguindo o padrão de teardown que `app.ts` já usa para Redis.

- [ ] **Step 1: Adicionar a dependência:** `pnpm --filter @ticketvibe/api add @fastify/websocket` (conferir que ficou `^11`)
- [ ] **Step 2: Testes que falham (pt-BR)** — `seat-availability.integration.spec.ts` seguindo o padrão dos specs de rotas existentes (como a rota de seatmap/holds usam `buildApp`):
  - "responde connected e entrega delta para a room certa": `app.listen({ port: 0, host: '127.0.0.1' })`; três clientes WebSocket — dois em `/events/o-fantasma-da-opera/seat-availability`, um em `/events/evento-inexistente.../seat-availability`; os dois primeiros recebem um frame `connected` com o eventSlug; publicar via `createRedisSeatAvailabilityBroker` (Redis real, junto ao assinante do app) um delta `'occupied'` de `Fila A`/`Cadeira 1` desse evento → os dois da room recebem o frame `seat_status_changed` parse, o terceiro nada.
  - "fecha com 4004 para evento inexistente": cliente no slug inexistente recebe `close` com `event.code === 4004`.
- [ ] **Step 3:** Implementar a rota e o wiring em `app.ts` (plugin + fan-out + assinante dedicado + onClose)
- [ ] **Step 4:** `cd apps/api && pnpm vitest run src/modules/seatmaps/routes/seat-availability.integration.spec.ts` → PASS
- [ ] **Step 5:** `pnpm --filter @ticketvibe/api test` → PASS (suíte da API inteira)
- [ ] **Step 6:** Commit: `feat(api): add seat availability websocket route`

---

### Task 5: Web — hook WS + integração no mapa + fallback polling

**Files:**
- Create: `apps/web/src/lib/use-seat-availability.ts`
- Modify: `apps/web/src/components/seat-map.tsx`
- Test: `apps/web/src/lib/use-seat-availability.spec.ts` (novo)
- Test: `apps/web/src/components/seat-map.spec.tsx` (extensões)

**Interfaces:**
- Consumes: `seatAvailabilityMessageSchema`, `SeatStatusChange`, `SeatmapDto` (shared), `fetchSeatmap` do próprio componente.
- Produces:

```ts
// apps/web/src/lib/use-seat-availability.ts
export function applySeatStatuses(
  seatmap: SeatmapDto,
  changes: SeatStatusChange[],
): SeatmapDto; // pura: troca seat.status por (sectorSlug, rowLabel, seatLabel); identidade desconhecida → devolve o seatmap como está

export function seatAvailabilityWsUrl(): string;
// NEXT_PUBLIC_API_URL ?? 'http://localhost:3001' → troca http://→ws:// e https://→wss:// + /events/:slug/seat-availability

export function useSeatAvailability(input: {
  eventSlug: string;
  onMessage: (message: SeatAvailabilityMessage) => void;
}): boolean; // true quando o WS está aberto
```

Regras fixadas:
- Conexão dentro de `useEffect` (SSR-safe: nunca toca em `WebSocket` no render). Exposição sem `WebSocket` no window → hook não lança, devolve `false` (polling governa).
- `onmessage` → `seatAvailabilityMessageSchema.safeParse`; inválido ignorado (sem crash).
- Servidor fecha com código `4004` (evento inexistente) → **não reconecta**; outros fechamentos/erros → reconexão com backoff `min(1000 * 2^n, 15000)` a partir de `n = 0`, resetando o contador ao abrir.
- O componente: `connected` → `void fetchSeatmap()` (fecha a janela de corrida do snapshot inicial); `seat_status_changed` → `setSeatmap(prev => (prev ? applySeatStatuses(prev, msg.changes) : prev))`.
- Polling no `seat-map.tsx`: o interval de `POLL_MS` só roda enquanto `useSeatAvailability` devolve `false` (fallback; o WS "substitui" o polling e o degradação traz o polling de volta).

- [ ] **Step 1: Testes que falham (pt-BR)** — `use-seat-availability.spec.ts`:
  - `applySeatStatuses`: aplica troca de status à cadeira certa; identidade desconhecida → mapa inalterado.
  - `seatAvailabilityWsUrl()`: com `NEXT_PUBLIC_API_URL=http://localhost:3001` → `ws://localhost:3001/events/<slug>/seat-availability`; com `https://api.example.com` → `wss://…`; sem env → default localhost:3001.
  - Hook (montar componente de teste com `vi.stubGlobal('WebSocket', FakeWebSocket)`): devolve `true` no open e passa as mensagens ao `onMessage`; mensagem inválida é ignorada; `close` segue (`não 4004`) com uma reabertura após ~1s; `close` com `event.code === 4004` não reconecta; **sem `WebSocket` no global** → devolve `false` e não lança.
- [ ] **Step 2:** `cd apps/web && pnpm vitest run src/lib/use-seat-availability.spec.ts` → FAIL
- [ ] **Step 3:** Implementar hook + URL + `applySeatStatuses`
- [ ] **Step 4:** Rodar o spec do hook → PASS
- [ ] **Step 5: Extensões (pt-BR)** em `seat-map.spec.tsx`, com `FakeWebSocket` via `vi.stubGlobal`:
  - "aplica delta vindo do WS sem recarregar": mapa carregado com `Fila A`/`Cadeira 2` `'available'`; fake server manda `seat_status_changed` `'occupied'` → botão 'Cadeira 2, fila A' fica `disabled`, `aria-pressed=false`, e o contador "X de Y livres" do cabeçalho do setor diminui.
  - "preserva a minha seleção quando o delta diz occupied da minha cadeira": cadeira selecionada por mim + delta `'occupied'` → continua `aria-pressed=true` e no carrinho.
  - "não faz polling enquanto o WS está aberto e volta a fazer quando cai": fetch spy — com WS aberto não há intervalos disparados (aguardar > POLL_MS sem novo fetch); fechar o WS → fetch dispara no clock.
  - "idle e desconhecido": payload `connected` refaz o fetch do seatmap (janela de corrida fechada).
- [ ] **Step 6:** `cd apps/web && pnpm vitest run` → PASS (suíte componente inteira)
- [ ] **Step 7:** `pnpm --filter @ticketvibe/web test` → PASS
- [ ] **Step 8:** Commit: `feat(web): subscribe seat map to live availability updates`

---

### Task 6: E2E — dois navegadores vendo a mesma ocupação

**Files:**
- Create: `apps/web/tests/e2e/seat-availability.spec.ts`

**Interfaces:**
- Consumes: seed (`/events/o-fantasma-da-opera`, setor `Plateia`, `Fila A`), helpers de sessão anônima (`ensureAnonymousSession` roda ao clicar), Playwright (sem tocar em `playwright.config.ts`/`global-setup.ts`).
- Produces: suíte E2E coletada pelo glob padrão.

Roteiro fixado (um único `test` para não variar o custo):
1. Contexto A (`browser.newContext()` + `newPage()`) abre `${WEB}/events/o-fantasma-da-opera/ingressos`; aguarda o botão `'Cadeira 1, fila A'`.
2. Contexto B igual; em B, `page.evaluate(() => { (window as unknown as Record<string, unknown>).noReload = true; })` após o carregamento.
3. O contexto A clica em `'Cadeira 1, fila A'` e espera o painel do carrinho com `Plateia · Fila A · Cadeira 1 · R$ 120,00`.
4. B: `getByRole('button', { name: 'Cadeira 1, fila A' })` → `toBeDisabled()` (timeout 15s) **sem reload**: `evaluate(() => window.noReload)` ainda `true`.
5. O contexto A clica de novo em `'Cadeira 1, fila A'` (soltar a cadeira); B: mesmo botão → `toBeEnabled()` (timeout 15s) e `window.noReload` ainda `true`.

- [ ] **Step 1:** Escrever a suíte conforme o roteiro
- [ ] **Step 2:** `pnpm --filter @ticketvibe/web test:e2e -- seat-availability` → PASS (API+web sobem pelo webServer do config; a API em 3001 é alcançável pelo browser)
- [ ] **Step 3:** `pnpm --filter @ticketvibe/web test:e2e` → suíte COMPLETA PASS (nada regressou)
- [ ] **Step 4:** Commit: `test(web): verify two buyers see the same seat occupation live`

---

### Task 7: Gates finais + fechar a issue

**Files:**
- Modify: `.scratch/ticketvibe/issues/16-websocket-de-disponibilidade.md` (status done, checkboxes, tabela de gates, deferrals)

- [ ] **Step 1:** `pnpm lint` → 0 erros
- [ ] **Step 2:** `pnpm typecheck` → todos os packages pass
- [ ] **Step 3:** `pnpm test --force` (infra de pé) → API/web/shared pass
- [ ] **Step 4:** `pnpm --filter @ticketvibe/web test:e2e` → todas pass
- [ ] **Step 5:** `pnpm build` → ok (variando por `turbo build`)
- [ ] **Step 6:** Atualizar a issue 16 (checkboxes ✓, tabela de implementação/commits, tabela de gates com números, deferrals — incl. corrida sweep-vs-reserva documentada e sem WS-auth por design)
- [ ] **Step 7:** Commit: `docs: close ticket 16 websocket availability`

## Deferrals conhecidos

- Autenticação na rota WS: a disponibilidade é pública por design (a rota REST do seatmap é pública); não autentica.
- Corrida sweep vs nova reserva: um delta `'available'` pode chegar depois de um `'occupied'` criado na janela entre select e update do sweep; o próximo delta/poll e o fetch ao `connected` curam — não há ordenação offline acessível sem replumar o protocolo.
- O E2E de queda do servidor WS (restart da API) fica no teste de componente do fallback (Task 5); reiniciar a API no meio do E2E seria flaky demais para o ganho.
