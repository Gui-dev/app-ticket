# Ticket 12 — Carrinho de evento único — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O comprador monta o pedido do evento no mapa de assentos: seleciona até 8 assentos (cada um reserva com o TTL de 10 min do ticket 11), escolhe o tipo de ingresso (inteira/meia/vip) com preço correto por item, vê carrinho com contagem regressiva sincronizada e total, e ao expirar/abandonar o carrinho some e os assentos são liberados.

**Architecture:** O carrinho é **derivado**, sem tabela nova: itens = holds vivos do usuário no evento (Postgres, espelho do ticket 11) + tipos de ingresso num hash Redis `cart:{userId}:{eventSlug}` (campo `setor:fila:cadeira` → tipo, TTL 600 s). O SeatMap vira **multi-seleção** (limite 8 por usuário por evento, imposto no `HoldSeatUseCase` → 409 `cart_limit`); um novo componente presentacional `CartPanel` renderiza itens, seletor de tipo, remover, desistir de todos, total e countdown (menor `expiresAt` entre os holds). Preços são multiplicadores puros no shared: inteira ×1, meia ×0,5, vip ×2 sobre o `priceFromCents` do setor. Expiração reaproveita todo o pipeline do ticket 11 (lazy `expireHolds` + worker 5 s); o hash Redis morre pelo próprio TTL e o GET de carrinho filtra por holds vivos.

**Tech Stack:** Fastify + Drizzle + `pg` (API), ioredis (hash cart), Zod (`packages/shared`), Next 16 route handlers (proxies), React 19 (componentes), Vitest, Playwright, Podman (Postgres + Redis + Mailpit).

---

## Fatos verificados (código conferido em 2026-10-16, HEAD `8c4ff8e`)

- **Ticket 11 completo:** `POST /events/:slug/holds` (201/200 renew, 401/400/404/409 `seat_held|seat_unavailable`), `POST .../holds/release`, `GET .../seatmap` user-scoped devolvendo `holds[]` (múltiplos records `{sectorSlug,rowLabel,seatLabel,expiresAt}`). Componente `seat-map.tsx` (520 linhas) é **single-select**: `selected: SelectedSeat | null`, solta o hold anterior ao reselecionar (fix C1 do review), countdown com `holdExpiresAtRef`/`renewingRef`, poll 10 s, `authClient.signIn.anonymous()` no primeiro 401. Worker BullMQ varre `expireExpiredHolds` a cada 5 s.
- **`HoldRepository`** (`hold-repository.ts`): `claim`/`renew`/`release`; Redis value = `userId` (GET == userId decide ownership); `RedisHoldRepository` usa `SET NX EX` + Lua renew/release. **Não existe `owns`** — o carrinho precisa dele para validar `PUT` de tipo.
- **`SeatHoldRecord`** (`seatmap-repository.ts:25-30`): `{sectorSlug,rowLabel,seatLabel,expiresAt}` — **sem preço**; `DrizzleSeatmapRepository.findHoldsByUser` já dá join em `sectors` (adicionar `sectors.priceFromCents` ao select é 1 linha). `InMemorySeatmapRepository` tem `SeededUserHold extends SeatHoldRecord` (2º construtor) e filtra por `eventSlug`+`userId`+clock.
- **Schema PG:** `seats` tem `status` (incl. `'reserved'`), `hold_user_id`, `hold_expires_at`; `sectors.price_from_cents` (schema.ts:96). **Nenhum conceito de tipo de ingresso existe** (grep `VIP|meia|inteira|ticketType` = 0 hits de domínio).
- **`HoldSeatUseCase`** (`hold-seat.use-case.ts`): gate `available|reserved` → claim → mirror; kinds: `held|event_not_found|sector_not_found|seat_not_found|seat_unavailable|seat_held`. Não conta holds do usuário — base do limite 8.
- **Rotas de hold** (`holds.routes.ts`, 93 linhas): padrão session→safeParse→use case→switch de kinds; `holds.routes.spec.ts` (unit, buildApp stubs) + `holds.routes.integration.spec.ts` (PG teste + Redis db 1 + `x-test-user-id`).
- **`app.ts` wiring:** `lazyHoldRepository` facade (claim/renew/release delegando a `getHoldRepository()` lazy; `defaultRedis` compartilhado, `onClose` quit). Opções `holdRepository`/`holdSeat`/`releaseHold`/`getSession` para testes.
- **Shared** (`packages/shared/src/index.ts:134-161`): `SEAT_HOLD_TTL_SECONDS=600`, `SEAT_HOLD_RENEW_AFTER_SECONDS=120`, `holdSchema`/`holdRequestSchema`/`holdResponseSchema`/`releaseResponseSchema`/`seatmapResponseSchema`. Spec = 578 linhas no estilo `parse`/`reject`.
- **Proxies web:** padrão holds/route.ts (validate → fetch cookie-forward 3 s timeout → 401 hardcode → 404/409 passthrough → schema parse → 502 `upstream_error` + console.error). `AbortSignal.timeout`, `encodeURIComponent(slug)`, `vi.hoisted` API_URL nas specs msw.
- **E2E:** `apps/web/tests/e2e/seatmap.spec.ts` (6 testes) usa textos exatos `Você selecionou: Plateia · Fila A · Cadeira N · R$ 120,00`, `getByRole('status')`, `Desistir da reserva` — **todos precisam ser atualizados** para os textos do carrinho. Infra dev: `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe` (compose.yaml: user/pass/db = `ticketvibe`). `playwright.config.ts`/`global-setup.ts` **não podem ser tocados**.
- **Fixture:** `apps/api/src/db/fixtures.ts` — plateia 8×12, marks B-7/C-4/C-5/D-10/H-12; fila A inteira livre (cadeiras 1–12). E2E ticket 11 usa 6/8/10/12 → carrinho E2E usará 1/2/3/4.
- **Página:** `apps/web/src/app/events/[slug]/ingressos/page.tsx` renderiza `<SeatMap eventSlug={slug} />` — o `CartPanel` entra dentro do `SeatMap` (sem tocar na página).
- **Turbo 2.11.7 instalado;** testes API `fileParallelism:false`; integração usa `TEST_DATABASE_URL`/`TEST_REDIS_URL` (db 1) com `resetDatabase(db)`+`seedFixtures(db)`; Biome/lefthook pre-commit; commits Conventional em inglês; docs/UI/testes pt-BR; **`pnpm infra:down` PROIBIDO**.

## Decisões (D1–D8)

- **D1 — Carrinho derivado, sem tabela nova.** Estado do carrinho = (holds vivos no PG) × (tipos no hash Redis `cart:{userId}:{eventSlug}`, campo `${sectorSlug}:${rowLabel}:${seatLabel}`). `HSET` + `EXPIRE 600` a cada escrita de tipo; GET filtra por holds vivos e faz default `'inteira'` para campo ausente; hash órfão morre pelo TTL (nenhum sweep no worker). Chave por **slug** (não id) — slugs são únicos e o use case já resolve o evento por slug.
- **D2 — Tipos como multiplicadores puros.** `inteira` ×1,0; `meia` ×0,5 (honra, sem comprovação — story 19); `vip` ×2,0; `ticketPriceCents(type, base) = Math.round(base * mult)` em `packages/shared` (unit-testável, sem DB). Reabre nos tickets 18/39 (lotes/organizador), que podem substituir os multiplicadores por tabela.
- **D3 — Multi-assento: quantidade = itens do carrinho.** `CART_MAX_ITEMS = 8` (constante shared), imposto no `HoldSeatUseCase` (novo kind `cart_limit` → 409) quando o usuário não já segura esse assento (renovação não conta). Seleção múltipla no SeatMap: clicar em assento livre adiciona; clicar no próprio item remove (solta hold).
- **D4 — Carrinho de um só evento, sem mistura.** Endpoints sob `/events/:slug/cart`; não existe agregado cross-event. "Ao adicionar de outro evento, o fluxo recomeça" = a UI e o contrato são sempre de um evento (a página de ingressos é por evento). Holds de outros eventos **não** são liberados automaticamente (alternativa rejeitada: release silencioso surpreende o usuário e quebra "desistir é explícito"; TTL de 10 min limita o squatting).
- **D5 — Sincronia de expiração.** Countdown do carrinho = menor `expiresAt` entre os itens; auto-renew renova **cada** hold com ≤120 s (mesmo `POST /holds`, um por assento, guard por chave em `renewingRef: Set`); ao expirar localmente o item some + aviso; no servidor, `GET /cart` filtra por holds vivos e o `expireHolds()` lazy (ticket 11) devolve o assento ao mapa — worker 5 s cobre o sweep de fundo.
- **D6 — Endpoints.** `GET /events/:slug/cart` → 401 | 404 `event_not_found` | 200 `cartSchema` (`{eventSlug, items[{sectorSlug,rowLabel,seatLabel,ticketType,priceCents,expiresAt}], expiresAt|null, totalCents}`). `PUT /events/:slug/cart/items` body `cartItemRequestSchema` → 401 | 400 `invalid_body` | 404 `event_not_found|sector_not_found|seat_not_found|hold_not_found` | 200 `setCartItemResponseSchema`. Holds passam a devolver também 409 `{error:'cart_limit'}`.
- **D7 — UI.** `CartPanel` presentacional (novo arquivo) recebe itens/totais/countdown e callbacks; `seat-map.tsx` vira dono do estado multi (`items: CartSeat[]` com espelho `itemsRef`, lição do fix de double-renew do ticket 11). Substitui "Você selecionou…"/"Desistir da reserva" por itens do carrinho/"Desistir de todos" — E2E e specs do ticket 11 atualizados no ticket 12 (migração explícita, ver Task 11/12). Troca de setor **não** solta mais holds (D4). Restauração: `holds[]` do seatmap (múltiplos) + tipos via `GET /cart` uma vez no mount.
- **D8 — Expiração em E2E sem tocar no Playwright config.** O teste E2E de expiração faz backdate via `podman exec … psql` (`hold_expires_at = now() - interval '1 second'` na cadeira alvo) e então recarrega a página: o `expireHolds()` lazy da API (chamado no GET seatmap) marca `available` (worker confirma em ≤5 s). Divergência artificial Redis×PG (chave Redis ainda viva) é aceita e documentada — em produção ambos os relógios nascem juntos.

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/src/modules/seatmaps/domain/cart-repository.ts` | Interface `CartRepository` + `cartItemKey()` |
| `apps/api/src/modules/seatmaps/infra/in-memory-cart-repository.ts` (+spec) | Repo em memória (clock injetável, TTL por entrada) |
| `apps/api/src/modules/seatmaps/infra/redis-cart-repository.ts` (+spec) | Hash Redis `cart:{userId}:{eventSlug}` |
| `apps/api/src/modules/seatmaps/use-cases/get-cart.use-case.ts` (+spec) | Holds vivos × tipos × preços → `Cart` |
| `apps/api/src/modules/seatmaps/use-cases/set-cart-item.use-case.ts` (+spec) | Valida coords + ownership → `setType` |
| `apps/api/src/modules/seatmaps/routes/cart.routes.ts` (+unit spec +integration spec) | GET cart + PUT cart items |
| `apps/web/src/app/api/events/[slug]/cart/route.ts` (+spec) | Proxy GET cart |
| `apps/web/src/app/api/events/[slug]/cart/items/route.ts` (+spec) | Proxy PUT cart item |
| `apps/web/src/components/cart-panel.tsx` (+spec) | Painel presentacional do carrinho |
| `apps/web/tests/e2e/cart.spec.ts` | E2E: multi-itens, tipo/preço, expiração com backdate |

**Modificar:** `packages/shared/src/index.ts`+`index.spec.ts` (tipos, preços, schemas, `CART_MAX_ITEMS`); `hold-repository.ts`+`in-memory-hold-repository.ts`(+spec)+`redis-hold-repository.ts`(+spec) (`owns`); `seatmap-repository.ts`+`in-memory-seatmap-repository.ts`+`drizzle-seatmap-repository.ts` (`SeatHoldRecord.priceFromCents`); `get-seatmap.use-case.spec.ts` (seed de hold ganha preço); `hold-seat.use-case.ts`(+spec)+`holds.routes.ts`(+spec) (`cart_limit`); `apps/api/src/app.ts` (wiring cart lazy); `apps/web/src/components/seat-map.tsx`+`seat-map.spec.tsx` (multi-seleção + CartPanel); `apps/web/tests/e2e/seatmap.spec.ts` (textos do carrinho); `.scratch/ticketvibe/issues/12-carrinho-de-evento-unico.md` (fechamento).

---

### Task 1: Shared — tipos de ingresso, preços e schemas do carrinho

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/index.spec.ts`

