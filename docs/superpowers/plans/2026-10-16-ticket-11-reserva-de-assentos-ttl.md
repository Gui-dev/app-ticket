# Ticket 11 — Reserva de assento com TTL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assim que o comprador seleciona um assento (mesmo sem login, via sessão anônima), o assento fica reservado no Redis com TTL de 10 minutos, aparece como ocupado para os demais compradores, tem contagem regressiva com renovação automática na UI, e é devolvido ao mapa pelo job do worker quando expira — dois compradores disputando o mesmo assento nunca ambos vencem.

**Architecture:** Reserva em duas camadas: **Redis** (`SET NX EX` por assento) é o portão atômico de disputa + TTL; **Postgres** espelha o estado (`seats.status='reserved'`, `hold_user_id`, `hold_expires_at`) como modelo de leitura (seatmap, `seatsAvailable`, best-seat, holds do próprio comprador). Expiração em duas camadas: `expireExpiredHolds` roda no início de cada use case de seatmap (lazy, via repositório) e no job BullMQ do worker (processo separado, sweep a cada 5s). Sessão anônima via plugin `anonymous` do better-auth: visitante seleciona sem login; no signup, `onLinkAccount` migra as reservas para a conta real.

**Tech Stack:** Fastify + Drizzle + `pg` (API), ioredis, BullMQ v6 (`upsertJobScheduler`), better-auth (`anonymous` plugin, `fromNodeHeaders`), Zod (`packages/shared`), Next 16 route handlers (proxies), React 19 (componente), Vitest, Playwright, Podman (Postgres + Redis + Mailpit).

---

## Fatos verificados (código conferido em 2026-10-16)

- **Redis já sobe no ambiente:** `compose.yaml` define serviço `redis` (redis:7-alpine, `127.0.0.1:6379`, sem senha, sem env). Nenhum cliente Redis no repo hoje (nenhuma dep `ioredis`/`bullmq` em `apps/api/package.json`).
- **Workspace:** `pnpm-workspace.yaml` = `apps/*` + `packages/*`. `turbo.json` tem tasks `build`/`typecheck`/`test`/`dev` (`dev`: `cache:false`, `persistent:true`). Root `dev` = `turbo dev`. Turbo instalado: **2.11.7** (docs locais lidos — task nova pode ser adicionada em `turbo.json`; `turbo run <t1> <t2>` roda múltiplas tasks).
- **Sessão better-auth:** `createAuth` em `apps/api/src/modules/auth/auth.ts:26` (instância sem plugins hoje). Precedente de headers: `fromNodeHeaders(request.headers)` já usado em `auth.routes.ts:12`. Docs better-auth (Fastify integration): `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })` retorna `{user, session} | null`. Plugin `anonymous` existe (`better-auth/plugins`) com `onLinkAccount({anonymousUser, newUser})` — usuário anônimo é **apagado** após o link (migrar dados no callback). Cliente: `apps/web/src/lib/auth-client.ts` = `createAuthClient()` sem plugins (precisa ganhar `anonymousClient()`).
- **Proxies web:** `seatmap/route.ts` e `best-seat/route.ts` (GET) **não repassam cookie** (`_request`/headers ignorados). O proxy de auth repassa tudo + `set-cookie`. Padrão de erro do best-seat (forward de 404 JSON, 502 com `console.error`) é o modelo para os novos proxies POST.
- **Schema seats:** `apps/api/src/db/schema.ts:119-136` — `status: text.$type<'available'|'occupied'|'unavailable'>().notNull().default('available')`, unicidade `(row_id,label)`. Sem colunas de hold. `resetDatabase` (test-helpers) trunca `seats`/`user` via CASCADE ✓.
- **Seatmap hoje:** entidade `SeatmapSeat{label,status}` com `SeatStatusValue = SeatStatus` (shared de 3 valores) em `seatmap-entity.ts:5`; `DrizzleSeatmapRepository` devolve status cru (`drizzle-seatmap-repository.ts:55`); rota filtra `rows: []` e parseia `seatmapResponseSchema` (`seatmap.routes.ts:15-27`); `pickBestSeat` seleciona só `status === 'available'` ✓ (reserved fica de fora automaticamente quando o espelho existir).
- **`seatsAvailable`:** `drizzle-events-repository.ts:158` — `(count(id) filter (where status = 'available'))::int` — reservados já não contam ✓.
- **Use cases/DI:** `buildApp` (`app.ts:29`) injeta repositórios; `authInstance` é criado **depois** do registro das rotas de seatmap (reordenar será necessário); opção `auth` já existe para testes.
- **Testes:** API `fileParallelism:false` (vitest.config.ts); integração usa `TEST_DATABASE_URL` (sufixo `/ticketvibe_test` + `assertTestDatabaseUrl`) com `resetDatabase`+`seedFixtures` em `beforeEach` (padrão `seatmap.routes.integration.spec.ts`); specs de rota unitária constroem `buildApp` com stubs de repositório; web componentes usam MSW com import dinâmico pós `server.listen` (padrão `seat-map.spec.tsx`); E2E de auth cria conta real via Mailpit (`auth.spec.ts` + `helpers/mailpit.ts`); E2E do mapa (3 testes em `seatmap.spec.ts`) **não logam**; `playwright.config.ts` sobe api (`:3001/health`) + web (`:3000`) com `reuseExistingServer`; `global-setup.ts` só roda `db:seed` (arquivo proibido de tocar).
- **E2E seatmap = seleção local hoje:** `seat-map.tsx:209-215` só faz `setSelected` no clique; resumo em `role="status"` com texto exato `Você selecionou: …` (asserções existentes dependem desse texto e do `getByRole('status')` único).
- **Fixture numérica:** o-fantasma-da-opera plateia 96 cadeiras (91 livres) + balcão 40 (39 livres); melhor lugar = Plateia · Fila A · Cadeira 6 · R$ 120,00; corrida-de-rua-sp = estado vazio (setores sem linhas); cadeira ocupada do seed A = conferir em `fixtures.ts` (usada no teste 409).
- **Spec:** `.scratch/ticketvibe/spec.md` — story 20 (reserva ~10 min na sessão), story 30 (TTL libera automaticamente), linha 93 (Redis TTL + BullMQ, worker processo separado), linha 94 (jobs do worker incluem expirar reservas), linha 114 (teste de corrida: dois compradores, mesmo assento).

## Decisões (D1–D8)