- [ ] **Step 1: Escrever os testes (red)**

Append ao final de `packages/shared/src/index.spec.ts`. Acrescente também `CART_MAX_ITEMS`, `cartItemRequestSchema`, `cartSchema`, `setCartItemResponseSchema` e `ticketPriceCents` ao bloco `import { … } from './index';` do topo do arquivo.

```ts
describe('ticket pricing', () => {
  it('prices inteira at the full sector price', () => {
    expect(ticketPriceCents('inteira', 12000)).toBe(12000);
  });

  it('prices meia at half price rounding to the nearest cent', () => {
    expect(ticketPriceCents('meia', 12000)).toBe(6000);
    expect(ticketPriceCents('meia', 12001)).toBe(6001);
  });

  it('prices vip at double the sector price', () => {
    expect(ticketPriceCents('vip', 12000)).toBe(24000);
  });
});

describe('cart contracts', () => {
  const validItem = {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
    ticketType: 'meia',
    priceCents: 6000,
    expiresAt: '2026-10-16T12:10:00.000Z',
  };

  it('exposes the cart item limit', () => {
    expect(CART_MAX_ITEMS).toBe(8);
  });

  it('parses a cart payload', () => {
    expect(
      cartSchema.parse({
        eventSlug: 'o-fantasma-da-opera',
        items: [validItem],
        expiresAt: '2026-10-16T12:10:00.000Z',
        totalCents: 6000,
      }),
    ).toEqual({
      eventSlug: 'o-fantasma-da-opera',
      items: [validItem],
      expiresAt: '2026-10-16T12:10:00.000Z',
      totalCents: 6000,
    });
  });

  it('accepts a cart without a deadline', () => {
    expect(
      cartSchema.parse({
        eventSlug: 'o-fantasma-da-opera',
        items: [],
        expiresAt: null,
        totalCents: 0,
      }).expiresAt,
    ).toBeNull();
  });

  it('rejects an unknown ticket type in the cart', () => {
    expect(() =>
      cartSchema.parse({
        eventSlug: 'o-fantasma-da-opera',
        items: [{ ...validItem, ticketType: 'pista' }],
        expiresAt: null,
        totalCents: 0,
      }),
    ).toThrow();
  });

  it('parses a cart item request', () => {
    expect(
      cartItemRequestSchema.parse({
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'vip',
      }),
    ).toEqual({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'vip',
    });
  });

  it('rejects a cart item request with empty coords', () => {
    expect(() =>
      cartItemRequestSchema.parse({
        sectorSlug: '',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
      }),
    ).toThrow();
  });

  it('parses a set cart item response', () => {
    expect(
      setCartItemResponseSchema.parse({
        item: {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
        },
      }).item.ticketType,
    ).toBe('meia');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/shared exec vitest run`
Expected: FAIL — `ticketPriceCents`/`CART_MAX_ITEMS`/schemas não exportados.

- [ ] **Step 3: Implementar no shared**

Em `packages/shared/src/index.ts`, logo após o bloco `releaseResponseSchema`/antes de `seatmapResponseSchema` (ordem cosmética; qualquer posição após `holdResponseSchema` serve):

```ts
export const ticketTypeSchema = z.enum(['inteira', 'meia', 'vip']);

export type TicketType = z.infer<typeof ticketTypeSchema>;

export const CART_MAX_ITEMS = 8;

const TICKET_TYPE_MULTIPLIERS: Record<TicketType, number> = {
  inteira: 1,
  meia: 0.5,
  vip: 2,
};

export function ticketPriceCents(
  type: TicketType,
  baseCents: number,
): number {
  return Math.round(baseCents * TICKET_TYPE_MULTIPLIERS[type]);
}

export const cartItemSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  ticketType: ticketTypeSchema,
  priceCents: z.number().int().min(0),
  expiresAt: z.iso.datetime(),
});

export type CartItemDto = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(cartItemSchema),
  expiresAt: z.iso.datetime().nullable(),
  totalCents: z.number().int().min(0),
});

export type CartDto = z.infer<typeof cartSchema>;

export const cartItemRequestSchema = z.object({
  sectorSlug: z.string().trim().min(1),
  rowLabel: z.string().trim().min(1),
  seatLabel: z.string().trim().min(1),
  ticketType: ticketTypeSchema,
});

export type CartItemRequest = z.infer<typeof cartItemRequestSchema>;

export const setCartItemResponseSchema = z.object({
  item: z.object({
    sectorSlug: z.string().min(1),
    rowLabel: z.string().min(1),
    seatLabel: z.string().min(1),
    ticketType: ticketTypeSchema,
  }),
});

export type SetCartItemResponse = z.infer<typeof setCartItemResponseSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/shared exec vitest run`
Expected: PASS (58 existentes + 10 novos = 68).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.spec.ts
git commit -m "feat(shared): add ticket types, pricing and cart contracts"
```

---

### Task 2: HoldRepository.owns + CartRepository (domínio e in-memory)

**Files:**
- Modify: `apps/api/src/modules/seatmaps/domain/hold-repository.ts`
- Modify: `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.ts` (+spec)
- Create: `apps/api/src/modules/seatmaps/domain/cart-repository.ts`
- Create: `apps/api/src/modules/seatmaps/infra/in-memory-cart-repository.ts` (+spec)

- [ ] **Step 1: Testes do owns (red)**

Append a `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.spec.ts`:

```ts
  it('reports ownership of an active hold', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.owns(key, 'user-a')).toBe(true);
    expect(await repository.owns(key, 'user-b')).toBe(false);
  });

  it('does not report ownership after expiry', async () => {
    await repository.claim(key, 'user-a', 600);
    nowMs += 601 * 1000;
    expect(await repository.owns(key, 'user-a')).toBe(false);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/in-memory-hold-repository.spec.ts`
Expected: FAIL — `owns` não existe na interface nem no repo.

- [ ] **Step 3: Implementar owns**

Em `apps/api/src/modules/seatmaps/domain/hold-repository.ts`, adicione ao final da interface:

```ts
  owns(seatKey: string, userId: string): Promise<boolean>;
```

Em `apps/api/src/modules/seatmaps/infra/in-memory-hold-repository.ts`, adicione após `release`:

```ts
  async owns(seatKey: string, userId: string): Promise<boolean> {
    return this.activeHold(seatKey)?.userId === userId;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/in-memory-hold-repository.spec.ts`
Expected: PASS (todos + 2 novos).

- [ ] **Step 5: Teste do cart in-memory (red)**

Create `apps/api/src/modules/seatmaps/infra/in-memory-cart-repository.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { cartItemKey } from '../domain/cart-repository.js';
import { InMemoryCartRepository } from './in-memory-cart-repository.js';

describe('InMemoryCartRepository', () => {
  let nowMs: number;
  let repository: InMemoryCartRepository;

  beforeEach(() => {
    nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    repository = new InMemoryCartRepository(() => new Date(nowMs));
  });

  it('builds the item key from the coords', () => {
    expect(cartItemKey('plateia', 'A', '6')).toBe('plateia:A:6');
  });

  it('stores and returns ticket types per user and event', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('plateia:A:6')).toBe('meia');
  });

  it('separates carts by user and by event', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'vip',
      ttlSeconds: 600,
    });
    expect(
      (
        await repository.getTypes({ userId: 'user-b', eventSlug: 'gig' })
      ).size,
    ).toBe(0);
    expect(
      (
        await repository.getTypes({ userId: 'user-a', eventSlug: 'outro' })
      ).size,
    ).toBe(0);
  });

  it('drops types after the ttl', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    nowMs += 601 * 1000;
    expect(
      (
        await repository.getTypes({ userId: 'user-a', eventSlug: 'gig' })
      ).size,
    ).toBe(0);
  });

  it('refreshes the ttl on a new write', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    nowMs += 500 * 1000;
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    nowMs += 500 * 1000;
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('plateia:A:6')).toBe('meia');
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/in-memory-cart-repository.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 7: Implementar domínio + in-memory**

Create `apps/api/src/modules/seatmaps/domain/cart-repository.ts`:

```ts
import type { TicketType } from '@ticketvibe/shared';

export interface CartRepository {
  setType(input: {
    userId: string;
    eventSlug: string;
    itemKey: string;
    ticketType: TicketType;
    ttlSeconds: number;
  }): Promise<void>;
  getTypes(input: {
    userId: string;
    eventSlug: string;
  }): Promise<Map<string, TicketType>>;
}

export function cartItemKey(
  sectorSlug: string,
  rowLabel: string,
  seatLabel: string,
): string {
  return `${sectorSlug}:${rowLabel}:${seatLabel}`;
}
```

Create `apps/api/src/modules/seatmaps/infra/in-memory-cart-repository.ts`:

```ts
import type { TicketType } from '@ticketvibe/shared';

import type { CartRepository } from '../domain/cart-repository.js';

interface CartEntry {
  ticketType: TicketType;
  expiresAtMs: number;
}

export class InMemoryCartRepository implements CartRepository {
  private readonly carts = new Map<string, Map<string, CartEntry>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private cart(userId: string, eventSlug: string): Map<string, CartEntry> {
    const key = `${userId}:${eventSlug}`;
    let cart = this.carts.get(key);
    if (!cart) {
      cart = new Map<string, CartEntry>();
      this.carts.set(key, cart);
    }
    return cart;
  }

  async setType(input: {
    userId: string;
    eventSlug: string;
    itemKey: string;
    ticketType: TicketType;
    ttlSeconds: number;
  }): Promise<void> {
    this.cart(input.userId, input.eventSlug).set(input.itemKey, {
      ticketType: input.ticketType,
      expiresAtMs: this.now().getTime() + input.ttlSeconds * 1000,
    });
  }

  async getTypes(input: {
    userId: string;
    eventSlug: string;
  }): Promise<Map<string, TicketType>> {
    const cart = this.cart(input.userId, input.eventSlug);
    const nowMs = this.now().getTime();
    const result = new Map<string, TicketType>();
    for (const [itemKey, entry] of cart) {
      if (entry.expiresAtMs > nowMs) {
        result.set(itemKey, entry.ticketType);
      } else {
        cart.delete(itemKey);
      }
    }
    return result;
  }
}
```

Nota de comportamento: o Redis real expira a **chave** inteira (TTL refrescado por qualquer `HSET`); o in-memory aproximou por entrada (`expiresAtMs` por item, renovado a cada `setType`) — suficiente para as specs de unidade; a integração cobre o Redis real.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/in-memory-hold-repository.spec.ts src/modules/seatmaps/infra/in-memory-cart-repository.spec.ts && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo — **exceto** `redis-hold-repository.ts` (que implementa `HoldRepository` e ainda não tem `owns`); se o tsc acusar, vá ao Step 9 antes de fechar.

- [ ] **Step 9: owns no Redis (mantém a árvore verde)**

Em `apps/api/src/modules/seatmaps/infra/redis-hold-repository.ts`, adicione após `release`:

```ts
  async owns(seatKey: string, userId: string): Promise<boolean> {
    return (await this.redis.get(seatKey)) === userId;
  }
```

Acione o teste de owns do Redis em `redis-hold-repository.spec.ts` (spec existente usa Redis de teste — siga o padrão de setup já presente no arquivo: `createRedis(TEST_REDIS_URL)` + flush):

```ts
  it('reports ownership via the stored user id', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.owns(key, 'user-a')).toBe(true);
    expect(await repository.owns(key, 'user-b')).toBe(false);
  });
```

(Rode com `pnpm infra:up` antes; NUNCA `infra:down`.)

- [ ] **Step 10: Rodar suíte de seatmaps + tsc**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: todas PASS (specs existentes de get-seatmap/find-best-seat usam `vi.fn` ou seeds sem `owns` — interface nova só exige o método nas implementações; se algum stub `satisfies SeatmapRepository` quebrar por `HoldRepository`, adicione `owns: vi.fn()` aos stubs afetados).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/seatmaps
git commit -m "feat(api): add cart and hold ownership repositories"
```

---

### Task 3: SeatHoldRecord ganha priceFromCents (Drizzle + in-memory)

**Files:**
- Modify: `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts`
- Modify: `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts`
- Modify: `apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts`
- Modify: `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.spec.ts`

- [ ] **Step 1: Teste (red)**

Em `apps/api/src/modules/seatmaps/use-cases/get-seatmap.use-case.spec.ts`, no teste `returns the user holds when a userId is given`, o objeto `hold` passa a incluir o preço (o repositório in-memory devolve o record completo):

```ts
    const hold = {
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
      priceFromCents: 15000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    };
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/get-seatmap.use-case.spec.ts`
Expected: o teste de restore passa hoje (record sem preço era aceito); a falha real aparece no Step 4 quando o tipo exigir o campo — rode e confirme que está verde antes de mudar o tipo (é o estado baseline).

- [ ] **Step 3: Estender o tipo + implementações**

Em `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts`, troque o record:

```ts
export interface SeatHoldRecord {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
  expiresAt: Date;
}
```

Em `apps/api/src/modules/seatmaps/infra/drizzle-seatmap-repository.ts`, no select de `findHoldsByUser`, acrescente `priceFromCents: sectors.priceFromCents` e no `.map` devolva `priceFromCents: row.priceFromCents`.

Em `apps/api/src/modules/seatmaps/infra/in-memory-seatmap-repository.ts` nada muda no código (`SeededUserHold extends SeatHoldRecord` herda o campo) — mas **seeds existentes** que passam `holds` no construtor precisam do campo. Grep e ajuste:

Run: `rg -n "InMemorySeatmapRepository\(\[" apps/api/src --type ts`
Nos arquivos que passam um 2º argumento de holds (ex.: specs que seedam `userHolds`), adicione `priceFromCents` a cada seed (use o preço do setor correspondente da fixture, ex. `12000`).

- [ ] **Step 4: Rodar suíte de seatmaps**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS (tipos agora exigem o campo; seeds ajustados; Drizzle devolve o preço real de `sectors.price_from_cents`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/seatmaps
git commit -m "feat(api): include sector price on seat hold records"
```

---

### Task 4: RedisCartRepository (hash com TTL)

**Files:**
- Create: `apps/api/src/modules/seatmaps/infra/redis-cart-repository.ts` (+spec)

- [ ] **Step 1: Teste (red)**

Create `apps/api/src/modules/seatmaps/infra/redis-cart-repository.spec.ts` (mesmo setup de teste Redis do `redis-hold-repository.spec.ts` — `createRedis(TEST_REDIS_URL)` + `flushTestRedis`/`flushdb` no `beforeEach`; NUNCA `createRedis()` sem a env de teste):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import { cartItemKey } from '../domain/cart-repository.js';
import { RedisCartRepository } from './redis-cart-repository.js';