- **D1 — Redis autoridade da corrida, Postgres modelo de leitura.** `SET NX EX` por chave de assento decide o vencedor; o vencedor espelha `status='reserved'` + `hold_user_id` + `hold_expires_at` no Postgres (UPDATE condicional em `status='available'`). Ordem: valida coords → NX → espelho. Crash entre NX e espelho deixa o assento "segurado só no Redis" por ≤TTL (janela auto-limpável, documentada). Espelho-first crasharia por 10min — por isso Redis-first.
- **D2 — Hold por usuário, não por session id.** `hold_user_id text` (sem FK): sobrevive à rotação de sessão e permite a migração no link anônimo→conta (`onLinkAccount`). TTL limpa órfãos. "Sessão do comprador" = o usuário por trás da sessão.
- **D3 — Sessão anônima (decisão do usuário de 2026-10-16).** Plugin `anonymous` do better-auth no servidor + `anonymousClient` no web; componente chama `authClient.signIn.anonymous()` no primeiro 401 do hold e tenta de novo. No signup, `onLinkAccount` faz `UPDATE seats SET hold_user_id = novoUsuário WHERE hold_user_id = usuárioAnônimo`.
- **D4 — Expiração lazy + worker.** `expireExpiredHolds(db)` (uma SQL: `reserved` com `hold_expires_at <= now()` → `available`) roda: (a) no início de GetSeatmap/HoldSeat/ReleaseHold/FindBestSeat (via `SeatmapRepository.expireHolds()`), e (b) no job BullMQ do worker (`upsertJobScheduler` a cada 5s). Worker = **mesmo workspace** `apps/api`, entrada separada `src/worker.ts` (processo separado conforme spec; sem duplicar schema/pg). API não depende de bullmq (só ioredis).
- **D5 — Contrato sem status novo.** `reserved` existe só no banco/domínio; o mapper da rota converte `reserved`→`occupied` no DTO (para todos, inclusive o dono). O dono vê o próprio hold em `holds: []` (top-level da resposta do seatmap, ao lado de `seatmap`). `SeatStatus` do shared permanece com 3 valores.
- **D6 — Endpoints de hold.** `POST /events/:slug/holds` (claim OU renew idempotente por usuário; 201 claim / 200 renew; 401 sem sessão; 400 `invalid_body`; 404 `event_not_found`|`sector_not_found`|`seat_not_found`; 409 `seat_held`|`seat_unavailable`), `POST /events/:slug/holds/release` (200 `{released:true}` / 404 `hold_not_found`). TTL e limiar de renovação no shared: `SEAT_HOLD_TTL_SECONDS = 600`, `SEAT_HOLD_RENEW_AFTER_SECONDS = 120`.
- **D7 — UI.** Clique/best-seat seleciona otimisticamente e dispara o hold; 409 desfaz + alerta + refetch; contador em elemento próprio (**fora** do `role="status"` — asserts existentes usam `getByRole('status')` único e texto exato); renovação automática (mesmo POST) a ≤120s com aviso "Reserva renovada"; botão "Desistir da reserva"; troca de setor solta o hold (fire-and-forget); polling do seatmap a cada 10s; `holds[0]` da resposta restaura seleção+contador após refresh.
- **D8 — Corrida garantida por NX + teste obrigatório.** Integração com Postgres real + Redis (db 1 em testes): dois `POST /holds` concorrentes com usuários diferentes → exatamente um 201 e um 409. Redis de testes usa `TEST_REDIS_URL` (default `redis://127.0.0.1:6379/1`) com `flushdb` próprio (nunca FLUSHALL no db 0 do dev).

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/src/redis/client.ts` | Cliente ioredis (`REDIS_URL`/`TEST_REDIS_URL`, `lazyConnect`) |
| `apps/api/src/db/hold-expiry.ts` | `expireExpiredHolds(db)` — SQL única de expiração (API + worker) |
| `apps/api/src/modules/seatmaps/domain/hold-entity.ts` | `Hold`, `HoldClaimResult`, `holdSeatKey()` |
| `apps/api/src/modules/seatmaps/domain/hold-repository.ts` | Interface `HoldRepository` |
| `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.ts` (+spec) | Repo em memória (unit tests, clock injetável) |
| `apps/api/src/modules/seatmaps/infra/redis-hold-repository.ts` (+spec) | `SET NX EX` + Lua renew/release |
| `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.ts` (+spec) | Claim/renew |
| `apps/api/src/modules/seatmaps/use-cases/release-hold.use-case.ts` (+spec) | Release |
| `apps/api/src/modules/seatmaps/routes/holds.routes.ts` (+unit spec + integration spec) | POST holds/release + teste de corrida |
| `apps/api/src/modules/auth/get-session.ts` | `GetSessionFn` + `createGetSession(auth)` |
| `apps/api/src/modules/seatmaps/jobs/expire-seat-holds.ts` (+spec) | Função do job + constantes da fila |
| `apps/api/src/worker.ts` | Entry do worker (Queue + Worker + scheduler + shutdown) |
| `apps/web/src/app/api/events/[slug]/holds/route.ts` (+spec) | Proxy POST hold |
| `apps/web/src/app/api/events/[slug]/holds/release/route.ts` (+spec) | Proxy POST release |

**Modificar:** `packages/shared/src/index.ts`+`index.spec.ts`; `apps/api/package.json` (deps + scripts); root `package.json`+`turbo.json` (task worker); `apps/api/src/db/schema.ts`+`drizzle/*` (0006); `apps/api/src/db/test-helpers.ts`; `apps/api/src/modules/auth/auth.ts`+`auth.integration.spec.ts`; `apps/web/src/lib/auth-client.ts`; seatmaps domain/infra/use-cases/routes existentes; `apps/api/src/app.ts`; `apps/web/src/app/api/events/[slug]/seatmap/route.ts`+spec; `apps/web/src/components/seat-map.tsx`+spec; `apps/web/tests/e2e/seatmap.spec.ts`.

---
### Task 1: Infra Redis (cliente, envs, helper de teste, deps)

**Files:**
- Create: `apps/api/src/redis/client.ts`
- Modify: `apps/api/package.json` (deps `ioredis`)
- Modify: `apps/api/src/db/test-helpers.ts` (helper `flushTestRedis`)

- [ ] **Step 1: Adicionar dependência**

```bash
pnpm --filter @ticketvibe/api add ioredis
```

- [ ] **Step 2: Escrever o teste do cliente Redis**

Create `apps/api/src/redis/client.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { flushTestRedis } from '../db/test-helpers.js';
import { createRedis, TEST_REDIS_URL } from './client.js';

describe('redis client (integration)', () => {
  const redis = createRedis(TEST_REDIS_URL);

  beforeAll(async () => {
    await redis.connect();
    await flushTestRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('sets, reads and expires keys on the test database', async () => {
    await redis.set('client-probe', 'ok', 'EX', 60);
    expect(await redis.get('client-probe')).toBe('ok');
    expect(await redis.ttl('client-probe')).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/redis/client.spec.ts`
Expected: FAIL — `../db/test-helpers.js` não exporta `flushTestRedis` / `./client.js` não existe.

- [ ] **Step 4: Implementar cliente e helper**

Create `apps/api/src/redis/client.ts`:

```ts
import Redis from 'ioredis';

export const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';

export function createRedis(
  url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
): Redis {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
}

export type RedisClient = ReturnType<typeof createRedis>;
```

Modify `apps/api/src/db/test-helpers.ts` — adicionar ao final:

```ts
import { createRedis, TEST_REDIS_URL } from '../redis/client.js';

export async function flushTestRedis(url = TEST_REDIS_URL): Promise<void> {
  const redis = createRedis(url);
  await redis.connect();
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}
```

(O `import` entra no topo com os demais — casa com o estilo do arquivo.)

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/redis/client.spec.ts`
Expected: PASS (1 teste). Requer Redis de pé: `pnpm infra:up` (permitido; **`infra:down` proibido**).

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/redis/ apps/api/src/db/test-helpers.ts
git commit -m "feat(api): add redis client with test isolation"
```

(pnpm-lock.yaml fica na raiz do repo — `git add` no lock correto: `pnpm-lock.yaml`.)

---

### Task 2: Contratos compartilhados (holds, constantes)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.spec.ts`

- [ ] **Step 1: Escrever os testes de contrato (red)**

Append to `packages/shared/src/index.spec.ts` (importar os símbolos novos no topo, junto dos imports existentes):

```ts
describe('seat hold contracts', () => {
  it('exposes hold ttl constants', () => {
    expect(SEAT_HOLD_TTL_SECONDS).toBe(600);
    expect(SEAT_HOLD_RENEW_AFTER_SECONDS).toBe(120);
    expect(SEAT_HOLD_RENEW_AFTER_SECONDS).toBeLessThan(
      SEAT_HOLD_TTL_SECONDS,
    );
  });

  it('parses a hold request', () => {
    const parsed = holdRequestSchema.safeParse({
      sectorSlug: ' plateia ',
      rowLabel: 'A',
      seatLabel: '6',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sectorSlug).toBe('plateia');
    }
  });

  it('rejects a hold request with empty coords', () => {
    const parsed = holdRequestSchema.safeParse({
      sectorSlug: '',
      rowLabel: 'A',
      seatLabel: '6',
    });
    expect(parsed.success).toBe(false);
  });

  it('parses a hold response', () => {
    const parsed = holdResponseSchema.safeParse({
      hold: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        expiresAt: '2026-10-16T12:00:00.000Z',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('parses a release response', () => {
    expect(releaseResponseSchema.safeParse({ released: true }).success).toBe(
      true,
    );
    expect(
      releaseResponseSchema.safeParse({ released: false }).success,
    ).toBe(false);
  });

  it('requires holds in the seatmap response', () => {
    const parsed = seatmapResponseSchema.safeParse({
      seatmap: {
        eventSlug: 'o-fantasma-da-opera',
        sectors: [],
      },
    });
    expect(parsed.success).toBe(false);

    const withHolds = seatmapResponseSchema.safeParse({
      seatmap: {
        eventSlug: 'o-fantasma-da-opera',
        sectors: [],
      },
      holds: [],
    });
    expect(withHolds.success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/shared exec vitest run`
Expected: FAIL — imports não existem.

- [ ] **Step 3: Implementar contratos**

Modify `packages/shared/src/index.ts` — adicionar após `seatmapResponseSchema` (e importar `SEAT_HOLD_*` onde ficam as constantes, acima dos schemas):

```ts
export const SEAT_HOLD_TTL_SECONDS = 600;
export const SEAT_HOLD_RENEW_AFTER_SECONDS = 120;

export const holdSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type HoldDto = z.infer<typeof holdSchema>;

export const holdRequestSchema = z.object({
  sectorSlug: z.string().trim().min(1),
  rowLabel: z.string().trim().min(1),
  seatLabel: z.string().trim().min(1),
});

export type HoldRequest = z.infer<typeof holdRequestSchema>;

export const holdResponseSchema = z.object({ hold: holdSchema });

export const releaseResponseSchema = z.object({ released: z.literal(true) });
```

Alterar `seatmapResponseSchema` existente de:

```ts
export const seatmapResponseSchema = z.object({ seatmap: seatmapSchema });
```

para:

```ts
export const seatmapResponseSchema = z.object({
  seatmap: seatmapSchema,
  holds: z.array(holdSchema),
});
```

- [ ] **Step 4: Atualizar fixtures quebradas pelo contrato novo**

`seatmapResponseSchema` agora exige `holds`. Corrigir **todos** os fixtures que parseiam essa resposta:

1. `packages/shared/src/index.spec.ts` — nos testes existentes de seatmap, adicionar `holds: []` ao payload (os testes de seatmapResponse do ticket 10).
2. `apps/web/src/app/api/events/[slug]/seatmap/route.spec.ts` — fixtures de 200 ganham `holds: []`.
3. `apps/web/src/components/seat-map.spec.tsx` — `seatmapPayload` ganha `holds: []` (raiz do payload, irmão de `seatmap`).
4. `apps/api/src/modules/seatmaps/routes/seatmap.routes.integration.spec.ts` — asserts usam `seatmapResponseSchema.parse`: o servidor ainda não emite `holds` (Task 7) → adicionar temporariamente? **Não** — nesse Task o servidor ainda quebra. Deixar os asserts de integração para a Task 7? Não: os testes de integração existentes passarão a falhar no parse do payload do servidor (sem `holds`). Solução correta: nesta task os specs de API ainda não rodam verdes sozinhos — rode agora só shared + web specs (Step 5) e **resolva a API na Task 7** (o parse do servidor passa a emitir `holds`). Se o gate de shared/web pedir a API verde, o fluxo é task-a-task: apenas rode os testes das suítes tocadas.

- [ ] **Step 5: Rodar testes**

Run: `pnpm --filter @ticketvibe/shared exec vitest run && pnpm --filter @ticketvibe/web exec vitest run src/app/api/events`
Expected: shared PASS (todos, +6 novos); web proxy specs PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared apps/web/src/app/api/events apps/web/src/components/seat-map.spec.tsx
git commit -m "feat(shared): add seat hold contracts"
```

---

### Task 3: Migração 0006 + sessão anônima (better-auth)

**Files:**
- Modify: `apps/api/src/db/schema.ts` (seats +2 colunas)
- Create: `apps/api/drizzle/0006_*.sql` (via drizzle-kit generate)
- Modify: `apps/api/src/modules/auth/auth.ts` (plugin anonymous + onLinkAccount)
- Modify: `apps/web/src/lib/auth-client.ts` (anonymousClient)
- Test: `apps/api/src/modules/auth/auth.integration.spec.ts`

- [ ] **Step 1: Schema — colunas de hold em seats**

Modify `apps/api/src/db/schema.ts` — dentro de `seats`, após `status`:

```ts
    holdUserId: text('hold_user_id'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
```

(Opções de `timestamp` idênticas às de `events.startsAt` — conferir o arquivo e casar.)

- [ ] **Step 2: Gerar e conferir a migração**

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: cria `apps/api/drizzle/0006_<nome>.sql` com `ALTER TABLE "seats" ADD COLUMN "hold_user_id" text;` + `ADD COLUMN "hold_expires_at" timestamp;` (e snapshot/journal atualizados). **Sem** FK para `user` (D2 — holds são efêmeros; TTL limpa órfãos).

Leia o SQL gerado; se o drizzle emitir mais que as duas colunas em `seats`, investigue antes de seguir.

- [ ] **Step 3: Escrever o teste de migração de holds no link anônimo (red)**

Append em `apps/api/src/modules/auth/auth.integration.spec.ts` (reaproveitando `app`, `testDb`, `beforeEach` do arquivo — o arquivo já constrói o app com `createAuth` e reset/seed):

```ts
it('migrates seat holds when an anonymous user links an account', async () => {
  const anonymousResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/anonymous',
  });
  expect(anonymousResponse.statusCode).toBe(200);
  const anonymousCookie = anonymousResponse.cookies.find(
    (cookie) => cookie.name === 'better-auth.session_token',
  );
  expect(anonymousCookie).toBeDefined();

  const anonymousSession = await authInstance.api.getSession({
    headers: { cookie: `better-auth.session_token=${anonymousCookie?.value}` },
  });
  expect(anonymousSession).not.toBeNull();
  const anonymousUserId = anonymousSession?.user.id;
  expect(anonymousUserId).toBeDefined();

  await testDb.insert(seats).values({
    rowId: seedRowId,
    label: 'H1',
    position: 99,
    status: 'reserved',
    holdUserId: anonymousUserId,
    holdExpiresAt: new Date(Date.now() + 600_000),
  });

  const email = `link-${Date.now()}@ticketvibe.test`;
  const signUpResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { cookie: `better-auth.session_token=${anonymousCookie?.value}` },
    payload: { name: 'Comprador Link', email, password: 'senha-forte-123' },
  });
  expect(signUpResponse.statusCode).toBe(200);

  const linkedUser = await findUserByEmail(email);
  expect(linkedUser).toBeDefined();

  const heldRows = await testDb
    .select()
    .from(seats)
    .where(eq(seats.holdUserId, linkedUser.id));
  expect(heldRows).toHaveLength(1);
  expect(heldRows[0].label).toBe('H1');
});
```

Apoio no topo do arquivo: `import { seats } from '../../db/schema.js';` e obter `seedRowId` com `select().from(seatRows).limit(1)` logo após o `seedFixtures` do `beforeEach` (o seed de fixtures cria a plateia A…). `authInstance` precisa estar acessível no escopo do teste — o arquivo atual cria a instância dentro do `buildApp`; para o teste, guarde a instância: `const authInstance = createAuth(testDb, { sendEmail: collectEmail }); app = buildApp({ auth: authInstance, ... })` (alinhe com o que o arquivo já faz; se já expõe a instência, reuse).

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/auth.integration.spec.ts`
Expected: novo teste FAIL (endpoint `sign-in/anonymous` inexistente → 404).

- [ ] **Step 5: Implementar plugin anônimo no servidor**

Modify `apps/api/src/modules/auth/auth.ts`:

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
```

Dentro de `createAuth(db, deps)`, no objeto do `betterAuth({...})`, adicionar `plugins`:

```ts
    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await db
            .update(seats)
            .set({ holdUserId: newUser.user.id })
            .where(eq(seats.holdUserId, anonymousUser.user.id));
        },
      }),
    ],
```

com `import { seats } from '../../db/schema.js';`. (Se os tipos do plugin expuserem outro formato de `anonymousUser`/`newUser`, o `tsc` aponta — ajuste para `.user.id` real; o teste de Step 3 pinna o comportamento.)

- [ ] **Step 6: Cliente web anônimo**

Modify `apps/web/src/lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react';
import { anonymousClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});
```

- [ ] **Step 7: Rodar testes de auth + typecheck**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth && pnpm --filter @ticketvibe/api exec tsc --noEmit && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS (teste novo incluído), tsc limpo nos dois apps.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle apps/api/src/modules/auth apps/web/src/lib/auth-client.ts
git commit -m "feat(api): add anonymous sessions with hold migration on link"
```

---

### Task 4: Domínio de hold + status 'reserved'

**Files:**
- Create: `apps/api/src/modules/seatmaps/domain/hold-entity.ts`
- Create: `apps/api/src/modules/seatmaps/domain/hold-repository.ts`
- Create: `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.ts` (+spec)
- Modify: `apps/api/src/modules/seatmaps/domain/seatmap-entity.ts` (`SeatStatusValue` com `'reserved'`)
- Modify: `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts` (novos métodos)
- Modify: `apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts`

- [ ] **Step 1: Teste do repositório em memória de holds (red)**

Create `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { holdSeatKey } from '../domain/hold-entity.js';
import { InMemoryHoldRepository } from './in-memory-hold-repository.js';

describe('InMemoryHoldRepository', () => {
  let nowMs: number;
  let repository: InMemoryHoldRepository;
  const key = holdSeatKey('event-1', 'row-1', 'seat-1');

  beforeEach(() => {
    nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    repository = new InMemoryHoldRepository(() => new Date(nowMs));
  });

  afterEach(() => {
    nowMs = 0;
  });

  it('claims a free seat', async () => {
    expect(await repository.claim(key, 'user-a', 600)).toBe('claimed');
  });

  it('reports held when another user owns the hold', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.claim(key, 'user-b', 600)).toBe('held');
  });

  it('reports owned when the same user claims again', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.claim(key, 'user-a', 600)).toBe('owned');
  });

  it('renews an active hold', async () => {
    await repository.claim(key, 'user-a', 600);
    nowMs += 5 * 60_000;
    expect(await repository.renew(key, 'user-a', 600)).toBe(true);
    nowMs += 9 * 60_000;
    expect(await repository.renew(key, 'user-a', 600)).toBe(true);
  });

  it('does not renew a foreign or expired hold', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.renew(key, 'user-b', 600)).toBe(false);
    nowMs += 601_000;
    expect(await repository.renew(key, 'user-a', 600)).toBe(false);
  });

  it('releases an owned hold and fails for others', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.release(key, 'user-b')).toBe(false);
    expect(await repository.release(key, 'user-a')).toBe(true);
    expect(await repository.claim(key, 'user-b', 600)).toBe('claimed');
  });

  it('lets a new claim succeed after ttl expiry', async () => {
    await repository.claim(key, 'user-a', 600);
    nowMs += 601_000;
    expect(await repository.claim(key, 'user-b', 600)).toBe('claimed');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/in-memory-hold-repository.spec.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar domínio**

Create `apps/api/src/modules/seatmaps/domain/hold-entity.ts`:

```ts
export interface Hold {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  expiresAt: Date;
}

export type HoldClaimResult = 'claimed' | 'owned' | 'held';

export function holdSeatKey(
  eventId: string,
  rowId: string,
  seatId: string,
): string {
  return `hold:seat:${eventId}:${rowId}:${seatId}`;
}
```

Create `apps/api/src/modules/seatmaps/domain/hold-repository.ts`:

```ts
import type { HoldClaimResult } from './hold-entity.js';

export interface HoldRepository {
  claim(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<HoldClaimResult>;
  renew(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  release(seatKey: string, userId: string): Promise<boolean>;
}
```

Create `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.ts`:

```ts
import type { HoldClaimResult } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';

interface InMemoryHold {
  userId: string;
  expiresAtMs: number;
}

export class InMemoryHoldRepository implements HoldRepository {
  private readonly holds = new Map<string, InMemoryHold>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private activeHold(seatKey: string): InMemoryHold | null {
    const hold = this.holds.get(seatKey);
    if (!hold) return null;
    if (hold.expiresAtMs <= this.now().getTime()) {
      this.holds.delete(seatKey);
      return null;
    }
    return hold;
  }

  async claim(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<HoldClaimResult> {
    const hold = this.activeHold(seatKey);
    if (hold) {
      return hold.userId === userId ? 'owned' : 'held';
    }
    this.holds.set(seatKey, {
      userId,
      expiresAtMs: this.now().getTime() + ttlSeconds * 1000,
    });
    return 'claimed';
  }

  async renew(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const hold = this.activeHold(seatKey);
    if (!hold || hold.userId !== userId) return false;
    hold.expiresAtMs = this.now().getTime() + ttlSeconds * 1000;
    return true;
  }

  async release(seatKey: string, userId: string): Promise<boolean> {
    const hold = this.activeHold(seatKey);
    if (!hold || hold.userId !== userId) return false;
    this.holds.delete(seatKey);
    return true;
  }
}
```

- [ ] **Step 4: Status 'reserved' na entidade e novos métodos do repositório de seatmap**

Modify `apps/api/src/modules/seatmaps/domain/seatmap-entity.ts`:

```ts
import type { SeatStatus } from '@ticketvibe/shared';

export type SeatStatusValue = SeatStatus | 'reserved';
```

Modify `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts` — adicionar ao final (mantendo `findSeatmap`):

```ts
export interface SeatCoordsLookupFound {
  found: true;
  seat: {
    seatId: string;
    rowId: string;
    eventId: string;
    status: SeatStatusValue;
    sectorSlug: string;
    sectorName: string;
    priceFromCents: number;
    rowLabel: string;
    seatLabel: string;
  };
}

export interface SeatCoordsLookupMissing {
  found: false;
  scope: 'event' | 'sector' | 'seat';
}

export type SeatCoordsLookup = SeatCoordsLookupFound | SeatCoordsLookupMissing;

export interface SeatHoldRecord {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  expiresAt: Date;
}

export interface SeatmapRepository {
  findSeatmap(eventSlug: string): Promise<SeatmapEntity | null>;
  findSeatByCoords(input: {
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<SeatCoordsLookup>;
  findHoldsByUser(input: {
    eventSlug: string;
    userId: string;
  }): Promise<SeatHoldRecord[]>;
  expireHolds(): Promise<void>;
}
```

(com os imports de tipo de `seatmap-entity.js` já existentes no arquivo.)

- [ ] **Step 5: Estender o repo em memória de seatmap**

Rewrite `apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts`:

```ts
import type {
  SeatCoordsLookup,
  SeatHoldRecord,
  SeatmapRepository,
} from '../domain/seatmap-repository.js';
import type { SeatmapEntity } from '../domain/seatmap-entity.js';

interface SeededUserHold extends SeatHoldRecord {
  eventSlug: string;
  userId: string;
}

export class InMemorySeatmapRepository implements SeatmapRepository {
  private readonly seatmaps = new Map<string, SeatmapEntity>();
  private readonly userHolds: SeededUserHold[];

  constructor(seed: SeatmapEntity[] = [], holds: SeededUserHold[] = []) {
    for (const seatmap of seed) {
      this.seatmaps.set(seatmap.eventSlug, seatmap);
    }
    this.userHolds = holds;
  }

  async findSeatmap(eventSlug: string): Promise<SeatmapEntity | null> {
    return this.seatmaps.get(eventSlug) ?? null;
  }

  async findSeatByCoords(input: {
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<SeatCoordsLookup> {
    const seatmap = this.seatmaps.get(input.eventSlug);
    if (!seatmap) return { found: false, scope: 'event' };
    const sector = seatmap.sectors.find(
      (item) => item.slug === input.sectorSlug,
    );
    if (!sector) return { found: false, scope: 'sector' };
    const row = sector.rows.find((item) => item.label === input.rowLabel);
    const seat = row?.seats.find((item) => item.label === input.seatLabel);
    if (!row || !seat) return { found: false, scope: 'seat' };
    return {
      found: true,
      seat: {
        seatId: `${input.eventSlug}:${input.sectorSlug}:${input.rowLabel}:${input.seatLabel}`,
        rowId: `${input.eventSlug}:${input.sectorSlug}:${input.rowLabel}`,
        eventId: input.eventSlug,
        status: seat.status,
        sectorSlug: sector.slug,
        sectorName: sector.name,
        priceFromCents: sector.priceFromCents,
        rowLabel: row.label,
        seatLabel: seat.label,
      },
    };
  }

  async findHoldsByUser(input: {
    eventSlug: string;
    userId: string;
  }): Promise<SeatHoldRecord[]> {
    return this.userHolds
      .filter(
        (hold) =>
          hold.eventSlug === input.eventSlug && hold.userId === input.userId,
      )
      .map(({ sectorSlug, rowLabel, seatLabel, expiresAt }) => ({
        sectorSlug,
        rowLabel,
        seatLabel,
        expiresAt,
      }));
  }

  async expireHolds(): Promise<void> {}
}
```

- [ ] **Step 6: Rodar testes**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: hold-repo spec PASS (7 testes); suíte de seatmap inteira PASS (os repos em memória das specs existentes continuam válidos — novos métodos implementados); tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/seatmaps
git commit -m "feat(api): add seat hold domain with in-memory repository"
```

---

### Task 5: Repositórios Redis + Drizzle estendidos + expiração

**Files:**
- Create: `apps/api/src/db/hold-expiry.ts` (+spec)
- Create: `apps/api/src/modules/seatmaps/infra/redis-hold-repository.ts` (+spec de integração)
- Modify: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts` (coords, holds, expireHolds, status cru)

- [ ] **Step 1: Teste da expiração (red)**

Create `apps/api/src/db/hold-expiry.spec.ts` (integração Postgres, espelhando o setup de `seatmap.routes.integration.spec.ts`):

```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from './client.js';
import { seedFixtures } from './seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from './test-helpers.js';
import { expireExpiredHolds } from './hold-expiry.js';

describe('expireExpiredHolds (postgres integration)', () => {
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

  it('frees expired reserved seats and keeps active ones', async () => {
    const rows = await testDb.execute<{ id: string }>(sql`
      select sr.id from seat_rows sr
      join sectors s on s.id = sr.sector_id
      join events e on e.id = s.event_id
      where e.slug = 'o-fantasma-da-opera' and sr.label = 'A'
      limit 2
    `);
    const [rowA] = rows;
    await testDb.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-expired', hold_expires_at = now() - interval '1 second'
      where row_id = ${rowA.id} and label = '1'
    `);
    await testDb.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-active', hold_expires_at = now() + interval '5 minutes'
      where row_id = ${rowA.id} and label = '2'
    `);

    const freed = await expireExpiredHolds(testDb);
    expect(freed).toBe(1);

    const statuses = await testDb.execute<{ label: string; status: string; hold_user_id: string | null }>(sql`
      select label, status, hold_user_id from seats where row_id = ${rowA.id} and label in ('1', '2') order by label
    `);
    expect(statuses).toEqual([
      { label: '1', status: 'available', hold_user_id: null },
      { label: '2', status: 'reserved', hold_user_id: 'user-active' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/db/hold-expiry.spec.ts`
Expected: FAIL — `hold-expiry.js` inexistente.

- [ ] **Step 3: Implementar a expiração**

Create `apps/api/src/db/hold-expiry.ts`:

```ts
import { sql } from 'drizzle-orm';

import type { Db } from './client.js';

export async function expireExpiredHolds(db: Db): Promise<number> {
  const result = await db.execute(sql`
    update seats
    set status = 'available', hold_user_id = null, hold_expires_at = null
    where status = 'reserved' and hold_expires_at <= now()
  `);
  return result.rowCount ?? 0;
}
```

- [ ] **Step 4: Teste do repositório Redis (red)**

Create `apps/api/src/modules/seatmaps/infra/redis-hold-repository.spec.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { flushTestRedis } from '../../../db/test-helpers.js';
import { createRedis, type RedisClient } from '../../../redis/client.js';
import { holdSeatKey } from '../domain/hold-entity.js';
import { RedisHoldRepository } from './redis-hold-repository.js';

describe('RedisHoldRepository (redis integration)', () => {
  let redis: RedisClient;
  let repository: RedisHoldRepository;
  const key = holdSeatKey('event-1', 'row-1', 'seat-1');

  beforeAll(async () => {
    redis = createRedis();
    await redis.connect();
    repository = new RedisHoldRepository(redis);
  });

  beforeEach(async () => {
    await flushTestRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('claims with NX semantics', async () => {
    expect(await repository.claim(key, 'user-a', 600)).toBe('claimed');
    expect(await redis.get(key)).toBe('user-a');
    expect(await redis.ttl(key)).toBeGreaterThan(590);
  });

  it('keeps the hold for the winner and reports held for others', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.claim(key, 'user-b', 600)).toBe('held');
    expect(await redis.get(key)).toBe('user-a');
  });

  it('reports owned for the same user and renews the ttl', async () => {
    await repository.claim(key, 'user-a', 10);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await repository.claim(key, 'user-a', 600)).toBe('owned');
    expect(await redis.ttl(key)).toBeGreaterThan(590);
  });

  it('renews only for the owner', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.renew(key, 'user-b', 600)).toBe(false);
    expect(await repository.renew(key, 'user-a', 600)).toBe(true);
  });

  it('releases only for the owner', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.release(key, 'user-b')).toBe(false);
    expect(await repository.release(key, 'user-a')).toBe(true);
    expect(await redis.get(key)).toBeNull();
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/redis-hold-repository.spec.ts`
Expected: FAIL — classe inexistente.

- [ ] **Step 6: Implementar o repositório Redis**

Create `apps/api/src/modules/seatmaps/infra/redis-hold-repository.ts`:

```ts
import type { RedisClient } from '../../../redis/client.js';
import type { HoldClaimResult } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';

const RENEW_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("EXPIRE", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

export class RedisHoldRepository implements HoldRepository {
  constructor(private readonly redis: RedisClient) {}

  async claim(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<HoldClaimResult> {
    const result = await this.redis.set(seatKey, userId, 'EX', ttlSeconds, 'NX');
    if (result === 'OK') return 'claimed';
    const owner = await this.redis.get(seatKey);
    return owner === userId ? 'owned' : 'held';
  }

  async renew(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      seatKey,
      userId,
      String(ttlSeconds),
    );
    return result === 1;
  }

  async release(seatKey: string, userId: string): Promise<boolean> {
    const result = await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      seatKey,
      userId,
    );
    return result === 1;
  }
}
```

- [ ] **Step 7: Estender o DrizzleSeatmapRepository**

Modify `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts`:

1. Imports: `and`, `isNull`, `gt` (além dos já usados) de `drizzle-orm`; tabelas `events`, `sectors`; `SEAT_HOLD_TTL_SECONDS` não entra aqui; `expireExpiredHolds` de `../../../db/hold-expiry.js`; tipos `SeatCoordsLookup`, `SeatHoldRecord` do domain.
2. Implementar os três métodos novos na classe:

```ts
  async findSeatByCoords(input: {
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<SeatCoordsLookup> {
    const rows = await this.db
      .select({
        eventId: events.id,
        sectorId: sectors.id,
        rowId: seatRows.id,
        seatId: seats.id,
        seatStatus: seats.status,
        sectorName: sectors.name,
        sectorSlug: sectors.slug,
        priceFromCents: sectors.priceFromCents,
        rowLabel: seatRows.label,
        seatLabel: seats.label,
      })
      .from(events)
      .leftJoin(
        sectors,
        and(eq(sectors.eventId, events.id), eq(sectors.slug, input.sectorSlug)),
      )
      .leftJoin(
        seatRows,
        and(eq(seatRows.sectorId, sectors.id), eq(seatRows.label, input.rowLabel)),
      )
      .leftJoin(
        seats,
        and(eq(seats.rowId, seatRows.id), eq(seats.label, input.seatLabel)),
      )
      .where(eq(events.slug, input.eventSlug))
      .limit(1);

    const row = rows[0];
    if (!row) return { found: false, scope: 'event' };
    if (!row.sectorId) return { found: false, scope: 'sector' };
    if (!row.rowId || !row.seatId) return { found: false, scope: 'seat' };
    return {
      found: true,
      seat: {
        seatId: row.seatId,
        rowId: row.rowId,
        eventId: row.eventId,
        status: row.seatStatus,
        sectorSlug: row.sectorSlug ?? input.sectorSlug,
        sectorName: row.sectorName ?? '',
        priceFromCents: row.priceFromCents ?? 0,
        rowLabel: row.rowLabel ?? input.rowLabel,
        seatLabel: row.seatLabel ?? input.seatLabel,
      },
    };
  }

  async findHoldsByUser(input: {
    eventSlug: string;
    userId: string;
  }): Promise<SeatHoldRecord[]> {
    const rows = await this.db
      .select({
        sectorSlug: sectors.slug,
        rowLabel: seatRows.label,
        seatLabel: seats.label,
        expiresAt: seats.holdExpiresAt,
      })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .innerJoin(events, eq(events.id, sectors.eventId))
      .where(
        and(
          eq(seats.holdUserId, input.userId),
          gt(seats.holdExpiresAt, new Date()),
          eq(events.slug, input.eventSlug),
        ),
      );

    return rows
      .filter((row) => row.expiresAt !== null)
      .map((row) => ({
        sectorSlug: row.sectorSlug,
        rowLabel: row.rowLabel,
        seatLabel: row.seatLabel,
        expiresAt: row.expiresAt as Date,
      }));
  }

  async expireHolds(): Promise<void> {
    await expireExpiredHolds(this.db);
  }
```

3. Conferir que o select do `findSeatmap` retorna `status` cru — já retorna (`seat.status`); o mapper de `reserved`→`occupied` é da rota (Task 7), não aqui.

- [ ] **Step 8: Teste de integração do repo de seatmap estendido (coords/holds/status)**

Append em `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.integration.spec.spec.ts` (se o arquivo de integração do repo existir com outro nome, crie `drizzle-seatmap-repository.integration.spec.ts` no padrão de `hold-expiry.spec.ts`):

```ts
it('looks up seats by coords and finds holds by user', async () => {
  const lookup = await repository.findSeatByCoords({
    eventSlug: 'o-fantasma-da-opera',
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
  });
  expect(lookup.found).toBe(true);
  if (!lookup.found) return;
  expect(lookup.seat.status).toBe('available');
  expect(lookup.seat.priceFromCents).toBe(12000);

  expect(
    (
      await repository.findSeatByCoords({
        eventSlug: 'inexistente',
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
      })
    ).found,
  ).toBe(false);
  expect(
    (
      await repository.findSeatByCoords({
        eventSlug: 'o-fantasma-da-opera',
        sectorSlug: 'nao-existe',
        rowLabel: 'A',
        seatLabel: '6',
      })
    ).found,
  ).toBe(false);

  await testDb.execute(sql`
    update seats set status = 'reserved', hold_user_id = 'user-holds', hold_expires_at = now() + interval '5 minutes'
    where row_id = ${lookup.seat.rowId} and label = '6'
  `);
  const holds = await repository.findHoldsByUser({
    eventSlug: 'o-fantasma-da-opera',
    userId: 'user-holds',
  });
  expect(holds).toHaveLength(1);
  expect(holds[0]).toMatchObject({
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
  });
});
```

Setup igual aos specs de integração existentes (`ensureTestDatabase`, `migrateTestDatabase`, `resetDatabase`+`seedFixtures`, `repository = new DrizzleSeatmapRepository(testDb)`).

- [ ] **Step 9: Rodar testes**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/db/hold-expiry.spec.ts src/modules/seatmaps/infra && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS — hold-expiry (1), redis-hold (5), coords/holds (1); tsc limpo.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/db/hold-expiry.ts apps/api/src/db/hold-expiry.spec.ts apps/api/src/modules/seatmaps/infra
git commit -m "feat(api): mirror seat holds in redis and postgres"
```

---

### Task 6: Use cases (hold, release, seatmap com holds)

**Files:**
- Create: `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.ts` (+spec)
- Create: `apps/api/src/modules/seatmaps/use-cases/release-hold.use-case.ts` (+spec)
- Modify: `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.ts` (+spec)
- Modify: `apps/api/src/modules/seatmaps/use-cases/find-best-seat.use-case.ts` (+spec)

- [ ] **Step 1: Teste do hold-seat (red)**

Create `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.spec.ts`:

```ts
import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { HoldSeatUseCase } from './hold-seat.use-case.js';

const seatmap: SeatmapEntity = {
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
            { label: '3', status: 'reserved' },
          ],
        },
      ],
    },
  ],
};

function createUseCase(nowMs = Date.parse('2026-10-16T12:00:00.000Z')) {
  const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
  const holdRepository = new InMemoryHoldRepository(() => new Date(nowMs));
  const useCase = new HoldSeatUseCase(seatmapRepository, holdRepository, () => new Date(nowMs));
  return { useCase, holdRepository };
}

const baseInput = {
  eventSlug: 'o-fantasma-da-opera',
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: '1',
};

describe('HoldSeatUseCase', () => {
  it('holds an available seat for the user', async () => {
    const { useCase } = createUseCase();
    const result = await useCase.execute({ userId: 'user-a', ...baseInput });
    expect(result.kind).toBe('held');
    if (result.kind !== 'held') return;
    expect(result.hold).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(result.hold.expiresAt.toISOString()).toBe(
      '2026-10-16T12:10:00.000Z',
    );
    expect(result.renewed).toBe(false);
  });

  it('renews when the same user claims again', async () => {
    const { useCase } = createUseCase();
    await useCase.execute({ userId: 'user-a', ...baseInput });
    const result = await useCase.execute({ userId: 'user-a', ...baseInput });
    expect(result.kind).toBe('held');
    if (result.kind !== 'held') return;
    expect(result.renewed).toBe(true);
  });

  it('reports seat_held when another user owns the hold', async () => {
    const { useCase } = createUseCase();
    await useCase.execute({ userId: 'user-a', ...baseInput });
    const result = await useCase.execute({ userId: 'user-b', ...baseInput });
    expect(result.kind).toBe('seat_held');
  });

  it('reports seat_unavailable for occupied and reserved seats', async () => {
    const { useCase } = createUseCase();
    const occupied = await useCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '2',
    });
    expect(occupied.kind).toBe('seat_unavailable');
    const reserved = await useCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '3',
    });
    expect(reserved.kind).toBe('seat_unavailable');
  });

  it('distinguishes event, sector and seat misses', async () => {
    const { useCase } = createUseCase();
    expect(
      (await useCase.execute({ userId: 'user-a', ...baseInput, eventSlug: 'x' }))
        .kind,
    ).toBe('event_not_found');
    expect(
      (
        await useCase.execute({
          userId: 'user-a',
          ...baseInput,
          sectorSlug: 'x',
        })
      ).kind,
    ).toBe('sector_not_found');
    expect(
      (
        await useCase.execute({ userId: 'user-a', ...baseInput, seatLabel: '9' })
      ).kind,
    ).toBe('seat_not_found');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/hold-seat.use-case.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar hold-seat**

Create `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.ts`:

```ts
import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';

import { holdSeatKey, type Hold } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type HoldSeatResult =
  | { kind: 'held'; hold: Hold; renewed: boolean }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'seat_not_found' }
  | { kind: 'seat_unavailable' }
  | { kind: 'seat_held' };

export class HoldSeatUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<HoldSeatResult> {
    await this.seatmapRepository.expireHolds();

    const lookup = await this.seatmapRepository.findSeatByCoords({
      eventSlug: input.eventSlug,
      sectorSlug: input.sectorSlug,
      rowLabel: input.rowLabel,
      seatLabel: input.seatLabel,
    });
    if (!lookup.found) {
      if (lookup.scope === 'event') return { kind: 'event_not_found' };
      if (lookup.scope === 'sector') return { kind: 'sector_not_found' };
      return { kind: 'seat_not_found' };
    }

    const { seat } = lookup;
    if (seat.status !== 'available') {
      return { kind: 'seat_unavailable' };
    }

    const seatKey = holdSeatKey(seat.eventId, seat.rowId, seat.seatId);
    const claim = await this.holdRepository.claim(
      seatKey,
      input.userId,
      SEAT_HOLD_TTL_SECONDS,
    );
    if (claim === 'held') {
      return { kind: 'seat_held' };
    }

    const expiresAt = new Date(
      this.now().getTime() + SEAT_HOLD_TTL_SECONDS * 1000,
    );

    if (claim === 'claimed') {
      await this.seatmapRepository.reserveSeat({
        seatId: seat.seatId,
        userId: input.userId,
        expiresAt,
      });
    } else {
      await this.seatmapRepository.renewSeatHold({
        seatId: seat.seatId,
        userId: input.userId,
        expiresAt,
      });
    }

    return {
      kind: 'held',
      renewed: claim === 'owned',
      hold: {
        sectorSlug: seat.sectorSlug,
        rowLabel: seat.rowLabel,
        seatLabel: seat.seatLabel,
        expiresAt,
      },
    };
  }
}
```

O use case chama `reserveSeat`/`rennovSeatHold` — adicione esses métodos à interface e aos dois repositórios (mudança pequena que acompanha esta task):

Em `seatmap-repository.ts` (interface):

```ts
  reserveSeat(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean>;
  renewSeatHold(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean>;
```

`InMemorySeatmapRepository` (mantém o estado nos seats quando o status é editável — implementação enxuta: localizar o seat pelo id sintético e setar `status='reserved'` + guardar expiresAt num Map paralelo; `renewSeatHold` só estende se já reserved para o mesmo user — para os testes deste use case, o retorno `true` basta quando o seat existe e está available/reserved):

```ts
  private readonly seatHolds = new Map<
    string,
    { userId: string; expiresAt: Date }
  >();

  async reserveSeat(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    for (const seatmap of this.seatmaps.values()) {
      for (const sector of seatmap.sectors) {
        for (const row of sector.rows) {
          for (const seat of row.seats) {
            const id = `${seatmap.eventSlug}:${sector.slug}:${row.label}:${seat.label}`;
            if (id === input.seatId && seat.status === 'available') {
              seat.status = 'reserved';
              this.seatHolds.set(input.seatId, {
                userId: input.userId,
                expiresAt: input.expiresAt,
              });
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  async renewSeatHold(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const hold = this.seatHolds.get(input.seatId);
    if (!hold || hold.userId !== input.userId) return false;
    hold.expiresAt = input.expiresAt;
    return true;
  }
```

`DrizzleSeatmapRepository`:

```ts
  async reserveSeat(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.db
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: input.userId,
        holdExpiresAt: input.expiresAt,
      })
      .where(and(eq(seats.id, input.seatId), eq(seats.status, 'available')));
    return (result.rowCount ?? 0) > 0;
  }

  async renewSeatHold(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.db
      .update(seats)
      .set({ holdExpiresAt: input.expiresAt })
      .where(
        and(eq(seats.id, input.seatId), eq(seats.holdUserId, input.userId)),
      );
    return (result.rowCount ?? 0) > 0;
  }
```

Se `reserveSeat` devolver `false` (corrida perdida no espelho), o use case deve devolver `{ kind: 'seat_held' }` — ajuste o bloco `claim === 'claimed'`:

```ts
    if (claim === 'claimed') {
      const mirrored = await this.seatmapRepository.reserveSeat({
        seatId: seat.seatId,
        userId: input.userId,
        expiresAt,
      });
      if (!mirrored) {
        return { kind: 'seat_held' };
      }
    } else {
```

- [ ] **Step 4: release-hold (red → verde)**

Create `apps/api/src/modules/seatmaps/use-cases/release-hold.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { HoldSeatUseCase } from './hold-seat.use-case.js';
import { ReleaseHoldUseCase } from './release-hold.use-case.js';

const seatmap: SeatmapEntity = {
  eventSlug: 'o-fantasma-da-opera',
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      rows: [{ label: 'A', seats: [{ label: '1', status: 'available' }] }],
    },
  ],
};

describe('ReleaseHoldUseCase', () => {
  it('releases an owned hold and frees the seat', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
    const holdRepository = new InMemoryHoldRepository();
    const holdSeat = new HoldSeatUseCase(seatmapRepository, holdRepository);
    const release = new ReleaseHoldUseCase(seatmapRepository, holdRepository);

    await holdSeat.execute({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });

    const result = await release.execute({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(result.kind).toBe('released');

    const holds = await seatmapRepository.findHoldsByUser({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-a',
    });
    expect(holds).toHaveLength(0);
    const seat = await seatmapRepository.findSeatByCoords({
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(seat.found && seat.seat.status).toBe('available');
  });

  it('reports hold_not_found for foreign or missing holds', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
    const holdRepository = new InMemoryHoldRepository();
    const release = new ReleaseHoldUseCase(seatmapRepository, holdRepository);

    const result = await release.execute({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(result.kind).toBe('hold_not_found');
  });
});
```

Create `apps/api/src/modules/seatmaps/use-cases/release-hold.use-case.ts`:

```ts
import { holdSeatKey } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type ReleaseHoldResult =
  | { kind: 'released' }
  | { kind: 'hold_not_found' }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'seat_not_found' };

export class ReleaseHoldUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<ReleaseHoldResult> {
    await this.seatmapRepository.expireHolds();

    const lookup = await this.seatmapRepository.findSeatByCoords({
      eventSlug: input.eventSlug,
      sectorSlug: input.sectorSlug,
      rowLabel: input.rowLabel,
      seatLabel: input.seatLabel,
    });
    if (!lookup.found) {
      if (lookup.scope === 'event') return { kind: 'event_not_found' };
      if (lookup.scope === 'sector') return { kind: 'sector_not_found' };
      return { kind: 'seat_not_found' };
    }

    const { seat } = lookup;
    const seatKey = holdSeatKey(seat.eventId, seat.rowId, seat.seatId);
    const released = await this.holdRepository.release(seatKey, input.userId);
    if (!released) {
      return { kind: 'hold_not_found' };
    }

    await this.seatmapRepository.releaseSeat({
      seatId: seat.seatId,
      userId: input.userId,
    });
    return { kind: 'released' };
  }
}
```

Mais um método na interface/repositórios — `releaseSeat`:

Interface:

```ts
  releaseSeat(input: { seatId: string; userId: string }): Promise<void>;
```

In-memory: voltar `status='available'` + apagar do Map de holds quando o id casa. Drizzle:

```ts
  async releaseSeat(input: { seatId: string; userId: string }): Promise<void> {
    await this.db
      .update(seats)
      .set({ status: 'available', holdUserId: null, holdExpiresAt: null })
      .where(
        and(eq(seats.id, input.seatId), eq(seats.holdUserId, input.userId)),
      );
  }
```

- [ ] **Step 5: GetSeatmapUseCase com holds + expireHolds**

Modify `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.ts` — assinatura nova `execute(eventSlug: string, userId?: string)` retornando `{ seatmap: SeatmapEntity; holds: SeatHoldRecord[] } | null`:

```ts
import type {
  SeatHoldRecord,
  SeatmapRepository,
} from '../domain/seatmap-repository.js';
import type { SeatmapEntity } from '../domain/seatmap-entity.js';

export class GetSeatmapUseCase {
  constructor(private readonly seatmapRepository: SeatmapRepository) {}

  async execute(
    eventSlug: string,
    userId?: string,
  ): Promise<{ seatmap: SeatmapEntity; holds: SeatHoldRecord[] } | null> {
    await this.seatmapRepository.expireHolds();
    const seatmap = await this.seatmapRepository.findSeatmap(eventSlug);
    if (!seatmap) return null;
    const holds = userId
      ? await this.seatmapRepository.findHoldsByUser({ eventSlug, userId })
      : [];
    return { seatmap, holds };
  }
}
```

Atualizar `get-seatmap.use-case.spec.ts`: stubs do repositório ganham os métodos novos (`vi.fn()` nos novos) e o retorno esperado vira `{ seatmap, holds: [] }` — adicionar teste: `execute(slug, 'user-a')` devolve `holds` do repo quando `findHoldsByUser` resolve um hold.

- [ ] **Step 6: FindBestSeatUseCase: expireHolds no início**

Modify `find-best-seat.use-case.ts` — primeira linha do `execute`: `await this.seatmapRepository.expireHolds();`. No spec existente, o stub `findSeatmap` permanece; adicionar `expireHolds: vi.fn()` ao stub.

- [ ] **Step 7: Rodar testes**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: todos PASS (hold-seat 5, release 2, get-seatmap +holds, best-seat existentes); tsc limpo.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/seatmaps
git commit -m "feat(api): add hold seat and release hold use cases"
```

---

### Task 7: Rotas de hold + wiring (sessão, Redis lazy, mapper 'reserved')

**Files:**
- Create: `apps/api/src/modules/auth/get-session.ts`
- Create: `apps/api/src/modules/seatmaps/routes/holds.routes.ts` (+unit spec)
- Create: `apps/api/src/modules/seatmaps/routes/holds.routes.integration.spec.ts`
- Modify: `apps/api/src/modules/seatmaps/routes/seatmap.routes.ts` (+spec de unidade)
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: GetSessionFn**

Create `apps/api/src/modules/auth/get-session.ts`:

```ts
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';

import type { AuthInstance } from './auth.js';

export interface SessionUser {
  userId: string;
}

export type GetSessionFn = (
  headers: IncomingHttpHeaders,
) => Promise<SessionUser | null>;

export function createGetSession(auth: AuthInstance): GetSessionFn {
  return async (headers) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) return null;
    return { userId: session.user.id };
  };
}
```

- [ ] **Step 2: Teste unitário das rotas de hold (red)**

Create `apps/api/src/modules/seatmaps/routes/holds.routes.spec.ts` (padrão das specs de rota existentes — buildApp com stubs):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type { HoldSeatUseCase } from '../use-cases/hold-seat.use-case.js';
import type { ReleaseHoldUseCase } from '../use-cases/release-hold.use-case.js';

const holdSeat = {
  execute: vi.fn(),
} as unknown as HoldSeatUseCase;
const releaseHold = {
  execute: vi.fn(),
} as unknown as ReleaseHoldUseCase;

const heldResponse = {
  kind: 'held',
  renewed: false,
  hold: {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
    expiresAt: new Date('2026-10-16T12:10:00.000Z'),
  },
};

function buildTestApp(getSession: () => Promise<{ userId: string } | null>) {
  return buildApp({
    holdSeat,
    releaseHold,
    getSession,
    eventsRepository: { findMany: vi.fn(), findByIdOrSlug: vi.fn(), findBySlug: vi.fn(), suggest: vi.fn() } as never,
  });
}

describe('hold routes (unit)', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    const app = buildTestApp(async () => null);
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(holdSeat.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 on invalid body', async () => {
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: '', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_body');
    await app.close();
  });

  it('returns 201 with the hold', async () => {
    vi.mocked(holdSeat.execute).mockResolvedValueOnce(heldResponse);
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(201);
    expect(holdSeat.execute).toHaveBeenCalledWith({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
    });
    await app.close();
  });

  it('maps 409 seat_held and 404 kinds', async () => {
    vi.mocked(holdSeat.execute).mockResolvedValueOnce({ kind: 'seat_held' });
    const app = buildTestApp(async () => ({ userId: 'user-b' }));
    const held = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(held.statusCode).toBe(409);
    expect(held.json()).toEqual({ error: 'seat_held' });
    await app.close();
  });

  it('releases with 200 and 404s hold_not_found', async () => {
    vi.mocked(releaseHold.execute).mockResolvedValueOnce({ kind: 'released' });
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const released = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds/release',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(released.statusCode).toBe(200);
    expect(released.json()).toEqual({ released: true });

    vi.mocked(releaseHold.execute).mockResolvedValueOnce({
      kind: 'hold_not_found',
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds/release',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'hold_not_found' });
    await app.close();
  });
});
```

(Ajuste o stub de `eventsRepository` ao formato real dos specs de rota existentes — o ponto é: buildApp só precisa dos stubs dos repositórios que os use cases default construiriam; para as rotas de hold, injete `holdSeat`/`releaseHold`/`getSession` direto via `options` — ver Step 4 onde `buildApp` passa a aceitar essas opções. Se o buildApp atual exigir mais stubs, copie o mínimo dos specs existentes.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes/holds.routes.spec.ts`
Expected: FAIL — opções `holdSeat`/`getSession` não existem em `buildApp`.

- [ ] **Step 4: Implementar rotas + app wiring**

Create `apps/api/src/modules/seatmaps/routes/holds.routes.ts`:

```ts
import {
  holdRequestSchema,
  holdResponseSchema,
  releaseResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { HoldSeatUseCase } from '../use-cases/hold-seat.use-case.js';
import type { ReleaseHoldUseCase } from '../use-cases/release-hold.use-case.js';

interface HoldRoutesDeps {
  getSession: GetSessionFn;
  holdSeat: HoldSeatUseCase;
  releaseHold: ReleaseHoldUseCase;
}

export function registerHoldRoutes(app: FastifyInstance, deps: HoldRoutesDeps): void {
  app.post('/events/:slug/holds', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = holdRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.holdSeat.execute({
      userId: session.userId,
      eventSlug: slug,
      sectorSlug: parsed.data.sectorSlug,
      rowLabel: parsed.data.rowLabel,
      seatLabel: parsed.data.seatLabel,
    });
    switch (result.kind) {
      case 'event_not_found':
      case 'sector_not_found':
      case 'seat_not_found':
        return reply.code(404).send({ error: result.kind });
      case 'seat_unavailable':
        return reply.code(409).send({ error: 'seat_unavailable' });
      case 'seat_held':
        return reply.code(409).send({ error: 'seat_held' });
      case 'held': {
        const payload = holdResponseSchema.parse({
          hold: {
            sectorSlug: result.hold.sectorSlug,
            rowLabel: result.hold.rowLabel,
            seatLabel: result.hold.seatLabel,
            expiresAt: result.hold.expiresAt.toISOString(),
          },
        });
        return reply.code(result.renewed ? 200 : 201).send(payload);
      }
    }
  });

  app.post('/events/:slug/holds/release', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = holdRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.releaseHold.execute({
      userId: session.userId,
      eventSlug: slug,
      sectorSlug: parsed.data.sectorSlug,
      rowLabel: parsed.data.rowLabel,
      seatLabel: parsed.data.seatLabel,
    });
    switch (result.kind) {
      case 'event_not_found':
      case 'sector_not_found':
      case 'seat_not_found':
      case 'hold_not_found':
        return reply.code(404).send({ error: 'hold_not_found' });
      case 'released':
        return reply.send(releaseResponseSchema.parse({ released: true }));
    }
  });
}
```

Modify `apps/api/src/modules/seatmaps/routes/seatmap.routes.ts`:

1. Deps ganham `getSession: GetSessionFn`.
2. Handler do GET seatmap:

```ts
  app.get('/events/:slug/seatmap', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const session = await deps.getSession(request.headers);
    const result = await deps.getSeatmap.execute(slug, session?.userId);
    if (!result) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const sectors = result.seatmap.sectors
      .filter((sector) => sector.rows.length > 0)
      .map((sector) => ({
        ...sector,
        rows: sector.rows.map((row) => ({
          ...row,
          seats: row.seats.map((seat) => ({
            label: seat.label,
            status: seat.status === 'reserved' ? ('occupied' as const) : seat.status,
          })),
        })),
      }));
    const payload = seatmapResponseSchema.parse({
      seatmap: { eventSlug: result.seatmap.eventSlug, sectors },
      holds: result.holds.map((hold) => ({
        sectorSlug: hold.sectorSlug,
        rowLabel: hold.rowLabel,
        seatLabel: hold.seatLabel,
        expiresAt: hold.expiresAt.toISOString(),
      })),
    });
    return reply.send(payload);
  });
```

Atualizar a spec unitária existente `seatmap.routes.spec.ts`: stub `getSession: async () => null` no buildTestApp e `getSeatmap.execute` devolvendo `{ seatmap, holds: [] }`.

Modify `apps/api/src/app.ts`:

1. Mover a criação do `authInstance` + `registerAuthRoutes` para **antes** do registro das rotas de seatmap.
2. Opções novas em `buildApp`:

```ts
    holdSeat?: HoldSeatUseCase;
    releaseHold?: ReleaseHoldUseCase;
    getSession?: GetSessionFn;
    holdRepository?: HoldRepository;
```

3. Wiring (Redis lazy — só é criado se uma rota de hold precisar do use case default):

```ts
  let defaultRedis: RedisClient | null = null;
  const getHoldRepository = (): HoldRepository => {
    if (options.holdRepository) return options.holdRepository;
    if (!defaultRedis) {
      defaultRedis = createRedis();
      defaultRedis.connect().catch(() => {});
    }
    return new RedisHoldRepository(defaultRedis);
  };

  app.addHook('onClose', async () => {
    await defaultRedis?.quit().catch(() => {});
  });

  const authInstance =
    options.auth ?? createAuth(getDefaultDb(), { sendEmail });
  registerAuthRoutes(app, authInstance);

  const getSession =
    options.getSession ?? createGetSession(authInstance);

  registerSeatmapRoutes(app, {
    getSeatmap: new GetSeatmapUseCase(seatmapRepository),
    findBestSeat: new FindBestSeatUseCase(seatmapRepository),
    getSession,
  });

  registerHoldRoutes(app, {
    getSession,
    holdSeat:
      options.holdSeat ??
      new HoldSeatUseCase(seatmapRepository, getHoldRepository()),
    releaseHold:
      options.releaseHold ??
      new ReleaseHoldUseCase(seatmapRepository, getHoldRepository()),
  });
```

com os imports novos (`RedisClient`/`createRedis`, `RedisHoldRepository`, `HoldRepository`, use cases, `registerHoldRoutes`, `createGetSession`). Remova o `auth` do bloco antigo (já movido). Mantenha `app.addHook('onClose')` do `defaultDb` existente.

- [ ] **Step 5: Rodar unitários**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: holds.routes.spec PASS; seatmap.routes.spec PASS (atualizado); tsc limpo.

- [ ] **Step 6: Teste de integração + corrida (red → verde)**

Create `apps/api/src/modules/seatmaps/routes/holds.routes.integration.spec.ts`:

```ts
import { holdResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  flushTestRedis,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { createRedis, type RedisClient } from '../../../redis/client.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { DrizzleSeatmapRepository } from '../infra/drizzle-seatmap-repository.js';
import { RedisHoldRepository } from '../infra/redis-hold-repository.js';
import { HoldSeatUseCase } from '../use-cases/hold-seat.use-case.js';
import { ReleaseHoldUseCase } from '../use-cases/release-hold.use-case.js';
import { GetSeatmapUseCase } from '../use-cases/get-seatmap.use-case.js';
import { FindBestSeatUseCase } from '../use-cases/find-best-seat.use-case.js';
import { registerHoldRoutes } from './holds.routes.js';
import { registerSeatmapRoutes } from './seatmap.routes.js';

describe('hold routes (postgres + redis integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;
  let redis: RedisClient;

  const getSession = async (headers: Record<string, unknown>) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    return { userId };
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    redis = createRedis();
    await redis.connect();

    app = buildApp();
    const seatmapRepository = new DrizzleSeatmapRepository(testDb);
    const holdRepository = new RedisHoldRepository(redis);
    app.register(async (instance) => {
      registerSeatmapRoutes(instance, {
        getSeatmap: new GetSeatmapUseCase(seatmapRepository),
        findBestSeat: new FindBestSeatUseCase(seatmapRepository),
        getSession,
      });
      registerHoldRoutes(instance, {
        getSession,
        holdSeat: new HoldSeatUseCase(seatmapRepository, holdRepository),
        releaseHold: new ReleaseHoldUseCase(seatmapRepository, holdRepository),
      });
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    await flushTestRedis();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
    await testDb.$client.end();
  });
```

Os testes do arquivo:

```ts
  const holdPayload = {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
  };

  it('holds a seat and reflects it on the seatmap', async () => {
    const holdResponse = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(holdResponse.statusCode).toBe(201);
    const body = holdResponseSchema.parse(holdResponse.json());
    expect(body.hold).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
    });

    const renew = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(renew.statusCode).toBe(200);

    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(map.statusCode).toBe(200);
    const seatmapBody = map.json();
    expect(seatmapBody.holds).toHaveLength(1);
    const plateia = seatmapBody.seatmap.sectors.find(
      (sector: { slug: string }) => sector.slug === 'plateia',
    );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('occupied');

    const otherBuyer = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
      headers: { 'x-test-user-id': 'user-b' },
    });
    expect(otherBuyer.json().holds).toHaveLength(0);
  });

  it('lets exactly one of two concurrent buyers win the seat', async () => {
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/events/o-fantasma-da-opera/holds',
        headers: { 'x-test-user-id': 'user-a' },
        payload: holdPayload,
      }),
      app.inject({
        method: 'POST',
        url: '/events/o-fantasma-da-opera/holds',
        headers: { 'x-test-user-id': 'user-b' },
        payload: holdPayload,
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = first.statusCode === 201 ? first : second;
    const winnerBody = holdResponseSchema.parse(winner.json());
    expect(winnerBody.hold.seatLabel).toBe('6');

    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
    });
    const plateia = map.json().seatmap.sectors.find(
      (sector: { slug: string }) => sector.slug === 'plateia',
    );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('occupied');
  });

  it('requires a session (401)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: holdPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('reports 404 kinds and seat_unavailable', async () => {
    const missingSeat = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '99' },
    });
    expect(missingSeat.statusCode).toBe(404);

    const missingEvent = await app.inject({
      method: 'POST',
      url: '/events/nao-existe/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(missingEvent.statusCode).toBe(404);

    const occupied = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '7' },
    });
    expect(occupied.statusCode).toBe(409);
    expect(occupied.json()).toEqual({ error: 'seat_unavailable' });
  });

  it('releases a hold back to available', async () => {
    await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    const release = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds/release',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    expect(release.statusCode).toBe(200);

    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(map.json().holds).toHaveLength(0);
    const plateia = map.json().seatmap.sectors.find(
      (sector: { slug: string }) => sector.slug === 'plateia',
    );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('available');
  });

  it('frees an expired hold at read time', async () => {
    await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: holdPayload,
    });
    await testDb.execute(
      (await import('drizzle-orm')).sql`
        update seats set hold_expires_at = now() - interval '1 second'
        where hold_user_id = 'user-a'
      `,
    );
    const map = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/seatmap',
    });
    const plateia = map.json().seatmap.sectors.find(
      (sector: { slug: string }) => sector.slug === 'plateia',
    );
    const seatSix = plateia.rows
      .find((row: { label: string }) => row.label === 'A')
      .seats.find((seat: { label: string }) => seat.label === '6');
    expect(seatSix.status).toBe('available');
    expect(map.json().holds).toHaveLength(0);
  });
```

(A7 — A9 usam Cadeira 6 como alvo; o B-7 do seed é 'occupied' — confirme o label ocupado no seed de fixtures antes de fixar o `seatLabel` do 409; se a ocupada for outra, ajuste. `buildApp()` sem repositórios aqui é proposital: rotas são registradas via `app.register` próprio com os repos de teste — se o `buildApp()` default conectar Redis/db dev indesejado, injete `holdRepository: new InMemoryHoldRepository()` e `eventsRepository` stub mínimo como nas specs de rota; o critério é: integração usa **postgres de teste + redis de teste**, nunca o dev.)

- [ ] **Step 7: Rodar integração**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps`
Expected: todas PASS, incluindo a corrida (exatamente `[201, 409]`).

- [ ] **Step 8: Rodar a suíte API inteira (contrato de seatmapResponse)**

Run: `pnpm --filter @ticketvibe/api exec vitest run`
Expected: PASS — integração de seatmap do ticket 10 agora parseia `holds` emitidos pela rota (200 com `holds: []` para visitantes).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules apps/api/src/app.ts
git commit -m "feat(api): expose seat hold endpoints with session"
```

---

### Task 8: Proxies web de hold/release + cookie no seatmap

**Files:**
- Create: `apps/web/src/app/api/events/[slug]/holds/route.ts` (+spec)
- Create: `apps/web/src/app/api/events/[slug]/holds/release/route.ts` (+spec)
- Modify: `apps/web/src/app/api/events/[slug]/seatmap/route.ts` (+spec — forward de cookie)

- [ ] **Step 1: Testes dos proxies (red)**

Create `apps/web/src/app/api/events/[slug]/holds/route.spec.ts` (padrão dos specs de proxy existentes):

```ts
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST } from './route.js';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

const holdPayload = {
  hold: {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
    expiresAt: '2026-10-16T12:10:00.000Z',
  },
};

function request(): Request {
  return new Request('http://localhost:3000/api/events/o-fantasma-da-opera/holds', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=abc',
    },
    body: JSON.stringify({ sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' }),
  });
}

describe('POST /api/events/[slug]/holds', () => {
  it('forwards body and cookie and returns 201', async () => {
    let forwardedCookie = '';
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', async ({ request: upstream }) => {
        forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
        return HttpResponse.json(holdPayload, { status: 201 });
      }),
    );

    const res = await POST(request(), context);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(holdPayload);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('passes 401 through', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('passes 409 seat_held through', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ error: 'seat_held' }, { status: 409 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(409);
  });

  it('validates the body before calling upstream', async () => {
    let called = false;
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () => {
        called = true;
        return HttpResponse.json(holdPayload, { status: 201 });
      }),
    );
    const bad = new Request('http://localhost:3000/api/events/o-fantasma-da-opera/holds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectorSlug: '', rowLabel: 'A', seatLabel: '6' }),
    });
    const res = await POST(bad, context);
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('returns 502 on upstream failure', async () => {
    server.use(
      http.post('http://localhost:3001/events/o-fantasma-da-opera/holds', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const res = await POST(request(), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
  });
});
```

Spec do release (`holds/release/route.spec.ts`): mesmo padrão — 200 `{released:true}`, 404 `hold_not_found` forward, 401 forward, body invalid → 400, upstream 500 → 502.

Spec do seatmap: adicionar teste `forwards the session cookie` (mock upstream captura header cookie; antes não havia).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/events`
Expected: novos specs FAIL (rotas inexistentes).

- [ ] **Step 3: Implementar proxies**

Create `apps/web/src/app/api/events/[slug]/holds/route.ts`:

```ts
import { holdRequestSchema, holdResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type HoldContext = { params: Promise<{ slug: string }> };

export async function POST(
  request: Request,
  context: HoldContext,
): Promise<Response> {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = holdRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/holds`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: request.headers.get('cookie') ?? '',
        },
        body: JSON.stringify(parsed.data),
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch (error) {
    console.error('Hold upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 401) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (upstream.status === 404 || upstream.status === 409) {
    try {
      const body = await upstream.json();
      return Response.json(body, { status: upstream.status });
    } catch (error) {
      console.error('Hold upstream error body was not json:', error);
      return Response.json({ error: 'upstream_error' }, { status: 502 });
    }
  }
  if (!upstream.ok) {
    console.error(`Hold upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = holdResponseSchema.parse(await upstream.json());
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    console.error('Hold upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
```

Create `apps/web/src/app/api/events/[slug]/holds/release/route.ts` — idêntico em espírito, com `releaseResponseSchema` no sucesso, forward de 404/401, 502 nos demais.

Modify `apps/web/src/app/api/events/[slug]/seatmap/route.ts` — no `fetch`, repassar cookie:

```ts
  request: Request,
  ...
    upstream = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/seatmap`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
```

(trocar `_request` por `request`).

- [ ] **Step 4: Rodar testes**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/events && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS (proxies novos + cookie forward); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/events"
git commit -m "feat(web): proxy seat hold endpoints with session cookie"
```

---

### Task 9: Componente SeatMap (hold, contagem, renovação, polling)

**Files:**
- Modify: `apps/web/src/components/seat-map.tsx`
- Test: `apps/web/src/components/seat-map.spec.tsx`

- [ ] **Step 1: Testes novos + atualização dos existentes (red)**

Modifique `apps/web/src/components/seat-map.spec.tsx`:

1. `seatmapPayload` ganha `holds: []` (Task 2 já fez — confirme).
2. Handlers helper novos:

```ts
function useHold(seatLabel = '6', status: number = 201) {
  server.use(
    http.post(
      /\/api\/events\/o-fantasma-da-opera\/holds$/,
      () =>
        HttpResponse.json(
          {
            hold: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
          { status },
        ),
    ),
  );
}

function useRelease() {
  server.use(
    http.post(
      /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
      () => HttpResponse.json({ released: true }),
    ),
  );
}
```

3. Testes existentes de clique/best-seat passam a chamar `useHold()` (e `useRelease()` onde há troca de setor com seleção).
4. Novos testes no `describe('SeatMap')`:

```ts
  it('holds the seat on selection and shows the countdown', async () => {
    useSeatmap();
    useHold();
    useRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cadeira 6, fila A' }));

    expect(
      await screen.findByText(/Reserva expira em \d{2}:\d{2}/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desistir da reserva' })).toBeInTheDocument();
    expect(
      await screen.findByText('Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00'),
    ).toBeInTheDocument();
  });

  it('restores the hold from the seatmap response', async () => {
    server.use(
      http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
        HttpResponse.json({
          ...seatmapPayload,
          holds: [
            {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '1',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          ],
        }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(
      await screen.findByText('Você selecionou: Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reserva expira em/)).toBeInTheDocument();
  });

  it('renews automatically when the countdown is low', async () => {
    vi.useFakeTimers();
    try {
      server.use(
        http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
          HttpResponse.json({
            ...seatmapPayload,
            holds: [
              {
                sectorSlug: 'plateia',
                rowLabel: 'A',
                seatLabel: '1',
                expiresAt: new Date(Date.now() + 100_000).toISOString(),
              },
            ],
          }),
        ),
      );
      let renewCalls = 0;
      server.use(
        http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () => {
          renewCalls += 1;
          return HttpResponse.json(
            {
              hold: {
                sectorSlug: 'plateia',
                rowLabel: 'A',
                seatLabel: '1',
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
            },
            { status: 200 },
          );
        }),
      );
      render(<SeatMap eventSlug="o-fantasma-da-opera" />);
      await screen.findByText(/Reserva expira em/);

      await vi.advanceTimersByTimeAsync(1_500);
      expect(renewCalls).toBe(1);
      expect(screen.getByText('Reserva renovada')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the hold when the buyer gives up', async () => {
    useSeatmap();
    useHold();
    let released = false;
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        () => {
          released = true;
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cadeira 6, fila A' }));
    await screen.findByText(/Reserva expira em/);

    fireEvent.click(screen.getByRole('button', { name: 'Desistir da reserva' }));
    await vi.waitFor(() => expect(released).toBe(true));
    expect(screen.queryByText(/Reserva expira em/)).not.toBeInTheDocument();
  });

  it('reverts the selection when the seat was just taken', async () => {
    useSeatmap();
    useHold('6', 409);
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cadeira 6, fila A' }));

    expect(
      await screen.findByText('Este assento acabou de ser reservado por outro comprador.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00')).not.toBeInTheDocument();
  });

  it('signs in anonymously and retries when the hold gets a 401', async () => {
    useSeatmap();
    let anonymousCalls = 0;
    let holdCalls = 0;
    server.use(
      http.post(/\/api\/auth\/sign-in\/anonymous$/, () => {
        anonymousCalls += 1;
        return HttpResponse.json({ token: 'anonymous-token' });
      }),
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds$/,
        () => {
          holdCalls += 1;
          if (holdCalls === 1) {
            return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
          }
          return HttpResponse.json(
            {
              hold: {
                sectorSlug: 'plateia',
                rowLabel: 'A',
                seatLabel: '6',
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
            },
            { status: 201 },
          );
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cadeira 6, fila A' }));

    expect(
      await screen.findByText('Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(anonymousCalls).toBe(1);
    expect(holdCalls).toBe(2);
  });

  it('polls the seatmap while mounted', async () => {
    vi.useFakeTimers();
    try {
      let gets = 0;
      server.use(
        http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
          gets += 1;
          return HttpResponse.json(seatmapPayload);
        }),
      );
      render(<SeatMap eventSlug="o-fantasma-da-opera" />);
      await vi.advanceTimersByTimeAsync(0);
      expect(gets).toBe(1);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(gets).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
```

(Importe `vi` de vitest se ainda não.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/seat-map.spec.tsx`
Expected: novos testes FAIL; alguns existentes também (clique agora precisa de hold).

- [ ] **Step 3: Reescrever o componente**

Rewrite `apps/web/src/components/seat-map.tsx` completo:

```tsx
'use client';

import {
  SEAT_HOLD_RENEW_AFTER_SECONDS,
  type SeatmapDto,
  holdRequestSchema,
  holdResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import { cn } from 'cn';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { authClient } from '@/lib/auth-client';

type SelectedSeat = {
  sectorSlug: string;
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
};

const POLL_MS = 10_000;
const TICK_MS = 1_000;

class HoldConflictError extends Error {}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toSelectedSeat(
  seatmap: SeatmapDto,
  sectorSlug: string,
  rowLabel: string,
  seatLabel: string,
): SelectedSeat | null {
  const sector = seatmap.sectors.find((item) => item.slug === sectorSlug);
  if (!sector) return null;
  return {
    sectorSlug: sector.slug,
    sectorName: sector.name,
    rowLabel,
    seatLabel,
    priceFromCents: sector.priceFromCents,
  };
}

async function postHold(seat: SelectedSeat): Promise<Response> {
  const body = holdRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
  });
  return fetch(`/api/events/${encodeURIComponent(seat.sectorSlug)}/../holds`.replace('/../', '/'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}
```

**Correção obrigatória do helper acima** (o `eventSlug` precisa participar da URL — a versão final é):

```tsx
async function postHold(eventSlug: string, seat: SelectedSeat): Promise<Response> {
  const body = holdRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
  });
  return fetch(
    `/api/events/${encodeURIComponent(eventSlug)}/holds`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
}

async function postRelease(eventSlug: string, seat: SelectedSeat): Promise<void> {
  const body = holdRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
  });
  await fetch(`/api/events/${encodeURIComponent(eventSlug)}/holds/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

export function SeatMap({ eventSlug }: { eventSlug: string }) {
  const [seatmap, setSeatmap] = useState<SeatmapDto | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [renewedNotice, setRenewedNotice] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bestPending, setBestPending] = useState(false);
  const [bestError, setBestError] = useState<string | null>(null);
  const renewingRef = useRef(false);

  const fetchSeatmap = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/seatmap`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        setSeatmap(null);
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error('seatmap_request_failed');
      const payload = seatmapResponseSchema.parse(await response.json());
      setSeatmap(payload.seatmap);
      const serverHold = payload.holds[0];
      if (serverHold) {
        const restored = toSelectedSeat(
          payload.seatmap,
          serverHold.sectorSlug,
          serverHold.rowLabel,
          serverHold.seatLabel,
        );
        if (restored) {
          setSelected(restored);
          setHoldExpiresAt(serverHold.expiresAt);
        }
      }
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [eventSlug]);

  useEffect(() => {
    void fetchSeatmap();
  }, [fetchSeatmap]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchSeatmap();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchSeatmap]);

  const clearHold = useCallback(() => {
    setSelected(null);
    setHoldExpiresAt(null);
    setRenewedNotice(false);
  }, []);

  const sendHold = useCallback(
    async (seat: SelectedSeat): Promise<string> => {
      let response = await postHold(eventSlug, seat);
      if (response.status === 401) {
        await authClient.signIn.anonymous();
        response = await postHold(eventSlug, seat);
      }
      if (response.status === 409) throw new HoldConflictError();
      if (!response.ok) throw new Error('hold_failed');
      return holdResponseSchema.parse(await response.json()).hold.expiresAt;
    },
    [eventSlug],
  );

  const ensureHold = useCallback(
    async (seat: SelectedSeat) => {
      setHoldPending(true);
      setHoldError(null);
      try {
        const expiresAt = await sendHold(seat);
        setHoldExpiresAt(expiresAt);
      } catch (err) {
        clearHold();
        if (err instanceof HoldConflictError) {
          setHoldError(
            'Este assento acabou de ser reservado por outro comprador.',
          );
        } else {
          setHoldError('Não foi possível reservar este assento agora.');
        }
        void fetchSeatmap();
      } finally {
        setHoldPending(false);
      }
    },
    [sendHold, clearHold, fetchSeatmap],
  );

  const selectSeat = useCallback(
    (seat: SelectedSeat) => {
      setSelected(seat);
      setHoldError(null);
      void ensureHold(seat);
    },
    [ensureHold],
  );

  const releaseHold = useCallback(async () => {
    if (!selected) return;
    try {
      await postRelease(eventSlug, selected);
    } finally {
      clearHold();
      void fetchSeatmap();
    }
  }, [selected, eventSlug, clearHold, fetchSeatmap]);

  useEffect(() => {
    if (!holdExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((Date.parse(holdExpiresAt) - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        clearHold();
        setHoldError('Sua reserva expirou. Selecione o assento novamente.');
        return;
      }
      if (
        remaining <= SEAT_HOLD_RENEW_AFTER_SECONDS &&
        selected &&
        !renewingRef.current
      ) {
        renewingRef.current = true;
        postHold(eventSlug, selected)
          .then((response) => {
            if (!response.ok) return;
            return holdResponseSchema
              .parse(response.json())
              .then((payload) => {
                setHoldExpiresAt(payload.hold.expiresAt);
                setRenewedNotice(true);
                setTimeout(() => setRenewedNotice(false), 4_000);
              });
          })
          .catch(() => {})
          .finally(() => {
            renewingRef.current = false;
          });
      }
    };
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [holdExpiresAt, selected, eventSlug, clearHold]);

  const switchSector = (slug: string) => {
    if (selected && holdExpiresAt) {
      void postRelease(eventSlug, selected).catch(() => {});
    }
    setActiveSlug(slug);
    clearHold();
    setBestError(null);
    setHoldError(null);
  };

  async function pickBestSeat(sectorSlug: string) {
    setBestPending(true);
    setBestError(null);
    setHoldError(null);
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/best-seat?sector=${encodeURIComponent(sectorSlug)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        setBestError('Não há assentos livres neste setor.');
        return;
      }
      if (!response.ok) throw new Error('best_seat_request_failed');
      const payload = holdResponseSchema.pick({ hold: true }).optional().safeParse(null);
      void payload;
      const seatPayload = (await response.json()) as {
        seat: {
          sectorSlug: string;
          rowLabel: string;
          seatLabel: string;
          priceFromCents: number;
        };
      };
      const sector = seatmap?.sectors.find(
        (item) => item.slug === seatPayload.seat.sectorSlug,
      );
      selectSeat({
        sectorSlug: seatPayload.seat.sectorSlug,
        sectorName: sector?.name ?? seatPayload.seat.sectorSlug,
        rowLabel: seatPayload.seat.rowLabel,
        seatLabel: seatPayload.seat.seatLabel,
        priceFromCents: seatPayload.seat.priceFromCents,
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
              onClick={() => switchSector(item.slug)}
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
        <LegendItem swatch="bg-muted opacity-60" label="Ocupada" />
        <LegendItem
          swatch="bg-destructive/10 opacity-60"
          label="Indisponível"
        />
        <LegendItem swatch="bg-primary border-primary" label="Selecionada" />
      </ul>

      <div className="overflow-x-auto pb-2">
        <ul className="flex w-max flex-col gap-2">
          {sector.rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-xs font-medium text-muted-foreground">
                {row.label}
              </span>
              <div className="flex gap-1.5">
                {row.seats.map((seat) => {
                  const isSelected =
                    selected !== null &&
                    selected.rowLabel === row.label &&
                    selected.seatLabel === seat.label &&
                    selected.sectorSlug === sector.slug;
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      disabled={seat.status !== 'available'}
                      aria-label={`Cadeira ${seat.label}, fila ${row.label}`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        selectSeat({
                          sectorSlug: sector.slug,
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

        {holdError && (
          <p role="alert" className="text-sm text-destructive">
            {holdError}
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

        {selected && holdExpiresAt && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <p>
              Reserva expira em {formatCountdown(remainingSeconds)}
              {renewedNotice && ' · Reserva renovada'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void releaseHold();
              }}
            >
              Desistir da reserva
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn('size-3 rounded-sm border', swatch)} aria-hidden />
      {label}
    </li>
  );
}
```

Limpezas obrigatórias na versão final (contrato do ticket 10 preservado):
1. Remover a linha morta `const payload = holdResponseSchema.pick...` dentro de `pickBestSeat` (sobrou do rascunho — o parse do best-seat segue o padrão do ticket 10: `bestSeatResponseSchema.parse`).
2. `SelectedSeat` passa a incluir `sectorSlug` (feito acima) — os testes existentes que criavam selected sem sectorSlug não existem fora do componente.
3. O fetch do seatmap **mantém** o guard de contrato de ticket 10 (404 → estado vazio já mudou para… atenção: o guard `response.status === 404 → setSeatmap(null)` cai no estado "mapa não publicado" — comportamento do ticket 10 preservado; o review final do ticket 10 anotou isso como deferral — **não** mudar neste ticket).

- [ ] **Step 4: Rodar testes do componente**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/seat-map.spec.tsx && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: 7 antigos + ~7 novos PASS; tsc limpo. Se o teste de renew flakar com fake timers, aumente a granularidade do advance (1_500 → 2_000).

- [ ] **Step 5: Rodar a suíte web inteira**

Run: `pnpm --filter @ticketvibe/web exec vitest run`
Expected: PASS (~164).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/seat-map.tsx apps/web/src/components/seat-map.spec.tsx
git commit -m "feat(web): hold seats with countdown and auto renewal"
```

---

### Task 10: E2E de reserva (fluxo anônimo, desistir, outro comprador)

**Files:**
- Modify: `apps/web/tests/e2e/seatmap.spec.ts`

O teste 1 passa a reservar de verdade (sessão anônima automática do componente). Ao final, **desista** para não poluir a cadeira 6 dos próximos testes (TTL de 10 min persiste no banco/Redis mesmo depois do run — risco de poluição entre runs documentado abaixo).

- [ ] **Step 1: Atualizar testes existentes (cleanup de hold)**

Nos testes 1 e 2 de `seatmap.spec.ts`, após o assert de status, adicionar:

```ts
  await page.getByRole('button', { name: 'Desistir da reserva' }).click();
  await expect(page.getByText('Você selecionou')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Desistir da reserva' }),
  ).toHaveCount(0);
```

O teste 2 (best-seat) também passa a reservar; o cleanup é idêntico.

- [ ] **Step 2: Testes novos (red)**

Append em `apps/web/tests/e2e/seatmap.spec.ts`:

```ts
test('reserva tem contagem regressiva e desistir libera o assento', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 8, fila A' }).click();

  await expect(page.getByRole('status')).toHaveText(
    'Você selecionou: Plateia · Fila A · Cadeira 8 · R$ 120,00',
  );
  await expect(page.getByText(/Reserva expira em 09:5\d/)).toBeVisible();

  await page.getByRole('button', { name: 'Desistir da reserva' }).click();
  await expect(page.getByText(/Reserva expira em/)).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Cadeira 8, fila A' }),
  ).toBeEnabled();
});

test('assento reservado aparece ocupado para outro comprador', async ({
  browser,
}) => {
  const buyer1 = await (await browser.newContext()).newPage();
  const buyer2 = await (await browser.newContext()).newPage();

  await buyer1.goto('/events/o-fantasma-da-opera/ingressos');
  await buyer1.getByRole('button', { name: 'Cadeira 10, fila A' }).click();
  await expect(buyer1.getByText(/Reserva expira em/)).toBeVisible();

  await buyer2.goto('/events/o-fantasma-da-opera/ingressos');
  await expect(
    buyer2.getByRole('button', { name: 'Cadeira 10, fila A' }),
  ).toBeDisabled();

  await buyer1.getByRole('button', { name: 'Desistir da reserva' }).click();
  await buyer2.reload();
  await expect(
    buyer2.getByRole('button', { name: 'Cadeira 10, fila A' }),
  ).toBeEnabled();

  await buyer1.context().close();
  await buyer2.context().close();
});

test('recupera a reserva após atualizar a página', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 12, fila A' }).click();
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('status')).toHaveText(
    'Você selecionou: Plateia · Fila A · Cadeira 12 · R$ 120,00',
  );
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  await page.getByRole('button', { name: 'Desistir da reserva' }).click();
});
```

Detalhes: cadeiras 8/10/12 da fila A são `available` no seed (só A-6 e balcão A-5 têm mark) — conferir contra `seatMapFixtures` antes de fixar os números; se algum estiver marcado, trocar por vizinho livre. Contextos separados = cookies/sessões anônimas distintas = dois compradores de verdade.

- [ ] **Step 3: Rodar E2E**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test tests/e2e/seatmap.spec.ts`
Expected: 6 PASS (3 atualizados + 3 novos). Requer API+web de pé (playwright webServer) e Redis acessível à API (mesmo db 0 do dev; holds de teste somem sozinhos em ≤10 min).

**Risco de poluição entre runs:** se um run falhar no meio, a cadeira fica `reserved` até o TTL. Mitigação: os testes sempre desistem no final; se reexecutar logo em seguida e deparar com cadeira ocupada, aguardar ≤10 min ou `podman exec <redis> redis-cli -n 0 DEL seat-hold:<eventId>:<sectorId>:<rowId>:<seatId>` + o job lazy da API limpa o espelho Postgres no próximo seatmap. (Não usar FLUSHALL.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/seatmap.spec.ts
git commit -m "test(e2e): cover anonymous seat holds across buyers"
```

---

### Task 11: Worker BullMQ (expiração em background)

**Files:**
- Create: `apps/api/src/modules/seatmaps/jobs/expire-seat-holds.ts` (+spec)
- Create: `apps/api/src/worker.ts`
- Modify: `apps/api/package.json` (dep `bullmq`, script `worker`)
- Modify: `turbo.json` (task `worker`)
- Modify: root `package.json` (dev passa a subir worker junto)

- [ ] **Step 1: Deps e script**

```bash
pnpm --filter @ticketvibe/api add bullmq
```

`apps/api/package.json` scripts: adicionar `"worker": "tsx watch src/worker.ts"`.

- [ ] **Step 2: Teste do job (red)**

Create `apps/api/src/modules/seatmaps/jobs/expire-seat-holds.spec.ts` (integração PG real, mesmo setup de `hold-expiry.integration.spec.ts` — beforeEach `resetDatabase`+`seedFixtures`):

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb, TEST_DATABASE_URL } from '../../../db/client.js';
import { resetDatabase, seedFixtures } from '../../../db/test-helpers.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import { createExpireSeatHoldsJob, SEAT_HOLD_QUEUE_NAME } from './expire-seat-holds.js';

describe('expire seat holds job', () => {
  const db = createDb(TEST_DATABASE_URL);

  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
  });

  it('exposes the queue name and runs the shared expiry', async () => {
    expect(SEAT_HOLD_QUEUE_NAME).toBe('seat-hold-expiry');
    const job = createExpireSeatHoldsJob(db);
    await expect(job()).resolves.toBeTypeOf('number');
    expect(await expireExpiredHolds(db)).toBe(0);
  });
});
```

- [ ] **Step 3: Implementar o job**

Create `apps/api/src/modules/seatmaps/jobs/expire-seat-holds.ts`:

```ts
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import type { Db } from '../../../db/client.js';

export const SEAT_HOLD_QUEUE_NAME = 'seat-hold-expiry';
export const EXPIRE_HOLDS_JOB_ID = 'expire-seat-holds';
export const EXPIRE_HOLDS_EVERY_MS = 5_000;

export function createExpireSeatHoldsJob(db: Db): () => Promise<number> {
  return () => expireExpiredHolds(db);
}
```

- [ ] **Step 4: Rodar o teste**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/jobs`
Expected: PASS (1).

- [ ] **Step 5: Worker entry**

Create `apps/api/src/worker.ts`:

```ts
import { Queue, Worker } from 'bullmq';

import { createDb } from './db/client.js';
import { createRedis } from './redis/client.js';
import {
  EXPIRE_HOLDS_EVERY_MS,
  EXPIRE_HOLDS_JOB_ID,
  SEAT_HOLD_QUEUE_NAME,
  createExpireSeatHoldsJob,
} from './modules/seatmaps/jobs/expire-seat-holds.js';

const db = createDb();
const connection = createRedis(process.env.REDIS_URL);
connection.options.maxRetriesPerRequest = null;

const queue = new Queue(SEAT_HOLD_QUEUE_NAME, { connection });

await queue.upsertJobScheduler(
  EXPIRE_HOLDS_JOB_ID,
  { every: EXPIRE_HOLDS_EVERY_MS },
  { name: EXPIRE_HOLDS_JOB_ID },
);

const worker = new Worker(
  SEAT_HOLD_QUEUE_NAME,
  createExpireSeatHoldsJob(db),
  { connection },
);

worker.on('completed', (job, result) => {
  if (result > 0) {
    console.log(`[worker] expired ${result} hold(s)`);
  }
});

worker.on('failed', (job, error) => {
  console.error('[worker] expire-seat-holds failed', job?.id, error);
});

console.log('[worker] seat hold expiry worker started');

async function shutdown(): Promise<void> {
  await worker.close();
  await queue.close();
  connection.disconnect();
}

process.once('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
```

Nota: `createRedis` do Task 1 usa `maxRetriesPerRequest: 1`; BullMQ exige `null` na conexão do worker — o override acima resolve sem quebrar os repositórios (que rodam na API, outra instância).

- [ ] **Step 6: Turbo task + dev conjunto**

`turbo.json` — adicionar:

```json
"worker": {
  "cache": false,
  "persistent": true
}
```

Root `package.json` — `"dev": "turbo dev"` vira:

```json
"dev": "turbo run dev worker"
```

(Turbo 2.11.7: `turbo run <t1> <t2>` roda as duas tasks persistentes; docs locais do pacote turbo instalado conferidos.)

- [ ] **Step 7: Smoke manual**

Run: `pnpm infra:up && pnpm dev` (ou `turbo run dev worker`)
Expected: logs `[api] listening` + `[worker] seat hold expiry worker started`; criar um hold via UI ou curl e observar `[worker] expired 1 hold(s)` ~após TTL (ou reduzir TTL temporariamente num scratch para não esperar 10 min — não commitar).

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/src/worker.ts apps/api/src/modules/seatmaps/jobs/ turbo.json package.json pnpm-lock.yaml
git commit -m "feat(api): add seat hold expiry worker with bullmq"
```

---

### Task 12: Gates finais + relatório + fechamento

- [ ] **Step 1: Bateria de gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test
pnpm build
pnpm --filter @ticketvibe/api exec drizzle-kit check
```

Expected: lint 0 erros (1 info pré-existente ok); typecheck todos os workspaces; testes API (~165, +~40 deste ticket) / web (~164) / shared (58); Playwright 24/24 (21 do ticket 10 + 3 novos do seatmap); build ok; drizzle-kit check limpo.

- [ ] **Step 2: Corrigir regressões**

Se algum gate falhar, corrigir no menor diff possível e reaplicar a bateria completa.

- [ ] **Step 3: Relatório + fechamento da issue**

Append em `.scratch/ticketvibe/issues/11-reserva-de-assentos-com-ttl.md`:

- Checkboxes dos 5 critérios `[x]`.
- Seção **Implementação** com SHAs das tasks + resultado dos gates (números reais).
- Seção **Deferrals do ticket 11** (candidatos já decididos):
  - Checkout atômico (SELECT FOR UPDATE) fica para o ticket 13.
  - Carrinho/TTL espelhado fica para o ticket 12 (depende deste).
  - Hold idempotente por coordenada (um usuário, um assento) sem fila de prioridade.
  - Renew via endpoint próprio (hoje o mesmo POST de claim faz renew).
  - Polling de 10s fixo (sem backoff nem focus-aware).
  - Falha do Redis degrada para erro 500/503 no hold (seatmap continua servindo do Postgres).
  - Worker single-instance (sem lock distribuído além do scheduler do BullMQ).
- `Status: done`.

Commit: `git add .scratch && git commit -m "docs: mark ticket 11 as done"`.

---

## Cobertura dos critérios do ticket

| Critério | Onde |
|---|---|
| Redis TTL ~10min atrelado à sessão | Tasks 1, 5 (`RedisHoldRepository`, `SEAT_HOLD_TTL_SECONDS=600`), 6 (renew), 7 (rota usa `GetSessionFn`) |
| Contagem regressiva + avisos de renovação/desistência | Task 9 (`aria-live` com "Reserva expira em mm:ss · Reserva renovada", botão "Desistir da reserva") + Task 10 E2E |
| Job do worker expira reservas | Task 11 (`upsertJobScheduler` 5s + `expireExpiredHolds`) |
| Reservado aparece ocupado p/ demais via polling | Tasks 5–7 (mapper `reserved`→`occupied`, `holds` top-level só para o dono) + Task 9 (poll 10s) + Task 10 (dois contextos) |
| Teste de corrida: 2 compradores, exatamente 1 vence, PG real + Redis | Task 7 (integração: `Promise.all` de dois `POST /holds` → um 201 e um 409) |

## Fora de escopo

- Checkout transacional (ticket 13), carrinho (ticket 12).
- UI de pagamento, e-mails, admin de assentos.
- Multi-instance API com Redis Cluster/sentinel; auth via senha (só anônimo + link existente).

## Riscos e mitigações

- **Poluição entre runs E2E** (hold sobrevive ao run): cleanup "Desistir" em todo teste + nota manual de DEL da chave (Task 10).
- **Espelho divergente** (crash entre NX e UPDATE Postgres): janela ≤TTL, auto-limpável; documentado em D1.
- **Sessão anônima acumulando usuários**: aceito pelo produto; `onLinkAccount` migra e o anônimo é apagado pelo better-auth.
- **`turbo run dev worker`**: se o supervisor da máquina não suportar duas persistentes, fallback documentado: dois terminais (`pnpm dev` + `pnpm --filter @ticketvibe/api dev:worker` já coberto pelo script `worker`).
- **better-auth anonymous plugin**: se `onLinkAccount` não existir nessa versão (1.7.7), checar docs da versão instalada (`node_modules/better-auth`) antes de improvisar — o plano assume API conforme docs context7; se divergir, ajustar no Task 3 sem mudar o contrato.

## Fontes

- Docs better-auth (Fastify integration, anonymous plugin, `onLinkAccount`, `anonymousClient`) — context7, 2026-10-16.
- Docs BullMQ v6 (`upsertJobScheduler`, `Worker`, conexão `maxRetriesPerRequest: null`) — context7, 2026-10-16.
- Turborepo docs locais do pacote instalado 2.11.7 (`node_modules/turbo/docs`).
- Código do repo (arquivos citados na seção "Fatos verificados").

---

## Self-review do plano

- [x] Todos os 5 critérios mapeados para tasks (tabela acima).
- [x] Sem placeholders/"TODO" nos passos de código — snippets completos ou instruções explícitas de onde encaixar.
- [x] Consistência de tipos: `HoldClaimResult`/`ReleaseHoldResult` (Task 6) batem com o mapper da rota (Task 7: `seat_held`→409, `hold_not_found`→404); `holdSchema` do Task 2 é o mesmo item de `holds[]` e do `holdResponseSchema`; `RedisClient` (Task 1) é o tipo do repo (Task 5) e da conexão do worker (Task 11).
- [x] Ordem respeita dependências: shared → domínio → infra → use cases → rotas → web → E2E → worker (worker só depende de `hold-expiry` do Task 5).
- [x] Testes seguem padrões do repo (MSW, `buildApp` com stubs, integração com `resetDatabase`+`seedFixtures`, E2E com contexts).
- [x] Nenhum toque em arquivos proibidos (`playwright.config.ts`, `global-setup.ts`).