describe('RedisCartRepository', () => {
  let redis: RedisClient;
  let repository: RedisCartRepository;

  beforeEach(async () => {
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();
    await redis.flushdb();
    repository = new RedisCartRepository(redis);
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('stores a ticket type under the cart key', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('plateia:A:6')).toBe('meia');
  });

  it('sets a ttl on the cart key', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    const ttl = await redis.ttl('cart:user-a:gig');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('separates carts by user and event', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'vip',
      ttlSeconds: 600,
    });
    expect(
      (await repository.getTypes({ userId: 'user-b', eventSlug: 'gig' })).size,
    ).toBe(0);
    expect(
      (
        await repository.getTypes({ userId: 'user-a', eventSlug: 'outro' })
      ).size,
    ).toBe(0);
  });

  it('ignores values that are not ticket types', async () => {
    await redis.hset('cart:user-a:gig', 'plateia:A:6', 'leilao');
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/redis-cart-repository.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Create `apps/api/src/modules/seatmaps/infra/redis-cart-repository.ts`:

```ts
import { ticketTypeSchema, type TicketType } from '@ticketvibe/shared';

import type { RedisClient } from '../../../redis/client.js';
import type { CartRepository } from '../domain/cart-repository.js';

export class RedisCartRepository implements CartRepository {
  constructor(private readonly redis: RedisClient) {}

  private key(userId: string, eventSlug: string): string {
    return `cart:${userId}:${eventSlug}`;
  }

  async setType(input: {
    userId: string;
    eventSlug: string;
    itemKey: string;
    ticketType: TicketType;
    ttlSeconds: number;
  }): Promise<void> {
    const key = this.key(input.userId, input.eventSlug);
    await this.redis.hset(key, input.itemKey, input.ticketType);
    await this.redis.expire(key, input.ttlSeconds);
  }

  async getTypes(input: {
    userId: string;
    eventSlug: string;
  }): Promise<Map<string, TicketType>> {
    const hash = await this.redis.hgetall(
      this.key(input.userId, input.eventSlug),
    );
    const result = new Map<string, TicketType>();
    for (const [itemKey, value] of Object.entries(hash)) {
      const parsed = ticketTypeSchema.safeParse(value);
      if (parsed.success) {
        result.set(itemKey, parsed.data);
      }
    }
    return result;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/infra/redis-cart-repository.spec.ts && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS (4); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/seatmaps/infra/redis-cart-repository.ts apps/api/src/modules/seatmaps/infra/redis-cart-repository.spec.ts
git commit -m "feat(api): store cart ticket types in redis"
```

---

### Task 5: GetCartUseCase (holds × tipos × preços)

**Files:**
- Create: `apps/api/src/modules/seatmaps/use-cases/get-cart.use-case.ts` (+spec)

- [ ] **Step 1: Teste (red)**

Create `apps/api/src/modules/seatmaps/use-cases/get-cart.use-case.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryCartRepository } from '../infra/in-memory-cart-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { GetCartUseCase } from './get-cart.use-case.js';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 12000,
      rows: [],
    },
  ],
};

function seedHolds() {
  return [
    {
      eventSlug: 'gig',
      userId: 'user-a',
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    },
    {
      eventSlug: 'gig',
      userId: 'user-a',
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '2',
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:08:00.000Z'),
    },
  ];
}

describe('GetCartUseCase', () => {
  it('reports event_not_found for an unknown event', async () => {
    const useCase = new GetCartUseCase(
      new InMemorySeatmapRepository([gig]),
      new InMemoryCartRepository(),
    );
    await expect(useCase.execute('user-a', 'outro')).resolves.toEqual({
      kind: 'event_not_found',
    });
  });

  it('returns an empty cart without holds', async () => {
    const useCase = new GetCartUseCase(
      new InMemorySeatmapRepository([gig]),
      new InMemoryCartRepository(),
    );
    await expect(useCase.execute('user-a', 'gig')).resolves.toEqual({
      kind: 'cart',
      cart: { eventSlug: 'gig', items: [], expiresAt: null, totalCents: 0 },
    });
  });

  it('prices items with the stored type defaulting to inteira', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([gig], seedHolds());
    const cartRepository = new InMemoryCartRepository();
    await cartRepository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: 'pista:A:1',
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const useCase = new GetCartUseCase(seatmapRepository, cartRepository);
    const result = await useCase.execute('user-a', 'gig');
    expect(result).toEqual({
      kind: 'cart',
      cart: {
        eventSlug: 'gig',
        items: [
          {
            sectorSlug: 'pista',
            rowLabel: 'A',
            seatLabel: '1',
            ticketType: 'meia',
            priceCents: 6000,
            expiresAt: new Date('2026-10-16T12:10:00.000Z'),
          },
          {
            sectorSlug: 'pista',
            rowLabel: 'A',
            seatLabel: '2',
            ticketType: 'inteira',
            priceCents: 12000,
            expiresAt: new Date('2026-10-16T12:08:00.000Z'),
          },
        ],
        expiresAt: new Date('2026-10-16T12:08:00.000Z'),
        totalCents: 18000,
      },
    });
  });

  it('expires holds before building the cart', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([gig], seedHolds());
    const expireSpy = vi.spyOn(seatmapRepository, 'expireHolds');
    const useCase = new GetCartUseCase(
      seatmapRepository,
      new InMemoryCartRepository(),
    );
    await useCase.execute('user-a', 'gig');
    expect(expireSpy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/get-cart.use-case.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Create `apps/api/src/modules/seatmaps/use-cases/get-cart.use-case.ts`:

```ts
import {
  type CartDto,
  type TicketType,
  ticketPriceCents,
} from '@ticketvibe/shared';

import { cartItemKey } from '../domain/cart-repository.js';
import type { CartRepository } from '../domain/cart-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type GetCartResult =
  | { kind: 'cart'; cart: CartDto }
  | { kind: 'event_not_found' };

export class GetCartUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly cartRepository: CartRepository,
  ) {}

  async execute(userId: string, eventSlug: string): Promise<GetCartResult> {
    const seatmap = await this.seatmapRepository.findSeatmap(eventSlug);
    if (!seatmap) {
      return { kind: 'event_not_found' };
    }

    await this.seatmapRepository.expireHolds();
    const holds = await this.seatmapRepository.findHoldsByUser({
      eventSlug,
      userId,
    });
    if (holds.length === 0) {
      return {
        kind: 'cart',
        cart: { eventSlug, items: [], expiresAt: null, totalCents: 0 },
      };
    }

    const types = await this.cartRepository.getTypes({ userId, eventSlug });
    let totalCents = 0;
    let earliest: Date | null = null;
    const items = holds.map((hold) => {
      const ticketType: TicketType =
        types.get(cartItemKey(hold.sectorSlug, hold.rowLabel, hold.seatLabel)) ??
        'inteira';
      const priceCents = ticketPriceCents(ticketType, hold.priceFromCents);
      totalCents += priceCents;
      if (!earliest || hold.expiresAt < earliest) {
        earliest = hold.expiresAt;
      }
      return {
        sectorSlug: hold.sectorSlug,
        rowLabel: hold.rowLabel,
        seatLabel: hold.seatLabel,
        ticketType,
        priceCents,
        expiresAt: hold.expiresAt,
      };
    });

    return {
      kind: 'cart',
      cart: { eventSlug, items, expiresAt: earliest, totalCents },
    };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/get-cart.use-case.spec.ts && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS (4); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/seatmaps/use-cases/get-cart.use-case.ts apps/api/src/modules/seatmaps/use-cases/get-cart.use-case.spec.ts
git commit -m "feat(api): build the event cart from holds and ticket types"
```

---

### Task 6: SetCartItemUseCase + limite de carrinho no HoldSeatUseCase

**Files:**
- Create: `apps/api/src/modules/seatmaps/use-cases/set-cart-item.use-case.ts` (+spec)
- Modify: `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.ts` (+spec)
- Modify: `apps/api/src/modules/seatmaps/routes/holds.routes.ts` (+spec)

- [ ] **Step 1: Teste do SetCartItem (red)**

Create `apps/api/src/modules/seatmaps/use-cases/set-cart-item.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { SeatmapEntity } from '../domain/seatmap-entity.js';
import { InMemoryCartRepository } from '../infra/in-memory-cart-repository.js';
import { InMemoryHoldRepository } from '../infra/in-memory-hold-repository.js';
import { InMemorySeatmapRepository } from '../infra/in-memory-seatmap-repository.js';
import { SetCartItemUseCase } from './set-cart-item.use-case.js';

const gig: SeatmapEntity = {
  eventSlug: 'gig',
  sectors: [
    {
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 12000,
      rows: [
        {
          label: 'A',
          seats: [
            { label: '1', status: 'reserved' },
            { label: '2', status: 'available' },
          ],
        },
      ],
    },
  ],
};

function build() {
  const seatmapRepository = new InMemorySeatmapRepository([gig]);
  const holdRepository = new InMemoryHoldRepository();
  const cartRepository = new InMemoryCartRepository();
  const useCase = new SetCartItemUseCase(
    seatmapRepository,
    holdRepository,
    cartRepository,
  );
  return { useCase, holdRepository, cartRepository };
}

const baseInput = {
  userId: 'user-a',
  eventSlug: 'gig',
  sectorSlug: 'pista',
  rowLabel: 'A',
  seatLabel: '1',
  ticketType: 'meia' as const,
};

describe('SetCartItemUseCase', () => {
  it('stores the ticket type for an owned hold', async () => {
    const { useCase, holdRepository, cartRepository } = build();
    // The hold key must match the one produced by holdSeatKey for the
    // coords; the in-memory seatmap builds ids as eventSlug:sector:row:seat,
    // so seed the exact key the use case computes.
    await holdRepository.claim(
      'hold:seat:gig:gig:pista:A:gig:pista:A:1',
      'user-a',
      600,
    );
    const result = await useCase.execute(baseInput);
    expect(result).toEqual({
      kind: 'cart_item_set',
      item: {
        sectorSlug: 'pista',
        rowLabel: 'A',
        seatLabel: '1',
        ticketType: 'meia',
      },
    });
    const types = await cartRepository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('pista:A:1')).toBe('meia');
  });

  it('reports hold_not_found without an owned hold', async () => {
    const { useCase } = build();
    await expect(useCase.execute(baseInput)).resolves.toEqual({
      kind: 'hold_not_found',
    });
  });

  it('distinguishes event, sector and seat misses', async () => {
    const { useCase } = build();
    expect(
      (await useCase.execute({ ...baseInput, eventSlug: 'x' })).kind,
    ).toBe('event_not_found');
    expect(
      (await useCase.execute({ ...baseInput, sectorSlug: 'x' })).kind,
    ).toBe('sector_not_found');
    expect(
      (
        await useCase.execute({ ...baseInput, seatLabel: '9' })
      ).kind,
    ).toBe('seat_not_found');
  });
});
```

Nota: o `holdSeatKey` real é `hold:seat:${eventId}:${rowId}:${seatId}` e o `findSeatByCoords` in-memory monta `eventId = eventSlug`, `rowId = eventSlug:sector:row`, `seatId = eventSlug:sector:row:seat` — por isso a chave seedada no teste é a forma colada acima (ela espelha exatamente o cálculo do use case; se o in-memory mudar os ids, o teste falha e orienta a correção).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/set-cart-item.use-case.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar SetCartItemUseCase**

Create `apps/api/src/modules/seatmaps/use-cases/set-cart-item.use-case.ts`:

```ts
import {
  SEAT_HOLD_TTL_SECONDS,
  type TicketType,
} from '@ticketvibe/shared';

import type { CartRepository } from '../domain/cart-repository.js';
import { cartItemKey } from '../domain/cart-repository.js';
import { holdSeatKey } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export type SetCartItemResult =
  | {
      kind: 'cart_item_set';
      item: {
        sectorSlug: string;
        rowLabel: string;
        seatLabel: string;
        ticketType: TicketType;
      };
    }
  | { kind: 'event_not_found' }
  | { kind: 'sector_not_found' }
  | { kind: 'seat_not_found' }
  | { kind: 'hold_not_found' };

export class SetCartItemUseCase {
  constructor(
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
    private readonly cartRepository: CartRepository,
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
    ticketType: TicketType;
  }): Promise<SetCartItemResult> {
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
    const owned = await this.holdRepository.owns(seatKey, input.userId);
    if (!owned) {
      return { kind: 'hold_not_found' };
    }

    await this.cartRepository.setType({
      userId: input.userId,
      eventSlug: input.eventSlug,
      itemKey: cartItemKey(input.sectorSlug, input.rowLabel, input.seatLabel),
      ticketType: input.ticketType,
      ttlSeconds: SEAT_HOLD_TTL_SECONDS,
    });

    return {
      kind: 'cart_item_set',
      item: {
        sectorSlug: input.sectorSlug,
        rowLabel: input.rowLabel,
        seatLabel: input.seatLabel,
        ticketType: input.ticketType,
      },
    };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/set-cart-item.use-case.spec.ts && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS (3); tsc limpo.

- [ ] **Step 5: Teste do cart_limit no HoldSeat (red)**

Append a `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.spec.ts` (import adicional no topo: `import { CART_MAX_ITEMS } from '@ticketvibe/shared';` — junto do import existente de `SEAT_HOLD_TTL_SECONDS`; e `import { InMemorySeatmapRepository }` já existe):

```ts
  it('rejects a new seat when the cart is full', async () => {
    const seatmapRepository = new InMemorySeatmapRepository([seatmap]);
    const holdRepository = new InMemoryHoldRepository();
    const useCase = new HoldSeatUseCase(
      seatmapRepository,
      holdRepository,
      () => new Date(Date.parse('2026-10-16T12:00:00.000Z')),
    );
    // Rows: A has seats 1..N free enough to fill the cart before the target.
    const fillers = Array.from(
      { length: CART_MAX_ITEMS },
      (_, index) => ({
        eventSlug: 'o-fantasma-da-opera',
        userId: 'user-a',
        sectorSlug: 'plateia',
        rowLabel: 'B',
        seatLabel: String(index + 1),
        priceFromCents: 12000,
        expiresAt: new Date('2026-10-16T12:10:00.000Z'),
      }),
    );
    const repositoryWithCart = new InMemorySeatmapRepository(
      [
        {
          ...seatmap,
          sectors: [
            {
              ...seatmap.sectors[0],
              rows: [
                ...seatmap.sectors[0].rows,
                {
                  label: 'B',
                  seats: Array.from({ length: CART_MAX_ITEMS }, (_, i) => ({
                    label: String(i + 1),
                    status: 'reserved' as const,
                  })),
                },
              ],
            },
          ],
        },
      ],
      fillers,
    );
    const limitedUseCase = new HoldSeatUseCase(
      repositoryWithCart,
      new InMemoryHoldRepository(),
      () => new Date(Date.parse('2026-10-16T12:00:00.000Z')),
    );
    const result = await limitedUseCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '1',
    });
    expect(result.kind).toBe('cart_limit');
  });

  it('still renews the same seat when the cart is full', async () => {
    const fillers = Array.from({ length: CART_MAX_ITEMS }, (_, index) => ({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-a',
      sectorSlug: 'plateia',
      rowLabel: 'B',
      seatLabel: String(index + 1),
      priceFromCents: 12000,
      expiresAt: new Date('2026-10-16T12:10:00.000Z'),
    }));
    const repositoryWithCart = new InMemorySeatmapRepository(
      [
        {
          ...seatmap,
          sectors: [
            {
              ...seatmap.sectors[0],
              rows: [
                ...seatmap.sectors[0].rows,
                {
                  label: 'B',
                  seats: Array.from({ length: CART_MAX_ITEMS }, (_, i) => ({
                    label: String(i + 1),
                    status: 'reserved' as const,
                  })),
                },
              ],
            },
          ],
        },
      ],
      fillers,
    );
    const holdRepository = new InMemoryHoldRepository();
    const limitedUseCase = new HoldSeatUseCase(
      repositoryWithCart,
      holdRepository,
      () => new Date(Date.parse('2026-10-16T12:00:00.000Z')),
    );
    await holdRepository.claim(
      'hold:seat:o-fantasma-da-opera:o-fantasma-da-opera:plateia:A:o-fantasma-da-opera:plateia:A:1',
      'user-a',
      600,
    );
    const result = await limitedUseCase.execute({
      userId: 'user-a',
      ...baseInput,
      seatLabel: '1',
    });
    expect(result.kind).toBe('held');
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases/hold-seat.use-case.spec.ts`
Expected: 2 novos FAIL — `cart_limit` não existe no union.

- [ ] **Step 7: Implementar o limite**

Em `apps/api/src/modules/seatmaps/use-cases/hold-seat.use-case.ts`:

No topo, troque o import de shared:

```ts
import {
  CART_MAX_ITEMS,
  SEAT_HOLD_TTL_SECONDS,
} from '@ticketvibe/shared';
```

No union `HoldSeatResult`, acrescente após `seat_held`:

```ts
  | { kind: 'cart_limit' };
```

No meio de `execute`, após o bloco `const { seat } = lookup; … status gate` e **antes** do `const seatKey = holdSeatKey(...)`/`claim`, adicione a checagem (ela usa o próprio `seatmapRepository.findHoldsByUser` — o use case já recebe o repositório):

```ts
    const seatKey = holdSeatKey(seat.eventId, seat.rowId, seat.seatId);
    const alreadyOwned = await this.holdRepository.owns(
      seatKey,
      input.userId,
    );
    if (!alreadyOwned) {
      const activeHolds = await this.seatmapRepository.findHoldsByUser({
        eventSlug: input.eventSlug,
        userId: input.userId,
      });
      if (activeHolds.length >= CART_MAX_ITEMS) {
        return { kind: 'cart_limit' };
      }
    }
```

(O `claim` abaixo continua igual; quando `alreadyOwned` é true o claim devolve `'owned'` e o fluxo vira renew — inalterado.)

- [ ] **Step 8: Rota devolve 409 cart_limit (teste + impl no mesmo passo)**

Em `apps/api/src/modules/seatmaps/routes/holds.routes.ts`, no switch de `POST /events/:slug/holds`, adicione o case antes de `seat_unavailable`:

```ts
      case 'cart_limit':
        return reply.code(409).send({ error: 'cart_limit' });
```

Append um teste em `apps/api/src/modules/seatmaps/routes/holds.routes.spec.ts` usando o padrão exato do arquivo (mock de módulo `holdSeat.execute` + `buildTestApp`):

```ts
  it('maps cart_limit to 409', async () => {
    vi.mocked(holdSeat.execute).mockResolvedValueOnce({ kind: 'cart_limit' });
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'cart_limit' });
    await app.close();
  });
```

- [ ] **Step 9: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/use-cases src/modules/seatmaps/routes/holds.routes.spec.ts && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo. (A integração de holds ganha o mesmo cenário na Task 7 junto das rotas de cart.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/seatmaps
git commit -m "feat(api): set cart ticket types and cap cart size"
```

---

### Task 7: Rotas de cart (unit + integração) e wiring no app.ts

**Files:**
- Create: `apps/api/src/modules/seatmaps/routes/cart.routes.ts`
- Create: `apps/api/src/modules/seatmaps/routes/cart.routes.spec.ts`
- Create: `apps/api/src/modules/seatmaps/routes/cart.routes.integration.spec.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/seatmaps/routes/holds.routes.integration.spec.ts`

- [ ] **Step 1: Testes unitários das rotas (red)**

Create `apps/api/src/modules/seatmaps/routes/cart.routes.spec.ts`, no padrão de `holds.routes.spec.ts` (mocks de módulo + `buildTestApp`):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import type { GetCartUseCase } from '../use-cases/get-cart.use-case.js';
import type { SetCartItemUseCase } from '../use-cases/set-cart-item.use-case.js';

const getCart = {
  execute: vi.fn(),
} as unknown as GetCartUseCase;
const setCartItem = {
  execute: vi.fn(),
} as unknown as SetCartItemUseCase;

function buildTestApp(getSession: GetSessionFn) {
  return buildApp({ getCart, setCartItem, getSession });
}

const emptyCart = {
  kind: 'cart' as const,
  cart: {
    eventSlug: 'o-fantasma-da-opera',
    items: [],
    expiresAt: null,
    totalCents: 0,
  },
};

describe('cart routes (unit)', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session on GET cart', async () => {
    const app = buildTestApp(async () => null);
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(401);
    expect(getCart.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 with the cart', async () => {
    vi.mocked(getCart.execute).mockResolvedValueOnce(emptyCart);
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(emptyCart.cart);
    expect(getCart.execute).toHaveBeenCalledWith(
      'user-a',
      'o-fantasma-da-opera',
    );
    await app.close();
  });

  it('maps event_not_found to 404 on GET cart', async () => {
    vi.mocked(getCart.execute).mockResolvedValueOnce({
      kind: 'event_not_found',
    });
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
    await app.close();
  });

  it('stores a cart item with 200', async () => {
    vi.mocked(setCartItem.execute).mockResolvedValueOnce({
      kind: 'cart_item_set',
      item: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      item: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    await app.close();
  });

  it('maps 404 kinds and hold_not_found on PUT', async () => {
    for (const kind of [
      'event_not_found',
      'sector_not_found',
      'seat_not_found',
      'hold_not_found',
    ] as const) {
      vi.mocked(setCartItem.execute).mockResolvedValueOnce({ kind });
      const app = buildTestApp(async () => ({ userId: 'user-a' }));
      const response = await app.inject({
        method: 'PUT',
        url: '/events/o-fantasma-da-opera/cart/items',
        payload: {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'vip',
        },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: kind });
      await app.close();
    }
  });

  it('rejects an invalid body on PUT', async () => {
    const app = buildTestApp(async () => ({ userId: 'user-a' }));
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      payload: { sectorSlug: '', rowLabel: 'A', seatLabel: '6', ticketType: 'x' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_body');
    expect(setCartItem.execute).not.toHaveBeenCalled();
    await app.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes/cart.routes.spec.ts`
Expected: FAIL — rotas/wiring inexistentes.

- [ ] **Step 3: Implementar cart.routes.ts + wiring**

Create `apps/api/src/modules/seatmaps/routes/cart.routes.ts`:

```ts
import {
  cartItemRequestSchema,
  cartSchema,
  setCartItemResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { GetCartUseCase } from '../use-cases/get-cart.use-case.js';
import type { SetCartItemUseCase } from '../use-cases/set-cart-item.use-case.js';

interface CartRoutesDeps {
  getSession: GetSessionFn;
  getCart: GetCartUseCase;
  setCartItem: SetCartItemUseCase;
}

export function registerCartRoutes(
  app: FastifyInstance,
  deps: CartRoutesDeps,
): void {
  app.get('/events/:slug/cart', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.getCart.execute(session.userId, slug);
    if (result.kind === 'event_not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const payload = cartSchema.parse({
      eventSlug: result.cart.eventSlug,
      items: result.cart.items.map((item) => ({
        ...item,
        expiresAt: item.expiresAt.toISOString(),
      })),
      expiresAt: result.cart.expiresAt?.toISOString() ?? null,
      totalCents: result.cart.totalCents,
    });
    return reply.send(payload);
  });

  app.put('/events/:slug/cart/items', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = cartItemRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.setCartItem.execute({
      userId: session.userId,
      eventSlug: slug,
      sectorSlug: parsed.data.sectorSlug,
      rowLabel: parsed.data.rowLabel,
      seatLabel: parsed.data.seatLabel,
      ticketType: parsed.data.ticketType,
    });
    switch (result.kind) {
      case 'event_not_found':
      case 'sector_not_found':
      case 'seat_not_found':
      case 'hold_not_found':
        return reply.code(404).send({ error: result.kind });
      case 'cart_item_set':
        return reply.send(
          setCartItemResponseSchema.parse({ item: result.item }),
        );
    }
  });
}
```

Em `apps/api/src/app.ts`, adicione os imports:

```ts
import type { CartRepository } from './modules/seatmaps/domain/cart-repository.js';
import { RedisCartRepository } from './modules/seatmaps/infra/redis-cart-repository.js';
import { registerCartRoutes } from './modules/seatmaps/routes/cart.routes.js';
import { GetCartUseCase } from './modules/seatmaps/use-cases/get-cart.use-case.js';
import { SetCartItemUseCase } from './modules/seatmaps/use-cases/set-cart-item.use-case.js';
```

No objeto `options` do `buildApp`, adicione:

```ts
    getCart?: GetCartUseCase;
    setCartItem?: SetCartItemUseCase;
    cartRepository?: CartRepository;
```

Troque o lazy de holds por um helper compartilhado de redis e acrescente o cart lazy (substitua o bloco `let defaultRedis… getHoldRepository`):

```ts
  let defaultRedis: RedisClient | null = null;
  const getRedis = (): RedisClient => {
    if (!defaultRedis) {
      defaultRedis = createRedis();
      defaultRedis.connect().catch(() => {});
    }
    return defaultRedis;
  };
  const getHoldRepository = (): HoldRepository => {
    if (options.holdRepository) return options.holdRepository;
    return new RedisHoldRepository(getRedis());
  };
  const getCartRepository = (): CartRepository => {
    if (options.cartRepository) return options.cartRepository;
    return new RedisCartRepository(getRedis());
  };
```

Estenda o `lazyHoldRepository` com `owns` e crie o `lazyCartRepository`:

```ts
  const lazyHoldRepository: HoldRepository = {
    claim: (seatKey, userId, ttlSeconds) =>
      getHoldRepository().claim(seatKey, userId, ttlSeconds),
    renew: (seatKey, userId, ttlSeconds) =>
      getHoldRepository().renew(seatKey, userId, ttlSeconds),
    release: (seatKey, userId) => getHoldRepository().release(seatKey, userId),
    owns: (seatKey, userId) => getHoldRepository().owns(seatKey, userId),
  };

  const lazyCartRepository: CartRepository = {
    setType: (input) => getCartRepository().setType(input),
    getTypes: (input) => getCartRepository().getTypes(input),
  };
```

Logo após o `registerHoldRoutes`, registre o cart:

```ts
  registerCartRoutes(app, {
    getSession,
    getCart:
      options.getCart ??
      new GetCartUseCase(seatmapRepository, lazyCartRepository),
    setCartItem:
      options.setCartItem ??
      new SetCartItemUseCase(
        seatmapRepository,
        lazyHoldRepository,
        lazyCartRepository,
      ),
  });
```

- [ ] **Step 4: Rodar unit**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes/cart.routes.spec.ts src/modules/seatmaps/routes/holds.routes.spec.ts && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo.

- [ ] **Step 5: Integração (red → green)**

Create `apps/api/src/modules/seatmaps/routes/cart.routes.integration.spec.ts` no padrão de `holds.routes.integration.spec.ts` (mesmos `beforeAll`/`beforeEach`/`afterAll`, mas `buildApp` recebe também `cartRepository: new RedisCartRepository(redis)`):

```ts
import { cartSchema } from '@ticketvibe/shared';
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
import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import { DrizzleSeatmapRepository } from '../infra/drizzle-seatmap-repository.js';
import { RedisCartRepository } from '../infra/redis-cart-repository.js';
import { RedisHoldRepository } from '../infra/redis-hold-repository.js';

describe('cart routes (postgres + redis integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;
  let redis: RedisClient;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    return { userId };
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();

    app = buildApp({
      seatmapRepository: new DrizzleSeatmapRepository(testDb),
      holdRepository: new RedisHoldRepository(redis),
      cartRepository: new RedisCartRepository(redis),
      getSession,
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

  const hold = async (seatLabel: string, userId = 'user-a') => {
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': userId },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel },
    });
    expect(response.statusCode).toBe(201);
  };

  it('requires a session on GET cart (401)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for an unknown event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/nao-existe/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('stores the ticket type and prices the cart', async () => {
    await hold('6');
    const put = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(put.statusCode).toBe(200);

    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(cart.statusCode).toBe(200);
    const body = cartSchema.parse(cart.json());
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
      priceCents: 6000,
    });
    expect(body.totalCents).toBe(6000);
    expect(body.expiresAt).not.toBeNull();
  });

  it('defaults the ticket type to inteira', async () => {
    await hold('6');
    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    const body = cartSchema.parse(cart.json());
    expect(body.items[0].ticketType).toBe('inteira');
    expect(body.items[0].priceCents).toBe(12000);
  });

  it('prices vip at double', async () => {
    await hold('6');
    await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'vip',
      },
    });
    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    const body = cartSchema.parse(cart.json());
    expect(body.items[0].priceCents).toBe(24000);
    expect(body.totalCents).toBe(24000);
  });

  it('rejects a type change without an owned hold', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'hold_not_found' });
  });

  it('caps the cart at 8 seats with 409 cart_limit', async () => {
    const labels = ['1', '3', '4', '5', '6', '8', '9', '10'];
    for (const seatLabel of labels) {
      await hold(seatLabel);
    }
    const overflow = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '11' },
    });
    expect(overflow.statusCode).toBe(409);
    expect(overflow.json()).toEqual({ error: 'cart_limit' });
  });

  it('empties the cart when the holds expire', async () => {
    await hold('6');
    await testDb.execute(
      (await import('drizzle-orm')).sql`
        update seats set hold_expires_at = now() - interval '1 second'
        where hold_user_id = 'user-a'
      `,
    );
    const cart = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(cart.statusCode).toBe(200);
    const body = cartSchema.parse(cart.json());
    expect(body.items).toHaveLength(0);
    expect(body.expiresAt).toBeNull();
  });

  it('keeps carts isolated per user', async () => {
    await hold('6', 'user-a');
    const other = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
      headers: { 'x-test-user-id': 'user-b' },
    });
    const body = cartSchema.parse(other.json());
    expect(body.items).toHaveLength(0);
  });
});
```

Nota: os marks da fixture (B-7/C-4/C-5/D-10/H-12) ficam em outras filas — a fila A da plateia tem as 12 cadeiras livres, então o loop de labels `['1', '3', '4', '5', '6', '8', '9', '10']` enche o carrinho sem colidir com os testes E2E de seatmap (cadeiras 6/8/10/12) nem com o overflow na cadeira 11. O teste de limite deve encher 8 e ver o 9º com 409.

Rode e ajuste até verde:

Run: `pnpm infra:up && pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes/cart.routes.integration.spec.ts`
Expected: PASS (9).

Também acrescente o mesmo cenário de limite à integração de holds existente em `holds.routes.integration.spec.ts` (mesmo loop de 8 + overflow → 409 `cart_limit`), garantindo que a rota de hold mapeia o novo kind em PG+Redis reais.

- [ ] **Step 6: Rodar suíte da API inteira**

Run: `pnpm --filter @ticketvibe/api exec vitest run && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS em todas as specs; tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/seatmaps apps/api/src/app.ts
git commit -m "feat(api): expose event cart routes and wire cart repository"
```

---

### Task 8: Proxies web de cart (GET + PUT)

**Files:**
- Create: `apps/web/src/app/api/events/[slug]/cart/route.ts` (+spec)
- Create: `apps/web/src/app/api/events/[slug]/cart/items/route.ts` (+spec)

- [ ] **Step 1: Testes dos proxies (red)**

Create `apps/web/src/app/api/events/[slug]/cart/route.spec.ts`, espelhando o padrão de `seatmap/route.spec.ts` (`vi.hoisted` API_URL, msw server, `request()` helper, context `{ params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) }`):

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

function request(slug: string, cookie?: string) {
  return new Request(`http://localhost:3000/api/events/${slug}/cart`, {
    headers: cookie ? { cookie } : {},
  });
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

const emptyCart = {
  eventSlug: 'o-fantasma-da-opera',
  items: [],
  expiresAt: null,
  totalCents: 0,
};

describe('GET /api/events/[slug]/cart', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('forwards the session cookie', async () => {
    let forwardedCookie = '';
    server.use(
      http.get(
        'http://localhost:3001/events/o-fantasma-da-opera/cart',
        ({ request: upstream }) => {
          forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
          return HttpResponse.json(emptyCart);
        },
      ),
    );

    const res = await GET(
      request('o-fantasma-da-opera', 'better-auth.session_token=abc'),
      context,
    );
    expect(res.status).toBe(200);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
  });

  it('passes a valid cart through the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json(emptyCart),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(200);
    expect((await res.json()).eventSlug).toBe('o-fantasma-da-opera');
  });

  it('returns 404 when the event does not exist', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json({ error: 'event_not_found' }, { status: 404 }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('event_not_found');
  });

  it('returns 502 when the upstream request rejects', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.error(),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_error');
    expect(console.error).toHaveBeenCalled();
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.get('http://localhost:3001/events/o-fantasma-da-opera/cart', () =>
        HttpResponse.json({ eventSlug: 'x', items: 'nope' }),
      ),
    );

    const res = await GET(request('o-fantasma-da-opera'), context);
    expect(res.status).toBe(502);
  });
});
```

Create `apps/web/src/app/api/events/[slug]/cart/items/route.spec.ts` (mesmas convenções; testa PUT):

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
import { PUT } from './route';

vi.hoisted(() => {
  process.env.API_URL = 'http://localhost:3001';
});

const server = setupServer();

const item = {
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: '6',
  ticketType: 'meia',
};

function request(slug: string, body: unknown, cookie?: string) {
  return new Request(
    `http://localhost:3000/api/events/${slug}/cart/items`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

const context = { params: Promise.resolve({ slug: 'o-fantasma-da-opera' }) };

describe('PUT /api/events/[slug]/cart/items', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('rejects an invalid body without calling upstream', async () => {
    let calls = 0;
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => {
          calls += 1;
          return HttpResponse.json({});
        },
      ),
    );

    const res = await PUT(
      request('o-fantasma-da-opera', { sectorSlug: '', ...item, sectorSlug: '' }),
      context,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
    expect(calls).toBe(0);
  });

  it('forwards the session cookie and the parsed body', async () => {
    let forwardedCookie = '';
    let forwardedBody: unknown;
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        async ({ request: upstream }) => {
          forwardedCookie = new Headers(upstream.headers).get('cookie') ?? '';
          forwardedBody = await upstream.json();
          return HttpResponse.json({ item });
        },
      ),
    );

    const res = await PUT(
      request(
        'o-fantasma-da-opera',
        item,
        'better-auth.session_token=abc',
      ),
      context,
    );
    expect(res.status).toBe(200);
    expect(forwardedCookie).toBe('better-auth.session_token=abc');
    expect(forwardedBody).toEqual(item);
    expect((await res.json()).item).toEqual(item);
  });

  it('passes 404 hold_not_found through', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () =>
          HttpResponse.json({ error: 'hold_not_found' }, { status: 404 }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('hold_not_found');
  });

  it('returns 401 when upstream rejects the session', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(401);
  });

  it('returns 502 when the upstream payload violates the schema', async () => {
    server.use(
      http.put(
        'http://localhost:3001/events/o-fantasma-da-opera/cart/items',
        () => HttpResponse.json({ item: { sectorSlug: 'x' } }),
      ),
    );

    const res = await PUT(request('o-fantasma-da-opera', item), context);
    expect(res.status).toBe(502);
    expect(console.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/events`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar os proxies**

Create `apps/web/src/app/api/events/[slug]/cart/route.ts` (GET — espelhe `seatmap/route.ts`; cookie-forward, 404, schema parse com `cartSchema`, 502):

```ts
import { cartSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type CartContext = { params: Promise<{ slug: string }> };

export async function GET(
  request: Request,
  context: CartContext,
): Promise<Response> {
  const { slug } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/cart`,
      {
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch (error) {
    console.error('Cart upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 401) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (upstream.status === 404) {
    return Response.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!upstream.ok) {
    console.error(`Cart upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = cartSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Cart upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
```

Create `apps/web/src/app/api/events/[slug]/cart/items/route.ts` (PUT — espelhe `holds/route.ts`; body validate com `cartItemRequestSchema`, cookie-forward, 401/404 passthrough, parse com `setCartItemResponseSchema`, 502):

```ts
import {
  cartItemRequestSchema,
  setCartItemResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type SetCartItemContext = { params: Promise<{ slug: string }> };

export async function PUT(
  request: Request,
  context: SetCartItemContext,
): Promise<Response> {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = cartItemRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/cart/items`,
      {
        method: 'PUT',
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
    console.error('Set cart item upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 401) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (upstream.status === 404) {
    try {
      const body = await upstream.json();
      return Response.json(body, { status: 404 });
    } catch (error) {
      console.error('Set cart item upstream 404 body was not json:', error);
      return Response.json({ error: 'upstream_error' }, { status: 502 });
    }
  }
  if (!upstream.ok) {
    console.error(
      `Set cart item upstream responded with status ${upstream.status}`,
    );
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = setCartItemResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Set cart item upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/events && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS (specs novas + existentes); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/events
git commit -m "feat(web): proxy event cart reads and ticket type updates"
```

---

### Task 9: CartPanel (componente presentacional)

**Files:**
- Create: `apps/web/src/components/cart-panel.tsx` (+spec)

- [ ] **Step 1: Teste do CartPanel (red)**

Create `apps/web/src/components/cart-panel.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CartPanel, type CartPanelItem } from './cart-panel';

function baseItem(overrides: Partial<CartPanelItem> = {}): CartPanelItem {
  return {
    sectorSlug: 'plateia',
    sectorName: 'Plateia',
    rowLabel: 'A',
    seatLabel: '6',
    ticketType: 'inteira',
    priceCents: 12000,
    ...overrides,
  };
}

describe('CartPanel', () => {
  it('renders each seat with its price and the total', () => {
    render(
      <CartPanel
        items={[
          baseItem(),
          baseItem({ seatLabel: '8', ticketType: 'meia', priceCents: 6000 }),
        ]}
        totalCents={18000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Plateia · Fila A · Cadeira 8 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText(/Reserva expira em 09:59/)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(
      <CartPanel
        items={[]}
        totalCents={0}
        remainingSeconds={null}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Nenhum assento no carrinho.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reserva expira em/)).not.toBeInTheDocument();
  });

  it('calls onTypeChange with the new type', () => {
    const onTypeChange = vi.fn();
    render(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={onTypeChange}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByLabelText('Tipo de ingresso — Cadeira 6, fila A'),
      { target: { value: 'meia' } },
    );
    expect(onTypeChange).toHaveBeenCalledWith(
      expect.objectContaining({ seatLabel: '6', rowLabel: 'A' }),
      'meia',
    );
  });

  it('calls onRemove and onGiveUpAll', () => {
    const onRemove = vi.fn();
    const onGiveUpAll = vi.fn();
    render(
      <CartPanel
        items={[baseItem(), baseItem({ seatLabel: '8' })]}
        totalCents={24000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={onRemove}
        onGiveUpAll={onGiveUpAll}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Remover Cadeira 6, fila A' }),
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ seatLabel: '6' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Desistir de todos' }));
    expect(onGiveUpAll).toHaveBeenCalledOnce();
  });

  it('shows the renewed notice, the error and disables while pending', () => {
    const { rerender } = render(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Reserva renovada')).toBeInTheDocument();

    rerender(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice={false}
        pending
        error="Este assento acabou de ser reservado por outro comprador."
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent(
      'Este assento acabou de ser reservado por outro comprador.',
    );
    expect(
      screen.getByRole('button', { name: 'Desistir de todos' }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/cart-panel.spec.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o CartPanel**

Create `apps/web/src/components/cart-panel.tsx` (note: `formatBRL` já existe em `@/lib/format` — reutilize; **não** crie `money.ts`):

```tsx
import { type TicketType, ticketTypeSchema } from '@ticketvibe/shared';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';

export interface CartPanelItem {
  sectorSlug: string;
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  ticketType: TicketType;
  priceCents: number;
}

interface CartPanelProps {
  items: CartPanelItem[];
  totalCents: number;
  remainingSeconds: number | null;
  renewedNotice: boolean;
  pending: boolean;
  error: string | null;
  onTypeChange: (seat: CartPanelItem, ticketType: TicketType) => void;
  onRemove: (seat: CartPanelItem) => void;
  onGiveUpAll: () => void;
}

const TICKET_TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: 'inteira', label: 'Inteira' },
  { value: 'meia', label: 'Meia' },
  { value: 'vip', label: 'VIP' },
];

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function CartPanel({
  items,
  totalCents,
  remainingSeconds,
  renewedNotice,
  pending,
  error,
  onTypeChange,
  onRemove,
  onGiveUpAll,
}: CartPanelProps) {
  const hasItems = items.length > 0;

  return (
    <section
      aria-label="Carrinho"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">Carrinho</h2>

      {hasItems ? (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={`${item.sectorSlug}:${item.rowLabel}:${item.seatLabel}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-foreground">
                  {item.sectorName} · Fila {item.rowLabel} · Cadeira{' '}
                  {item.seatLabel} · {formatBRL(item.priceCents)}
                </span>
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="sr-only">
                      Tipo de ingresso — Cadeira {item.seatLabel}, fila{' '}
                      {item.rowLabel}
                    </span>
                    <select
                      aria-label={`Tipo de ingresso — Cadeira ${item.seatLabel}, fila ${item.rowLabel}`}
                      className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                      value={item.ticketType}
                      onChange={(event) => {
                        const parsed = ticketTypeSchema.safeParse(
                          event.target.value,
                        );
                        if (parsed.success) onTypeChange(item, parsed.data);
                      }}
                    >
                      {TICKET_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remover Cadeira ${item.seatLabel}, fila ${item.rowLabel}`}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => onRemove(item)}
                  >
                    Remover
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-sm font-medium text-foreground">
            Total: {formatBRL(totalCents)}
          </p>

          <div
            aria-live="polite"
            className={cn('flex flex-wrap items-center gap-3')}
          >
            {remainingSeconds !== null && (
              <p className="text-sm text-muted-foreground">
                Reserva expira em {formatCountdown(remainingSeconds)}
              </p>
            )}
            {renewedNotice && (
              <p className="text-sm text-muted-foreground">Reserva renovada</p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onGiveUpAll}
            >
              Desistir de todos
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum assento no carrinho.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/cart-panel.spec.tsx && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS (5); tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cart-panel.tsx apps/web/src/components/cart-panel.spec.tsx
git commit -m "feat(web): add presentational cart panel"
```

---

### Task 10: SeatMap multi-seleção + CartPanel (rework completo)

**Files:**
- Modify: `apps/web/src/components/seat-map.tsx` (reescrita)
- Modify: `apps/web/src/components/seat-map.spec.tsx` (reescrita)

- [ ] **Step 1: Reescrever o spec (red)**

Substitua **todo** o conteúdo de `apps/web/src/components/seat-map.spec.tsx` por:

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
  vi,
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
              { label: '4', status: 'available' },
              { label: '5', status: 'available' },
              { label: '6', status: 'available' },
              { label: '7', status: 'available' },
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
  holds: [] as {
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
    expiresAt: string;
  }[],
};

function useSeatmap() {
  server.use(
    http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
      HttpResponse.json(seatmapPayload),
    ),
  );
}

function useCart(
  items: {
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
    ticketType: string;
    priceCents: number;
  }[] = [],
) {
  server.use(
    http.get(/\/api\/events\/o-fantasma-da-opera\/cart$/, () =>
      HttpResponse.json({
        eventSlug: 'o-fantasma-da-opera',
        items: items.map((item) => ({
          ...item,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        })),
        expiresAt:
          items.length > 0
            ? new Date(Date.now() + 600_000).toISOString()
            : null,
        totalCents: 0,
      }),
    ),
  );
}

function useHold(seatLabel = '6', status: number = 201) {
  server.use(
    http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () =>
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
    http.post(/\/api\/events\/o-fantasma-da-opera\/holds\/release$/, () =>
      HttpResponse.json({ released: true }),
    ),
  );
}

const CART_ITEM_6 = 'Plateia · Fila A · Cadeira 6 · R$ 120,00';

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
    expect(screen.getByText(/8 de 10 livres/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));
    expect(screen.getByRole('button', { name: 'Balcão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Cadeira 3, fila A' }),
    ).not.toBeInTheDocument();
  });

  it('adds a free seat to the cart', async () => {
    useSeatmap();
    useHold('1');
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 120,00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadeira 1, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the cart when switching sectors', async () => {
    useSeatmap();
    useHold('1');
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );
    await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 120,00');

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));

    expect(
      screen.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(releasedLabels).toEqual([]);
  });

  it('picks the best available seat in one click', async () => {
    useSeatmap();
    useHold('1');
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

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
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
          holds: [],
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

  it('shows the countdown and lets the buyer give up', async () => {
    useSeatmap();
    useHold();
    useRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();
    expect(
      await screen.findByText(/Reserva expira em \d{2}:\d{2}/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desistir de todos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 120,00')).toBeInTheDocument();
  });

  it('restores holds and ticket types from the server', async () => {
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
    useCart([
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '1',
        ticketType: 'meia',
        priceCents: 6000,
      },
    ]);
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reserva expira em/)).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 60,00')).toBeInTheDocument();

    const seatOne = screen.getByRole('button', { name: 'Cadeira 1, fila A' });
    expect(seatOne).toBeEnabled();
    expect(seatOne).toHaveAttribute('aria-pressed', 'true');
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
      useCart();
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
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(0);
        if (screen.queryByText(/Reserva expira em/)) break;
      }
      expect(screen.getByText(/Reserva expira em/)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(1_500);
      expect(renewCalls).toBe(1);
      expect(screen.getByText('Reserva renovada')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases every seat when the buyer gives up', async () => {
    useSeatmap();
    const heldLabels: string[] = [];
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          heldLabels.push(body.seatLabel);
          return HttpResponse.json({
            hold: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: body.seatLabel,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          });
        },
      ),
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 7, fila A' }));
    await screen.findByText('Total: R$ 240,00');
    expect(heldLabels).toEqual(['6', '7']);

    fireEvent.click(
      screen.getByRole('button', { name: 'Desistir de todos' }),
    );
    await vi.waitFor(() =>
      expect(releasedLabels.sort()).toEqual(['6', '7']),
    );
    expect(
      await screen.findByText('Nenhum assento no carrinho.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Reserva expira em/),
    ).not.toBeInTheDocument();
  });

  it('releases a seat when clicking it again', async () => {
    useSeatmap();
    useHold('6');
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 6, fila A' }));

    await vi.waitFor(() => expect(releasedLabels).toEqual(['6']));
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
    expect(
      screen.getByText('Nenhum assento no carrinho.'),
    ).toBeInTheDocument();
  });

  it('adds a second seat without releasing the first', async () => {
    useSeatmap();
    const heldLabels: string[] = [];
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          heldLabels.push(body.seatLabel);
          return HttpResponse.json({
            hold: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: body.seatLabel,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          });
        },
      ),
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 7, fila A' }));

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 7 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 240,00')).toBeInTheDocument();
    expect(heldLabels).toEqual(['6', '7']);
    expect(releasedLabels).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Cadeira 6, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Cadeira 7, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('updates the ticket type through the cart', async () => {
    useSeatmap();
    useHold('6');
    const putBodies: {
      sectorSlug: string;
      rowLabel: string;
      seatLabel: string;
      ticketType: string;
    }[] = [];
    server.use(
      http.put(
        /\/api\/events\/o-fantasma-da-opera\/cart\/items$/,
        async ({ request }) => {
          const body = (await request.json()) as (typeof putBodies)[number];
          putBodies.push(body);
          return HttpResponse.json({ item: body });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);

    fireEvent.change(
      screen.getByLabelText('Tipo de ingresso — Cadeira 6, fila A'),
      { target: { value: 'meia' } },
    );

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 60,00')).toBeInTheDocument();
    await vi.waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
    });
  });

  it('shows the cart limit message when the server rejects the seat', async () => {
    useSeatmap();
    server.use(
      http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () =>
        HttpResponse.json({ error: 'cart_limit' }, { status: 409 }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(
      await screen.findByText(
        'Você já reservou o número máximo de assentos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
  });

  it('keeps the map rendered when a later poll fails', async () => {
    vi.useFakeTimers();
    try {
      let gets = 0;
      server.use(
        http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
          gets += 1;
          if (gets === 1) return HttpResponse.json(seatmapPayload);
          return HttpResponse.error();
        }),
      );
      render(<SeatMap eventSlug="o-fantasma-da-opera" />);
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(0);
        if (screen.queryByText(/8 de 10 livres/)) break;
      }
      expect(screen.getByText(/8 de 10 livres/)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(gets).toBeGreaterThan(1);
      expect(screen.getByText(/8 de 10 livres/)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reverts when the seat was just taken', async () => {
    useSeatmap();
    useHold('6', 409);
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(
      await screen.findByText(
        'Este assento acabou de ser reservado por outro comprador.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
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
      http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () => {
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
      }),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();
    expect(anonymousCalls).toBe(1);
    expect(holdCalls).toBe(2);
  });

  it('does not resurrect a seat after the buyer gives up', async () => {
    useSeatmap();
    let gets = 0;
    server.use(
      http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
        gets += 1;
        return HttpResponse.json({
          ...seatmapPayload,
          holds: [
            {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '6',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          ],
        });
      }),
    );
    useHold('6');
    useRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Desistir de todos' }),
    );
    await vi.waitFor(() =>
      expect(
        screen.queryByText(CART_ITEM_6),
      ).not.toBeInTheDocument(),
    );
    // The stale seatmap poll still lists the released hold; the dismissed
    // key must keep it out of the cart.
    expect(gets).toBeGreaterThan(1);
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
    expect(
      screen.getByText('Nenhum assento no carrinho.'),
    ).toBeInTheDocument();
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
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/seat-map.spec.tsx`
Expected: FAIL em massa — o componente atual ainda é single-select com "Você selecionou"/"Desistir da reserva".

- [ ] **Step 3: Reescrever o componente**

Substitua **todo** o conteúdo de `apps/web/src/components/seat-map.tsx` por:

```tsx
'use client';

import {
  bestSeatResponseSchema,
  cartItemRequestSchema,
  cartSchema,
  holdRequestSchema,
  holdResponseSchema,
  SEAT_HOLD_RENEW_AFTER_SECONDS,
  type SeatmapDto,
  seatmapResponseSchema,
  type TicketType,
  ticketPriceCents,
} from '@ticketvibe/shared';
import { cn } from 'cn';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CartPanel, type CartPanelItem } from '@/components/cart-panel';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { authClient } from '@/lib/auth-client';
import { formatBRL } from '@/lib/format';

interface SeatMapProps {
  eventSlug: string;
}

interface SeatCandidate {
  sectorSlug: string;
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}

interface SelectedSeat extends SeatCandidate {
  expiresAt: string;
  ticketType: TicketType;
  addedAtMs: number;
}

class HoldConflictError extends Error {}
class CartLimitError extends Error {}

function cartSeatKey(seat: {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
}): string {
  return `${seat.sectorSlug}:${seat.rowLabel}:${seat.seatLabel}`;
}

const TICK_MS = 1_000;
const POLL_MS = 10_000;

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn('size-4 rounded border', swatch)}
      />
      {label}
    </li>
  );
}

function toSelectedSeat(
  seatmap: SeatmapDto,
  hold: { sectorSlug: string; rowLabel: string; seatLabel: string },
): SeatCandidate | null {
  const sector = seatmap.sectors.find((item) => item.slug === hold.sectorSlug);
  if (!sector) return null;
  return {
    sectorSlug: sector.slug,
    sectorName: sector.name,
    rowLabel: hold.rowLabel,
    seatLabel: hold.seatLabel,
    priceFromCents: sector.priceFromCents,
  };
}

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

async function postHold(
  eventSlug: string,
  seat: SeatCandidate,
): Promise<Response> {
  const body = holdRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
  });
  return fetch(`/api/events/${encodeURIComponent(eventSlug)}/holds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

async function postRelease(
  eventSlug: string,
  seat: SeatCandidate,
): Promise<void> {
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

async function putCartItem(
  eventSlug: string,
  seat: SeatCandidate,
  ticketType: TicketType,
): Promise<Response> {
  const body = cartItemRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
    ticketType,
  });
  return fetch(
    `/api/events/${encodeURIComponent(eventSlug)}/cart/items`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
}

export function SeatMap({ eventSlug }: SeatMapProps) {
  const [seatmap, setSeatmap] = useState<SeatmapDto | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [items, setItems] = useState<SelectedSeat[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [renewedNotice, setRenewedNotice] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bestPending, setBestPending] = useState(false);
  const [bestError, setBestError] = useState<string | null>(null);
  const itemsRef = useRef<SelectedSeat[]>([]);
  const pendingKeysRef = useRef<Set<string>>(new Set());
  const renewingRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(new Set());
  const typesFetchedRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const applyItems = useCallback((next: SelectedSeat[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const fetchTypes = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/cart`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return;
      const cart = cartSchema.parse(await response.json());
      const typeByKey = new Map(
        cart.items.map((item) => [cartSeatKey(item), item.ticketType]),
      );
      if (typeByKey.size === 0) return;
      applyItems(
        itemsRef.current.map((item) => {
          const ticketType = typeByKey.get(cartSeatKey(item));
          return ticketType ? { ...item, ticketType } : item;
        }),
      );
    } catch {
      // The cart types stay at their current values.
    }
  }, [eventSlug, applyItems]);

  const fetchSeatmap = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/seatmap`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error('seatmap_request_failed');
      const payload = seatmapResponseSchema.parse(await response.json());
      setSeatmap(payload.seatmap);
      setLoading(false);
      hasLoadedRef.current = true;
      setError(false);

      const nowMs = Date.now();
      const next: SelectedSeat[] = [];
      for (const hold of payload.holds) {
        const key = cartSeatKey(hold);
        if (dismissedRef.current.has(key)) continue;
        const restored = toSelectedSeat(payload.seatmap, hold);
        if (!restored) continue;
        const existing = itemsRef.current.find(
          (item) => cartSeatKey(item) === key,
        );
        next.push(
          existing
            ? { ...existing, expiresAt: hold.expiresAt }
            : {
                ...restored,
                expiresAt: hold.expiresAt,
                ticketType: 'inteira' as const,
                addedAtMs: nowMs,
              },
        );
      }
      for (const local of itemsRef.current) {
        if (next.some((item) => cartSeatKey(item) === cartSeatKey(local))) {
          continue;
        }
        if (nowMs - local.addedAtMs < POLL_MS) next.push(local);
      }
      applyItems(next);
      if (!typesFetchedRef.current && payload.holds.length > 0) {
        typesFetchedRef.current = true;
        void fetchTypes();
      }
    } catch {
      setLoading(false);
      if (!hasLoadedRef.current) setError(true);
    }
  }, [eventSlug, applyItems, fetchTypes]);

  useEffect(() => {
    fetchSeatmap();
    const interval = setInterval(() => {
      fetchSeatmap();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchSeatmap]);

  async function sendHold(seat: SeatCandidate): Promise<string> {
    let response = await postHold(eventSlug, seat);
    if (response.status === 401) {
      await authClient.signIn.anonymous();
      response = await postHold(eventSlug, seat);
    }
    if (response.status === 409) {
      let code: unknown;
      try {
        code = (await response.json()).error;
      } catch {
        code = undefined;
      }
      if (code === 'cart_limit') throw new CartLimitError();
      throw new HoldConflictError();
    }
    if (!response.ok) throw new Error('hold_request_failed');
    const payload = holdResponseSchema.parse(await response.json());
    return payload.hold.expiresAt;
  }

  async function ensureHold(seat: SeatCandidate) {
    const key = cartSeatKey(seat);
    if (pendingKeysRef.current.has(key)) return;
    pendingKeysRef.current.add(key);
    setHoldPending(true);
    setHoldError(null);
    try {
      const expiresAt = await sendHold(seat);
      dismissedRef.current.delete(key);
      const existing = itemsRef.current.find(
        (item) => cartSeatKey(item) === key,
      );
      applyItems(
        existing
          ? itemsRef.current.map((item) =>
              cartSeatKey(item) === key ? { ...item, expiresAt } : item,
            )
          : [
              ...itemsRef.current,
              {
                ...seat,
                expiresAt,
                ticketType: 'inteira' as const,
                addedAtMs: Date.now(),
              },
            ],
      );
    } catch (err) {
      setHoldError(
        err instanceof CartLimitError
          ? 'Você já reservou o número máximo de assentos.'
          : err instanceof HoldConflictError
            ? 'Este assento acabou de ser reservado por outro comprador.'
            : 'Não foi possível reservar o assento. Tente novamente.',
      );
      fetchSeatmap();
    } finally {
      pendingKeysRef.current.delete(key);
      setHoldPending(pendingKeysRef.current.size > 0);
    }
  }

  function removeItem(seat: SelectedSeat) {
    const key = cartSeatKey(seat);
    dismissedRef.current.add(key);
    pendingKeysRef.current.delete(key);
    setHoldPending(pendingKeysRef.current.size > 0);
    applyItems(
      itemsRef.current.filter((item) => cartSeatKey(item) !== key),
    );
    setRenewedNotice(false);
    postRelease(eventSlug, seat)
      .catch(() => {})
      .finally(() => {
        fetchSeatmap();
      });
  }

  function selectSeat(seat: SeatCandidate) {
    const existing = itemsRef.current.find(
      (item) => cartSeatKey(item) === cartSeatKey(seat),
    );
    if (existing) {
      removeItem(existing);
      return;
    }
    ensureHold(seat);
  }

  async function giveUpAll() {
    const current = itemsRef.current;
    for (const item of current) {
      dismissedRef.current.add(cartSeatKey(item));
    }
    pendingKeysRef.current.clear();
    setHoldPending(false);
    applyItems([]);
    setRemainingSeconds(null);
    setRenewedNotice(false);
    setHoldError(null);
    await Promise.all(
      current.map((item) => postRelease(eventSlug, item).catch(() => {})),
    );
    fetchSeatmap();
  }

  async function changeType(seat: CartPanelItem, ticketType: TicketType) {
    const key = cartSeatKey(seat);
    const current = itemsRef.current.find(
      (item) => cartSeatKey(item) === key,
    );
    if (!current) return;
    const previous = current.ticketType;
    applyItems(
      itemsRef.current.map((item) =>
        cartSeatKey(item) === key ? { ...item, ticketType } : item,
      ),
    );
    try {
      let response = await putCartItem(eventSlug, current, ticketType);
      if (response.status === 401) {
        await authClient.signIn.anonymous();
        response = await putCartItem(eventSlug, current, ticketType);
      }
      if (!response.ok) throw new Error('cart_item_failed');
    } catch {
      applyItems(
        itemsRef.current.map((item) =>
          cartSeatKey(item) === key ? { ...item, ticketType: previous } : item,
        ),
      );
      setHoldError('Não foi possível atualizar o tipo de ingresso.');
    }
  }

  function switchSector(slug: string) {
    setHoldError(null);
    setBestError(null);
    setActiveSlug(slug);
  }

  async function pickBestSeat(sectorSlug: string) {
    setBestPending(true);
    setBestError(null);
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
      const payload = bestSeatResponseSchema.parse(await response.json());
      const sector = seatmap?.sectors.find(
        (item) => item.slug === payload.seat.sectorSlug,
      );
      if (!sector) throw new Error('best_seat_unknown_sector');
      setActiveSlug(sector.slug);
      const candidate: SeatCandidate = {
        sectorSlug: sector.slug,
        sectorName: sector.name,
        rowLabel: payload.seat.rowLabel,
        seatLabel: payload.seat.seatLabel,
        priceFromCents: payload.seat.priceFromCents,
      };
      const inCart = itemsRef.current.some(
        (item) => cartSeatKey(item) === cartSeatKey(candidate),
      );
      if (!inCart) ensureHold(candidate);
    } catch {
      setBestError('Não foi possível escolher o melhor lugar agora.');
    } finally {
      setBestPending(false);
    }
  }

  function renewSeat(seat: SelectedSeat) {
    const key = cartSeatKey(seat);
    renewingRef.current.add(key);
    postHold(eventSlug, seat)
      .then(async (response) => {
        if (!response.ok) return;
        const payload = holdResponseSchema.parse(await response.json());
        applyItems(
          itemsRef.current.map((item) =>
            cartSeatKey(item) === key
              ? { ...item, expiresAt: payload.hold.expiresAt }
              : item,
          ),
        );
        setRenewedNotice(true);
      })
      .catch(() => {})
      .finally(() => {
        renewingRef.current.delete(key);
      });
  }

  useEffect(() => {
    if (items.length === 0) {
      setRemainingSeconds(null);
      return;
    }

    const tick = () => {
      const nowMs = Date.now();
      const current = itemsRef.current;
      if (current.length === 0) {
        setRemainingSeconds(null);
        return;
      }
      const live = current.filter(
        (item) => Date.parse(item.expiresAt) > nowMs,
      );
      if (live.length !== current.length) {
        applyItems(live);
        setRenewedNotice(false);
        setHoldError('Sua reserva expirou. Selecione o assento novamente.');
        if (live.length === 0) {
          setRemainingSeconds(null);
          return;
        }
      }
      const secondsLeft = Math.min(
        ...live.map((item) => secondsUntil(item.expiresAt)),
      );
      setRemainingSeconds(secondsLeft);
      if (secondsLeft <= SEAT_HOLD_RENEW_AFTER_SECONDS) {
        for (const item of live) {
          const left = secondsUntil(item.expiresAt);
          if (
            left > 0 &&
            left <= SEAT_HOLD_RENEW_AFTER_SECONDS &&
            !renewingRef.current.has(cartSeatKey(item))
          ) {
            renewSeat(item);
          }
        }
      }
    };

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [items, applyItems]);

  useEffect(() => {
    if (!renewedNotice) return;
    const timeout = setTimeout(() => setRenewedNotice(false), 4000);
    return () => clearTimeout(timeout);
  }, [renewedNotice]);

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
  const cartItems: CartPanelItem[] = items.map((item) => ({
    sectorSlug: item.sectorSlug,
    sectorName: item.sectorName,
    rowLabel: item.rowLabel,
    seatLabel: item.seatLabel,
    ticketType: item.ticketType,
    priceCents: ticketPriceCents(item.ticketType, item.priceFromCents),
  }));
  const totalCents = cartItems.reduce((sum, item) => sum + item.priceCents, 0);

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
                    items.some(
                      (item) =>
                        item.sectorSlug === sector.slug &&
                        item.rowLabel === row.label &&
                        item.seatLabel === seat.label,
                    );
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      disabled={!isSelected && seat.status !== 'available'}
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
                          !isSelected &&
                          'cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60',
                        seat.status === 'unavailable' &&
                          !isSelected &&
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

        <CartPanel
          items={cartItems}
          totalCents={totalCents}
          remainingSeconds={remainingSeconds}
          renewedNotice={renewedNotice}
          pending={holdPending}
          error={holdError}
          onTypeChange={changeType}
          onRemove={(seat) => {
            const target = itemsRef.current.find(
              (item) => cartSeatKey(item) === cartSeatKey(seat),
            );
            if (target) removeItem(target);
          }}
          onGiveUpAll={() => {
            void giveUpAll();
          }}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/seat-map.spec.tsx src/components/cart-panel.spec.tsx && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS (todos os testes novos); tsc limpo.

- [ ] **Step 5: Rodar suíte web inteira (regressões de E2E auxiliares)**

Run: `pnpm --filter @ticketvibe/web exec vitest run`
Expected: PASS — specs existentes de rotas/proxies inalteradas devem continuar verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/seat-map.tsx apps/web/src/components/seat-map.spec.tsx
git commit -m "feat(web): turn the seat map into a multi-seat cart"
```

---

### Task 11: E2E — textos novos no seatmap.spec + cart.spec com expiração

**Files:**
- Modify: `apps/web/tests/e2e/seatmap.spec.ts`
- Create: `apps/web/tests/e2e/cart.spec.ts`

- [ ] **Step 1: Atualizar os textos do seatmap.spec.ts**

Substitua **todo** o conteúdo de `apps/web/tests/e2e/seatmap.spec.ts` por (fluxos iguais do ticket 11, asserts migrados para os textos do carrinho — "Você selecionou"/"Desistir da reserva"/`getByRole('status')` deixam de existir):

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

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Desistir de todos' }),
  ).toHaveCount(0);

  await expect(
    page.getByRole('button', { name: 'Cadeira 7, fila B' }),
  ).toBeDisabled();
});

test('escolhe o melhor lugar disponível com um clique', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Melhor lugar disponível' }).click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
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

test('reserva tem contagem regressiva e desistir libera o assento', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 8, fila A' }).click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 8 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText(/Reserva expira em 09:5\d/)).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
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

  await buyer1.getByRole('button', { name: 'Desistir de todos' }).click();
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
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 12 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
});
```

- [ ] **Step 2: Criar o cart.spec.ts**

Create `apps/web/tests/e2e/cart.spec.ts` (usa cadeiras 1–5 da fila A — livres na fixture — para não colidir com as cadeiras 6–12 do seatmap.spec):

```ts
import { execSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

function backdateHold(seatLabel: string): void {
  execSync(
    `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -c "update seats set hold_expires_at = now() - interval '1 second' where label = '${seatLabel}' and hold_user_id is not null and row_id in (select sr.id from seat_rows sr join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = 'o-fantasma-da-opera' and s.slug = 'plateia' and sr.label = 'A')"`,
    { stdio: 'ignore' },
  );
}

test('adiciona dois assentos e mostra o total do carrinho', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await page.getByRole('button', { name: 'Cadeira 3, fila A' }).click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
  ).toBeVisible();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 3 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText('Total: R$ 240,00')).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cadeira 1, fila A' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Cadeira 3, fila A' }),
  ).toBeEnabled();
});

test('meia entrada cobra metade do preço por item', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 4, fila A' }).click();
  await expect(page.getByText('Total: R$ 120,00')).toBeVisible();

  await page
    .getByLabel('Tipo de ingresso — Cadeira 4, fila A')
    .selectOption('meia');

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 4 · R$ 60,00'),
  ).toBeVisible();
  await expect(page.getByText('Total: R$ 60,00')).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
});

test('vip dobra o preço do assento', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 5, fila A' }).click();

  await page
    .getByLabel('Tipo de ingresso — Cadeira 5, fila A')
    .selectOption('vip');

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 5 · R$ 240,00'),
  ).toBeVisible();
  await expect(page.getByText('Total: R$ 240,00')).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
});

test('ao expirar, o carrinho esvazia e o assento volta a ficar livre', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 2, fila A' }).click();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 2 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  backdateHold('2');
  await page.reload();

  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(page.getByText(/Reserva expira em/)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Cadeira 2, fila A' }),
  ).toBeEnabled();
});
```

Notas do E2E de expiração (D8):
- `backdateHold` usa o container `ticketvibe-postgres` do `compose.yaml` (user/pass/db = `ticketvibe`); a instrução é direcionada por cadeira+fila+setor+evento para não afetar holds de outros testes.
- Após o backdate, o `GET /seatmap` da recarga dispara o `expireHolds()` lazy (ticket 11) → o assento volta a `available` e `holds[]` vem vazio → o carrinho renderiza o estado vazio. A chave Redis do hold ainda pode viver até o próprio TTL — divergência artificial só do teste (em produção os dois relógios nascem juntos no claim); por isso o teste **não** re-seleciona a cadeira logo em seguida.
- `playwright.config.ts`/`global-setup.ts` **não** são tocados.

- [ ] **Step 3: Rodar a bateria E2E completa**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test`
Expected: PASS — 6 testes do seatmap.spec (textos novos) + 4 do cart.spec = 10 E2E (mais os demais specs, se houver) sem flakes. Se o select de tipo não abrir por timing, troque `selectOption` por `click()` no `option` equivalente — mas `selectOption` é o caminho canônico do Playwright.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/seatmap.spec.ts apps/web/tests/e2e/cart.spec.ts
git commit -m "test(web): cover the event cart end to end"
```

---

### Task 12: Bateria de gates + fechar o ticket 12

**Files:**
- Modify: `.scratch/ticketvibe/issues/12-carrinho-de-evento-unico.md`

- [ ] **Step 1: Lint + typecheck (todos os pacotes)**

Run: `pnpm lint && pnpm typecheck`
Expected: 0 erros novos (Biome pode reportar 1 info pré-existente — o mesmo de sempre; nenhum warning/erro novo). Se Biome reclamar de formatação nos arquivos novos, rode `pnpm exec biome check --write` nos arquivos e recommit se preciso.

- [ ] **Step 2: Testes de unidade/integração**

Run: `pnpm test`
Expected: PASS — API (specs novas de cart/use-cases/repos/rotas + as atualizadas de holds), web (seat-map reescrito + cart-panel + proxies), shared (contratos novos). Qualquer contagem divergente das seções anteriores deve ser investigada (não "ajustar o número" sem entender).

- [ ] **Step 3: E2E**

Run: `pnpm --filter @ticketvibe/web exec playwright test`
Expected: PASS — seatmap.spec (6, textos de carrinho) + cart.spec (4, incl. expiração com backdate) + demais specs verdes.

- [ ] **Step 4: Build + migrações**

Run: `pnpm build && pnpm --filter @ticketvibe/api exec drizzle-kit check`
Expected: build do web sem erros; `drizzle-kit check` limpo (ticket 12 não tocou em schema — nenhum drift esperado).

- [ ] **Step 5: Fechar a issue 12**

Edit `.scratch/ticketvibe/issues/12-carrinho-de-evento-unico.md`:
- `Status: ready-for-agent` → `Status: done`
- Todos os checkboxes `[ ]` → `[x]`
- Acrescente a seção **Implementação** com a tabela de commits do ticket (os SHAs reais dos commits das Tasks 1–11) e os gates de verificação (lint/typecheck/testes/playwright/build/drizzle-kit).
- Acrescente a seção **Deferrals**:
  - Carrinho cross-event: decisão D4 — UI/contrato são sempre por evento; agregado multi-evento fica para a story de checkout (ticket 13).
  - Multiplicadores de tipo (inteira/meia/vip) são hardcoded ×1/×0,5/×2 — lotes/preço por organizador reabrem nos tickets 18/39 (D2).
  - Release automático de holds de outros eventos ao adicionar item novo: deliberadamente não implementado (D4) — TTL de 10 min limita o squatting e "desistir" é explícito.
  - Carrinho por hash Redis com TTL e default 'inteira' para campo ausente (D1); tipo de outra aba só sincroniza no mount (fetchTypes uma vez).

Commit:

```bash
git add .scratch/ticketvibe/issues/12-carrinho-de-evento-unico.md
git commit -m "docs(agents): close ticket 12 with implementation notes"
```

- [ ] **Step 6: Verificação final**

Run: `git log --oneline -12`
Expected: sequência de commits do ticket 12 (shared → repos → use cases → rotas → proxies → cart-panel → seat-map → e2e → docs) no topo do `main`, working tree limpa.

---

## Self-review do plano (feito antes da oferta de execução)

- **Cobertura dos critérios da spec 12:** carrinho 1 evento c/ TTL (D1/D5, Tasks 5–7, E2E expiração); quantidade+tipos com preços (D2/D3, Tasks 1/6, E2E meia/vip); UI c/ countdown+resumo (D7, Tasks 9–10); expiração limpa carrinho+assentos (reusa ticket 11, E2E Task 11); testes unit (totais/tipos: shared + use-cases + rotas), componente (cart-panel + seat-map specs), E2E (cart.spec). ✓
- **Decisões explícitas:** D1–D8 na seção de Decisões; deferrals da issue 12 espelhados na Task 12. ✓
- **Sem placeholders:** todo código das Tasks 1–11 está completo; únicos "adapt" explícitos são aos helpers reais já verificados no repo (buildTestApp do holds.routes.spec, fixture de labels livres da plateia, e o aviso para conferir labels no teste de limite). ✓
- **Consistência de tipos/símbolos:** `ticketTypeSchema`/`TicketType`/`ticketPriceCents`/`CART_MAX_ITEMS`/`cartItemSchema`/`cartSchema`/`cartItemRequestSchema`/`setCartItemResponseSchema` definidos na Task 1 e usados idênticos nas Tasks 5–11; `cartItemKey` (API) vs `cartSeatKey` (web) — mesma forma `setor:fila:cadeira`; `owns` no `HoldRepository` com implementações in-memory/Redis + lazy wiring; `SeatHoldRecord.priceFromCents` propagado ao Drizzle (join já existente), in-memory e seeds. ✓
- **Riscos conhecidos citados:** labels livres da fixture no teste de limite (Task 7 Step 5, com nota de ajuste); divergência artificial Redis×PG na expiração E2E (D8 + nota na Task 11 — sem re-clique pós-backdate); `selectOption` do Playwright (nota no Task 11 Step 3). ✓
- **Fora de escopo protegido:** nenhum toque em `playwright.config.ts`/`global-setup.ts`/schema PG; `pnpm infra:down` proibido; carrinho cross-event e preços por lote explicitamente deferidos.
