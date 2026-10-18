# Ticket 13 — Checkout Stripe (cartão/boleto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O comprador logado vê o resumo do pedido (preço, taxa de serviço, total), paga com cartão ou boleto no Stripe (sandbox) e, na confirmação do pagamento, o pedido e os assentos são fixados numa única transação — ou tudo volta ao estado anterior.

**Architecture:** Nova camada `payments` (interface `PaymentProvider` + `StripePaymentProvider` + `FakePaymentProvider`) e módulo `orders`. O webhook do Stripe é verificado por assinatura, deduplicado numa tabela `payment_events` e processado por um job BullMQ; o job chama use-cases que decidem a captura numa transação Postgres (`SELECT … FOR UPDATE` sobre `orders` + `seats`). O carrinho (ticket 12) é o snapshot de entrada do pedido; a taxa de serviço é uma constante em `packages/shared`.

**Tech Stack:** Fastify + Drizzle + Postgres, Redis + BullMQ, Zod em `packages/shared`, Next.js (App Router) + React no web, `stripe` (SDK) e `@stripe/react-stripe-js` no web.

**Spec:** `.scratch/ticketvibe/spec.md` (user stories 24–30, 43–44) + `.scratch/ticketvibe/issues/13-checkout-stripe-cartao-e-boleto.md`

## Global Constraints

- Idioma **pt-BR** em docs, UI e textos de teste; mensagens de erro da API no formato `{ error: '<code>' }` com códigos em inglês.
- Commits **Conventional Commits em inglês**, imperativos, escopo sugerido; sem ponto final (`docs/skills/COMMIT_GUIDELINE.md`).
- **Sem comentários de código** em nenhum arquivo criado/alterado.
- `packages/shared` é a **única fonte de verdade** do contrato web↔API — todo payload de rota é parseado por um schema zod antes de enviar.
- Módulos da API seguem hexagonal: `modules/<dominio>/{domain,infra,use-cases,jobs,routes}` com specs co-localizadas (`*.spec.ts` unitário, `*.integration.spec.ts` contra Postgres/Redis reais).
- Determinismo: use-cases recebem `now: () => Date = () => new Date()`; nada de `new Date()` solto na lógica testável.
- `playwright.config.ts` e `tests/e2e/global-setup.ts` **NUNCA** são tocados. `pnpm infra:down` é **proibido**; use `pnpm infra:up`.
- Testes afirmam **comportamento externo** (HTTP, linhas no banco, estado renderizado) — nunca detalhes internos.
- Stripe apenas em **modo sandbox**; Pix fora de escopo; regras/política de reembolso → ticket 21; split/Connect → ticket 22.
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @ticketvibe/web exec playwright test`, `pnpm build`, `pnpm --filter @ticketvibe/api exec drizzle-kit check`.

## Decisões (D1–D12)

- **D1 — Taxa de serviço:** `SERVICE_FEE_BPS = 1000` (10% do subtotal, arredondado) em `packages/shared`; cobrada do comprador e exibida como linha própria. Valor por evento/organizador fica para os tickets 18/22.
- **D2 — Schema de pedidos:** tabelas `orders`, `order_items`, `payment_events` (migração `0007`). `order_items` guarda um snapshot de `sector_slug`/`row_label`/`seat_label` + `row_id` (necessário para liberar holds no Redis). Campos de split/Connect (`platform_fee_cents`, `organizer_net_cents`) ficam para o ticket 22.
- **D3 — Status do pedido:** `pending → paid | failed | expired` (terminal após `paid`). Reentregas nunca rebaixam um pedido terminal.
- **D4 — Stripe:** `PaymentIntent` com `payment_method_types` (`card`, `boleto`); cartão e boleto confirmados no nosso site via Payment Element (`@stripe/react-stripe-js`). Provider atrás da interface `PaymentProvider`; `StripePaymentProvider` usa o SDK `stripe`, `FakePaymentProvider` é determinístico e offline.
- **D5 — Seleção do provider:** `process.env.PAYMENT_PROVIDER` (`'stripe'` exige `STRIPE_SECRET_KEY`; qualquer outro valor → `fake`). Retorna `{ provider, clientSecret }`; `provider` viaja no contrato para o web não montar Stripe.js em modo fake.
- **D6 — Idempotência:** tabela `payment_events` com `provider_event_id` como PK (`insert … on conflict do nothing`) + guarda de estado terminal dentro da transação. Um pedido `pending` por `(user_id, event_id)` (índice único parcial).
- **D7 — Webhook:** rota `POST /webhooks/stripe` (sem sessão) verifica assinatura com `stripe.webhooks.constructEvent`, grava o evento e **enfileira** um job BullMQ; responde `200 { received: true }` imediatamente. Assinatura inválida → `400 { error: 'invalid_signature' }`.
- **D8 — Processamento assíncrono:** a fila `payments` é consumida pelo processo worker (`src/worker.ts`) e, no ambiente local/E2E, também pelo processo da API (`src/index.ts`) — consumidores concorrentes na mesma fila são seguros (BullMQ entrega cada job a um consumidor; a PK de `payment_events` garante idempotência). Isso mantém o E2E offline sem tocar no `playwright.config.ts`.
- **D9 — Captura atômica:** `SeatCaptureGateway.confirmOrderPayment` roda uma `db.transaction`: `FOR UPDATE` no pedido → se terminal, retorna `already`; `FOR UPDATE` nos assentos → decisão pura `decideOrderCapture`; se algum assento não está mais reservado pelo usuário e não expirou → `seats_lost`; senão `seats → occupied` (hold zerado) e pedido `paid`.
- **D10 — Pagamento aprovado sem assento:** `seats_lost` (ex.: boleto pago após o TTL) → pedido `failed` + `provider.refund(providerRef)` + liberação. Divergência de valor (`amountCents !== totalCents`) → mesmo caminho. Política de reembolso ao comprador fica no ticket 21.
- **D11 — Login x reservas anônimas:** `onLinkAccount` passa a migrar também o Redis — o valor das chaves `hold:seat:*` do usuário anônimo é reescrito com `SET … KEEPTTL`, e o hash `cart:<id>:<slug>` é `RENAME`ado para o novo id (TTL preservado).
- **D12 — Renovação no checkout:** ao criar o pedido a API renova os holds (novo TTL de 10 min). O checkout mostra a contagem regressiva mas **não** faz auto-renew (auto-renew no checkout fica como deferral); estourar o TTL durante o pagamento é exatamente a corrida modelada.

## Estrutura de arquivos

**Criar (API):** `apps/api/src/modules/orders/{domain/{order-entity,order-repository,seat-capture-gateway,payment-event-repository}.ts, infra/{in-memory-order-repository,in-memory-payment-event-repository,drizzle-order-repository,drizzle-seat-capture-gateway,drizzle-payment-event-repository}.ts, use-cases/{create-order,confirm-order-payment,fail-order,expire-pending-orders}.use-case.ts, routes/order.routes.ts}`, `apps/api/src/modules/payments/{domain/payment-provider.ts, infra/{stripe-payment-provider,fake-payment-provider,bullmq-payment-event-queue}.ts, create-payment-provider.ts, jobs/process-payment-event.ts, routes/webhook.routes.ts}`, `apps/api/src/modules/auth/migrate-anonymous-data.ts`.

**Criar (web):** `apps/web/src/app/events/[slug]/checkout/page.tsx`, `apps/web/src/app/events/[slug]/checkout/retorno/page.tsx`, `apps/web/src/app/api/events/[slug]/orders/route.ts`, `apps/web/src/app/api/orders/[id]/route.ts`, `apps/web/src/components/{checkout-flow,checkout-summary,order-confirmation}.tsx`, `apps/web/tests/e2e/{checkout.spec.ts,helpers/auth.ts}` (+ specs co-localizados).

**Modificar:** `packages/shared/src/{index.ts,index.spec.ts}`; `apps/api/src/db/{schema.ts,test-helpers.ts}`, `apps/api/src/{app.ts,index.ts,worker.ts}`, `apps/api/src/modules/auth/auth.ts`, `apps/web/src/components/cart-panel.tsx` (+ spec), `apps/web/src/components/seat-map.tsx`.

## Review Focus

Failure modes que a spec implica mas nenhuma task cobre por padrão — cada um vira um teste na task dona do código:

1. **Reentrega/ordem invertida de eventos:** um `payment_intent.succeeded` reentregue depois de o pedido já estar `failed` (assento perdido + reembolsado) não pode ressuscitar/capturar; um `payment_failed` depois de `succeeded` não pode rebaixar um pedido pago. → testes em Task 6.
2. **Aprovado sem assento:** boleto pago após o TTL → reembolso emitido, pedido `failed`, assentos não capturados duas vezes. → Task 6.
3. **Criação idempotente:** duplo clique em "Pagar" gera **um** PaymentIntent e **um** pedido `pending`. → Task 5.
4. **Divergência de valor:** webhook com `amount_received` ≠ `total_cents` não confirma o pedido (falha + reembolso). → Task 6.
5. **Hold de outro usuário nunca é capturado:** pedido do usuário A não captura assento reservado por B. → Task 6.

---

### Task 1: Contratos shared — taxa de serviço e pedidos

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.spec.ts`

**Interfaces:**
- Consumes: `ticketTypeSchema`, `TicketType` (já existentes).
- Produces: `SERVICE_FEE_BPS`, `serviceFeeCents(subtotalCents)`, `orderTotals(items)`, `paymentMethodSchema`/`PaymentMethod`, `orderStatusSchema`/`OrderStatus`, `orderItemSchema`/`OrderItemDto`, `orderSchema`/`OrderDto`, `createOrderRequestSchema`/`CreateOrderRequest`, `orderPaymentProviderSchema`, `orderPaymentSchema`/`OrderPaymentDto`, `createOrderResponseSchema`/`CreateOrderResponse`, `orderResponseSchema`/`OrderResponse`.

- [ ] **Step 1: Escrever o teste que falha**

Em `packages/shared/src/index.spec.ts`, adicione antes do fim do arquivo:

```ts
describe('service fee', () => {
  it('charges 10% of the subtotal, rounded', () => {
    expect(SERVICE_FEE_BPS).toBe(1000);
    expect(serviceFeeCents(0)).toBe(0);
    expect(serviceFeeCents(12000)).toBe(1200);
    expect(serviceFeeCents(12345)).toBe(1235);
  });

  it('computes subtotal, fee and total', () => {
    expect(orderTotals([])).toEqual({
      subtotalCents: 0,
      serviceFeeCents: 0,
      totalCents: 0,
    });
    expect(orderTotals([{ priceCents: 12000 }, { priceCents: 6000 }])).toEqual({
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
    });
  });
});

describe('order contracts', () => {
  it('parses a full order', () => {
    const order = orderSchema.parse({
      id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
      eventSlug: 'o-fantasma-da-opera',
      status: 'pending',
      paymentMethod: 'boleto',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      items: [
        {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
          priceCents: 6000,
        },
      ],
      createdAt: new Date().toISOString(),
      paidAt: null,
    });
    expect(order.items[0].ticketType).toBe('meia');
  });

  it('rejects an unknown payment method and status', () => {
    expect(createOrderRequestSchema.safeParse({ paymentMethod: 'pix' }).success).toBe(false);
    expect(orderStatusSchema.safeParse('refunded').success).toBe(false);
  });

  it('parses the create-order response with the stripe payment block', () => {
    const response = createOrderResponseSchema.parse({
      order: {
        id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
        eventSlug: 'o-fantasma-da-opera',
        status: 'pending',
        paymentMethod: 'card',
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
        items: [],
        createdAt: new Date().toISOString(),
        paidAt: null,
      },
      payment: { provider: 'stripe', providerRef: 'pi_123', clientSecret: 'pi_123_secret' },
    });
    expect(response.payment.clientSecret).toBe('pi_123_secret');
    expect(
      orderPaymentSchema.safeParse({ provider: 'pagarme', providerRef: 'x', clientSecret: null }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL — `serviceFeeCents`/`orderTotals`/`orderSchema` não definidos.

- [ ] **Step 3: Implementar os contratos**

Em `packages/shared/src/index.ts`, anexe ao final do arquivo (ajuste os imports do topo se o linter exigir nada novo — tudo usa `z` já importado):

```ts
export const SERVICE_FEE_BPS = 1000;

export function serviceFeeCents(subtotalCents: number): number {
  return Math.round((subtotalCents * SERVICE_FEE_BPS) / 10_000);
}

export function orderTotals(items: { priceCents: number }[]): {
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
} {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  const fee = serviceFeeCents(subtotalCents);
  return { subtotalCents, serviceFeeCents: fee, totalCents: subtotalCents + fee };
}

export const paymentMethodSchema = z.enum(['card', 'boleto']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const orderStatusSchema = z.enum(['pending', 'paid', 'failed', 'expired']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderItemSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  ticketType: ticketTypeSchema,
  priceCents: z.number().int().min(0),
});

export type OrderItemDto = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.uuid(),
  eventSlug: z.string().min(1),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  subtotalCents: z.number().int().min(0),
  serviceFeeCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  items: z.array(orderItemSchema),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
});

export type OrderDto = z.infer<typeof orderSchema>;

export const createOrderRequestSchema = z.object({ paymentMethod: paymentMethodSchema });
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const orderPaymentProviderSchema = z.enum(['stripe', 'fake']);

export const orderPaymentSchema = z.object({
  provider: orderPaymentProviderSchema,
  providerRef: z.string().min(1),
  clientSecret: z.string().nullable(),
});

export type OrderPaymentDto = z.infer<typeof orderPaymentSchema>;

export const createOrderResponseSchema = z.object({
  order: orderSchema,
  payment: orderPaymentSchema,
});

export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

export const orderResponseSchema = z.object({ order: orderSchema });

export type OrderResponse = z.infer<typeof orderResponseSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: PASS (68 + 6 novos).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.spec.ts
git commit -m "feat(shared): add order contracts and service fee"
```

---

### Task 2: Tabelas de pedidos e eventos de pagamento

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/test-helpers.ts`
- Create: `apps/api/drizzle/0007_*.sql` (gerado)
- Test: `apps/api/src/db/test-helpers.spec.ts` (se aplicável)

**Interfaces:**
- Consumes: `seats`, `events`, better-auth `user` (já em `schema.ts`).
- Produces: tabelas `orders`, `orderItems`, `paymentEvents` exportadas de `schema.ts`.

- [ ] **Step 1: Escrever as tabelas**

Em `apps/api/src/db/schema.ts`, adicione após a definição de `seats`. **Ajuste os imports do topo** — hoje o arquivo importa de `drizzle-orm/pg-core` apenas `boolean, customType, index, integer, pgTable, text, timestamp, unique, uuid`: acrescente `uniqueIndex` a esse import e adicione uma linha nova `import { sql } from 'drizzle-orm';` (o índice parcial do `orders` usa `sql`). As tabelas `user`, `events` e `seatRows` já são exportadas neste arquivo (linhas 144, 39 e 103).

```ts
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id),
  status: text('status')
    .$type<'pending' | 'paid' | 'failed' | 'expired'>()
    .notNull()
    .default('pending'),
  paymentMethod: text('payment_method').$type<'card' | 'boleto'>().notNull(),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  subtotalCents: integer('subtotal_cents').notNull(),
  serviceFeeCents: integer('service_fee_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  uniqueIndex('orders_provider_ref_unique').on(table.providerRef),
  uniqueIndex('orders_pending_user_event_unique')
    .on(table.userId, table.eventId)
    .where(sql`status = 'pending'`),
  index('orders_user_id_idx').on(table.userId),
]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  seatId: uuid('seat_id')
    .notNull()
    .references(() => seats.id),
  rowId: uuid('row_id')
    .notNull()
    .references(() => seatRows.id),
  sectorSlug: text('sector_slug').notNull(),
  rowLabel: text('row_label').notNull(),
  seatLabel: text('seat_label').notNull(),
  ticketType: text('ticket_type').$type<'inteira' | 'meia' | 'vip'>().notNull(),
  priceCents: integer('price_cents').notNull(),
}, (table) => [
  uniqueIndex('order_items_order_seat_unique').on(table.orderId, table.seatId),
]);

export const paymentEvents = pgTable('payment_events', {
  providerEventId: text('provider_event_id').primaryKey(),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
```

(`ticketType` pode ser `$type<TicketType>()` importando `type TicketType` de `@ticketvibe/shared`, ou o literal inline — mantenha o padrão do arquivo, que usa literais inline.)

- [ ] **Step 2: Gerar a migração**

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: cria `apps/api/drizzle/0007_<nome>.sql` com `CREATE TABLE "orders" …`, `"order_items" …`, `"payment_events" …` e os três índices únicos/normais. Abra o arquivo e confirme o índice parcial (`WHERE status = 'pending'`).

- [ ] **Step 3: Estender o reset de teste**

Em `apps/api/src/db/test-helpers.ts`, no `TRUNCATE` de `resetDatabase`, inclua as novas tabelas antes de `seats` (FKs resolvem por `CASCADE`):

```
TRUNCATE TABLE "user", session, account, verification, event_artists, order_items, orders, payment_events, seat_rows, seats, sectors, events, artists, venues, categories RESTART IDENTITY CASCADE
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/api exec vitest run src/modules/seatmaps/routes/cart.routes.integration.spec.ts`
Expected: PASS — a migração `0007` aplica no banco de teste e `resetDatabase` continua funcionando.

Run: `pnpm --filter @ticketvibe/api exec drizzle-kit check`
Expected: `Everything's fine`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/test-helpers.ts apps/api/drizzle
git commit -m "feat(api): add order and payment event tables"
```

---

### Task 3: Domínio de pedidos, repositórios e gateway de captura

**Files:**
- Create: `apps/api/src/modules/orders/domain/order-entity.ts`
- Create: `apps/api/src/modules/orders/domain/order-repository.ts`
- Create: `apps/api/src/modules/orders/domain/seat-capture-gateway.ts`
- Create: `apps/api/src/modules/orders/domain/payment-event-repository.ts`
- Create: `apps/api/src/modules/orders/infra/in-memory-order-repository.ts`
- Create: `apps/api/src/modules/orders/infra/in-memory-payment-event-repository.ts`
- Create: `apps/api/src/modules/orders/infra/drizzle-order-repository.ts`
- Create: `apps/api/src/modules/orders/infra/drizzle-seat-capture-gateway.ts`
- Create: `apps/api/src/modules/orders/infra/drizzle-payment-event-repository.ts`
- Test: `apps/api/src/modules/orders/domain/order-entity.spec.ts`
- Test: `apps/api/src/modules/orders/infra/in-memory-order-repository.spec.ts`
- Test: `apps/api/src/modules/orders/infra/drizzle-order-repository.integration.spec.ts`

**Interfaces:**
- Consumes: `OrderStatus`, `PaymentMethod`, `TicketType` (`@ticketvibe/shared`); `Db`; `holdSeatKey` de `../seatmaps/domain/hold-entity.js`.
- Produces:
  - `OrderRecord`, `OrderItemRecord`, `CapturableSeat`, `CaptureDecision`, `decideOrderCapture`.
  - `OrderRepository` (`create`, `findById`, `findPendingByUserEvent`, `findByProviderRef`, `setProviderRef`, `markFailed`, `markExpired`, `listStalePending`).
  - `SeatCaptureGateway` (`confirmOrderPayment`, `releaseOrderSeats`).
  - `PaymentEventRepository` (`record`).

- [ ] **Step 1: Escrever o teste da decisão pura (red)**

`order-entity.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { decideOrderCapture } from './order-entity.js';

const now = new Date('2026-10-18T12:00:00.000Z');
const reserved = (holdUserId: string, expiresAt: string) => ({
  seatId: 's1',
  status: 'reserved',
  holdUserId,
  holdExpiresAt: new Date(expiresAt),
});

describe('decideOrderCapture', () => {
  it('confirms when every seat is still held by the buyer', () => {
    expect(decideOrderCapture({ userId: 'u1' }, [reserved('u1', '2026-10-18T12:05:00.000Z')], now)).toBe('confirm');
  });

  it('loses when a seat expired', () => {
    expect(decideOrderCapture({ userId: 'u1' }, [reserved('u1', '2026-10-18T11:59:00.000Z')], now)).toBe('lost');
  });

  it('loses when a seat belongs to another buyer', () => {
    expect(decideOrderCapture({ userId: 'u1' }, [reserved('u2', '2026-10-18T12:05:00.000Z')], now)).toBe('lost');
  });

  it('loses when a seat is no longer reserved', () => {
    expect(
      decideOrderCapture({ userId: 'u1' }, [{ seatId: 's1', status: 'occupied', holdUserId: null, holdExpiresAt: null }], now),
    ).toBe('lost');
    expect(
      decideOrderCapture({ userId: 'u1' }, [{ seatId: 's1', status: 'available', holdUserId: null, holdExpiresAt: null }], now),
    ).toBe('lost');
  });

  it('loses when the order has no seats', () => {
    expect(decideOrderCapture({ userId: 'u1' }, [], now)).toBe('lost');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/domain/order-entity.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar domain**

`order-entity.ts`:

```ts
import type { OrderStatus, PaymentMethod, TicketType } from '@ticketvibe/shared';

export interface OrderItemRecord {
  seatId: string;
  rowId: string;
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
  ticketType: TicketType;
  priceCents: number;
}

export interface OrderRecord {
  id: string;
  userId: string;
  eventId: string;
  eventSlug: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  provider: string;
  providerRef: string | null;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  createdAt: Date;
  paidAt: Date | null;
  items: OrderItemRecord[];
}

export interface CapturableSeat {
  seatId: string;
  status: string;
  holdUserId: string | null;
  holdExpiresAt: Date | null;
}

export type CaptureDecision = 'confirm' | 'lost';

export function decideOrderCapture(
  order: { userId: string },
  seats: CapturableSeat[],
  now: Date,
): CaptureDecision {
  if (seats.length === 0) return 'lost';
  const allHeld = seats.every(
    (seat) =>
      seat.status === 'reserved' &&
      seat.holdUserId === order.userId &&
      seat.holdExpiresAt !== null &&
      seat.holdExpiresAt.getTime() > now.getTime(),
  );
  return allHeld ? 'confirm' : 'lost';
}
```

`order-repository.ts`:

```ts
import type { OrderStatus, PaymentMethod } from '@ticketvibe/shared';

import type { OrderItemRecord, OrderRecord } from './order-entity.js';

export interface CreateOrderInput {
  userId: string;
  eventId: string;
  paymentMethod: PaymentMethod;
  provider: string;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  items: Omit<OrderItemRecord, never>[];
}

export interface StaleOrderRef {
  orderId: string;
  userId: string;
  eventId: string;
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  findPendingByUserEvent(input: { userId: string; eventId: string }): Promise<OrderRecord | null>;
  findByProviderRef(providerRef: string): Promise<OrderRecord | null>;
  setProviderRef(input: { orderId: string; providerRef: string }): Promise<void>;
  markFailed(input: { orderId: string; now: Date }): Promise<void>;
  markExpired(input: { orderId: string; now: Date }): Promise<void>;
  listStalePending(input: { now: Date; olderThan: Date }): Promise<StaleOrderRef[]>;
}
```

`seat-capture-gateway.ts`:

```ts
import type { OrderStatus } from '@ticketvibe/shared';

export type ConfirmPaidResult =
  | { kind: 'paid' }
  | { kind: 'already'; status: OrderStatus }
  | { kind: 'seats_lost' }
  | { kind: 'order_not_found' };

export interface SeatCaptureGateway {
  confirmOrderPayment(input: { providerRef: string; now: Date }): Promise<ConfirmPaidResult>;
  releaseOrderSeats(input: { orderId: string; now: Date }): Promise<{ seatKeys: string[] }>;
}
```

`payment-event-repository.ts`:

```ts
export interface PaymentEventInput {
  providerEventId: string;
  provider: string;
  type: string;
}

export interface PaymentEventRepository {
  record(input: PaymentEventInput): Promise<boolean>;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/domain/order-entity.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: In-memory repos (red → green)**

`in-memory-order-repository.spec.ts` — comportamento: `create` devolve `OrderRecord` com `status: 'pending'` e items ecoados; `findById`; `findPendingByUserEvent` só acha `pending` do mesmo usuário/evento; `findByProviderRef` acha após `setProviderRef`; `markFailed`/`markExpired` mudam o status (e não rebaixam `paid`); `listStalePending({now, olderThan})` só devolve `pending` com `createdAt < olderThan`; `eventSlug` precisa ser derivado — o in-memory recebe um `Map<eventId, string>` de slugs no construtor: `new InMemoryOrderRepository({ eventSlugs: new Map([['ev1', 'o-fantasma-da-opera']]) })` e `create` recebe `eventId`; o `OrderRecord` retornado usa o slug do mapa (fallback `''`).

Implemente `InMemoryOrderRepository` com um `Map<string, OrderRecord>` e `randomUUID()` do `node:crypto` para o id.

- [ ] **Step 6: Drizzle repos + gateway (red → green, integração)**

`drizzle-order-repository.ts` implementa `OrderRepository` sobre `Db` (insert/select/update; `listStalePending` filtra `status='pending' AND created_at < olderThan`; `findById`/`findByProviderRef`/`findPendingByUserEvent` fazem join com `events` para `eventSlug` e carregam `order_items`).

`drizzle-seat-capture-gateway.ts` é o coração transacional. Implemente exatamente:

```ts
async confirmOrderPayment({ providerRef, now }): Promise<ConfirmPaidResult> {
  return this.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.providerRef, providerRef)).for('update');
    if (!order) return { kind: 'order_not_found' };
    if (order.status !== 'pending') return { kind: 'already', status: order.status };

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const seatIds = items.map((item) => item.seatId);
    const locked = seatIds.length
      ? await tx.select().from(seats).where(inArray(seats.id, seatIds)).for('update')
      : [];

    if (decideOrderCapture({ userId: order.userId }, locked, now) === 'lost') {
      await tx.update(orders).set({ status: 'failed' }).where(eq(orders.id, order.id));
      return { kind: 'seats_lost' };
    }

    await tx.update(seats).set({ status: 'occupied', holdUserId: null, holdExpiresAt: null }).where(inArray(seats.id, seatIds));
    await tx.update(orders).set({ status: 'paid', paidAt: now }).where(eq(orders.id, order.id));
    return { kind: 'paid' };
  });
}
```

`releaseOrderSeats({ orderId, now })`: numa transação, lê o pedido (se `paid`, devolve `{ seatKeys: [] }`), lê `order_items`, e para cada assento que ainda está `reserved` com `hold_user_id = order.user_id` faz `status='available', hold_user_id=null, hold_expires_at=null`; devolve `{ seatKeys }` usando `holdSeatKey(order.eventId, item.rowId, item.seatId)`.

`drizzle-payment-event-repository.ts`: `record` = `insert into payment_events … on conflict (provider_event_id) do nothing`, retorna `rowCount > 0`.

`drizzle-order-repository.integration.spec.ts` (usa `ensureTestDatabase`, `migrateTestDatabase`, `resetDatabase`, `seedFixtures` como `cart.routes.integration.spec.ts`) — casos: cria e relê o pedido; `confirmOrderPayment` em pedido válido → `paid`, assentos `occupied` com hold zerado, `paid_at` preenchido; segunda chamada → `already`; pedido com assento expirado/estranho → `seats_lost` + pedido `failed` + assentos intactos; `releaseOrderSeats` libera assentos reservados e devolve as `seatKeys` esperadas; pedido pago → `releaseOrderSeats` não mexe.

- [ ] **Step 7: Rodar tudo e commitar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/api/src/modules/orders
git commit -m "feat(api): add order repository and seat capture gateway"
```

---

### Task 4: Interface de pagamento + provider Stripe e fake

**Files:**
- Create: `apps/api/src/modules/payments/domain/payment-provider.ts`
- Create: `apps/api/src/modules/payments/infra/fake-payment-provider.ts`
- Create: `apps/api/src/modules/payments/infra/stripe-payment-provider.ts`
- Create: `apps/api/src/modules/payments/create-payment-provider.ts`
- Test: `apps/api/src/modules/payments/infra/fake-payment-provider.spec.ts`
- Test: `apps/api/src/modules/payments/infra/stripe-payment-provider.spec.ts`
- Test: `apps/api/src/modules/payments/create-payment-provider.spec.ts`
- Modify: `apps/api/package.json` (dep `stripe`)

**Interfaces:**
- Consumes: `PaymentMethod` (`@ticketvibe/shared`).
- Produces: `PaymentProvider`, `CreatePaymentInput`, `CreatePaymentResult`, `PaymentEvent`, `PaymentEventType`; `StripePaymentProvider`, `FakePaymentProvider`, `createPaymentProvider(env)`.

- [ ] **Step 1: Instalar o SDK**

Run: `pnpm --filter @ticketvibe/api add stripe`
Expected: `stripe` em `dependencies` + lock atualizado.

- [ ] **Step 2: Escrever o teste do fake provider (red)**

`fake-payment-provider.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FakePaymentProvider } from './fake-payment-provider.js';
import { signStripeWebhook } from './stripe-signature.js';

const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

describe('FakePaymentProvider', () => {
  it('creates a deterministic fake payment reference', async () => {
    const provider = new FakePaymentProvider();
    const result = await provider.createPayment({
      orderId: 'order-1',
      amountCents: 13200,
      method: 'card',
      description: 'Pedido order-1',
      buyerEmail: 'buyer@example.com',
    });
    expect(result.providerRef).toMatch(/^pi_fake_/);
    expect(result.clientSecret).toBeNull();
  });

  it('accepts a stripe-signed webhook and maps succeeded', async () => {
    const provider = new FakePaymentProvider();
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_fake_1', amount_received: 13200 } },
    });
    const header = signStripeWebhook(payload, secret);
    const event = await provider.parseWebhook({ rawBody: payload, signature: header });
    expect(event).toEqual({
      providerEventId: 'evt_1',
      type: 'succeeded',
      providerRef: 'pi_fake_1',
      amountCents: 13200,
    });
  });

  it('rejects a tampered payload and ignores unknown types', async () => {
    const provider = new FakePaymentProvider();
    const header = signStripeWebhook('{"id":"evt_1"}', secret);
    expect(await provider.parseWebhook({ rawBody: '{"id":"evt_2"}', signature: header })).toBeNull();

    const unknown = JSON.stringify({ id: 'evt_3', type: 'charge.refunded', data: { object: { id: 'ch_1' } } });
    const event = await provider.parseWebhook({ rawBody: unknown, signature: signStripeWebhook(unknown, secret) });
    expect(event?.type).toBe('ignored');
  });

  it('records refunds in memory', async () => {
    const provider = new FakePaymentProvider();
    await provider.refund('pi_fake_1');
    expect(provider.refundedRefs).toEqual(['pi_fake_1']);
  });
});
```

O helper `stripe-signature.ts` (em `apps/api/src/modules/payments/infra/`) exporta **as duas** funções abaixo — `signStripeWebhook` é usada pelos testes e pelo E2E (que reimplementa o mesmo algoritmo em `apps/web/tests/e2e/helpers/stripe.ts`), e `verifyStripeSignature` é usada pelo `FakePaymentProvider`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

export function signStripeWebhook(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyStripeSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
  now?: Date;
}): boolean {
  if (!input.signature) return false;
  const parts = new Map(
    input.signature.split(',').map((part) => part.split('=') as [string, string]),
  );
  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1');
  if (!Number.isFinite(timestamp) || !provided) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', input.secret).update(`${timestamp}.${input.rawBody}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/payments`
Expected: FAIL — módulos não existem.

- [ ] **Step 4: Implementar domain + fake**

`payment-provider.ts`:

```ts
import type { PaymentMethod } from '@ticketvibe/shared';

export interface CreatePaymentInput {
  orderId: string;
  amountCents: number;
  method: PaymentMethod;
  description: string;
  buyerEmail: string | null;
}

export interface CreatePaymentResult {
  providerRef: string;
  clientSecret: string | null;
}

export type PaymentEventType = 'succeeded' | 'failed' | 'expired' | 'ignored';

export interface PaymentEvent {
  providerEventId: string;
  type: PaymentEventType;
  providerRef: string;
  amountCents: number | null;
}

export interface PaymentProvider {
  readonly providerName: 'stripe' | 'fake';
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  parseWebhook(input: { rawBody: string; signature: string | null }): Promise<PaymentEvent | null>;
  refund(providerRef: string): Promise<void>;
}
```

Ambos os providers expõem `readonly providerName` (`'stripe'`/`'fake'`); o teste do fake deve assertar `expect(provider.providerName).toBe('fake')`. O helper de assinatura fica em `apps/api/src/modules/payments/infra/stripe-signature.ts` e é importado no spec como `import { signStripeWebhook } from './stripe-signature.js';`.

`fake-payment-provider.ts`: `createPayment` → `{ providerRef: 'pi_fake_' + randomUUID(), clientSecret: null }`; `parseWebhook` valida a assinatura com o mesmo esquema do Stripe (`verifyStripeSignature(rawBody, signature, secret)` em `stripe-signature.ts`, usando `createHmac` + `timingSafeEqual`, tolerância de 300s) e mapeia: `payment_intent.succeeded → succeeded` (com `data.object.amount_received`), `payment_intent.payment_failed → failed`, `payment_intent.canceled → expired`, qualquer outro → `ignored` (usa `data.object.id` como `providerRef`; se ausente → `null`); assinatura inválida/ausente → `null`. Guarda `refundedRefs: string[]` e o `secret` no construtor (`new FakePaymentProvider(secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test')`).

- [ ] **Step 5: Implementar o Stripe provider (green parcial)**

`stripe-payment-provider.ts` — `StripePaymentProvider` recebe `{ secretKey, webhookSecret }` no ctor e cria `new Stripe(secretKey)` internamente:
- `createPayment`: `stripe.paymentIntents.create({ amount: input.amountCents, currency: 'brl', payment_method_types: [input.method === 'card' ? 'card' : 'boleto'], description: input.description, metadata: { orderId: input.orderId }, receipt_email: input.buyerEmail ?? undefined })` → `{ providerRef: intent.id, clientSecret: intent.client_secret }`.
- `parseWebhook`: `if (!signature) return null;` `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` em try/catch → `null` em erro; mapeia os tipos como o fake.
- `refund`: `stripe.refunds.create({ payment_intent: providerRef })`.

`stripe-payment-provider.spec.ts` (não bate na rede): constrói com `{ secretKey: 'sk_test_x', webhookSecret: 'whsec_test' }` e testa apenas `parseWebhook` (payload assinado por `signStripeWebhook` → evento mapeado; assinatura errada → `null`; `signature: null` → `null`; `charge.refunded` → `ignored`).

- [ ] **Step 6: Factory + env**

`create-payment-provider.ts`:

```ts
export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'stripe') {
    const secretKey = env.STRIPE_SECRET_KEY;
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey || !webhookSecret) throw new Error('stripe_provider_misconfigured');
    return new StripePaymentProvider({ secretKey, webhookSecret });
  }
  return new FakePaymentProvider(env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test');
}
```

`create-payment-provider.spec.ts`: sem env → instância fake; `PAYMENT_PROVIDER='stripe'` sem chaves → lança `stripe_provider_misconfigured`; com ambas as chaves → instância Stripe (verifique via `instanceof`).

- [ ] **Step 7: Rodar e commitar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/payments && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/api/src/modules/payments apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add payment provider with stripe implementation"
```

---

### Task 5: CreateOrderUseCase (resumo, taxa e PaymentIntent)

**Files:**
- Create: `apps/api/src/modules/orders/use-cases/create-order.use-case.ts`
- Test: `apps/api/src/modules/orders/use-cases/create-order.use-case.spec.ts`

**Interfaces:**
- Consumes: `SeatmapRepository` (`findSeatmap`, `findHoldsByUser`, `findSeatByCoords`, `expireHolds`, `renewSeatHold`), `HoldRepository` (`renew`), `holdSeatKey`, `CartRepository` (`getTypes`), `OrderRepository`, `PaymentProvider`, `SEAT_HOLD_TTL_SECONDS`, `ticketPriceCents`, `orderTotals`.
- Produces: `CreateOrderUseCase` com `execute({ userId, eventSlug, paymentMethod, buyerEmail })` → `CreateOrderResult`.

- [ ] **Step 1: Escrever o teste (red)**

`create-order.use-case.spec.ts` — fakes inline (como `hold-seat.use-case.spec.ts`), `now` fixo `() => new Date('2026-10-18T12:00:00.000Z')`. Casos:

```ts
it('sums items, adds the 10% fee and creates a pending order', ...)
// holds: plateia/A/6 priceFromCents 12000, plateia/A/7 12000; getTypes -> 6:'meia'(6000), 7:'inteira'(12000)
// execute({userId:'u1', eventSlug:'o-fantasma-da-opera', paymentMethod:'card', buyerEmail:'b@x.com'})
// expect result.kind === 'created'
// expect result.order.subtotalCents 18000, serviceFeeCents 1800, totalCents 19800, status 'pending', paymentMethod 'card'
// expect paymentProvider.createPayment chamado com { amountCents: 19800, method:'card' } e order.providerRef preenchido

it('reuses the existing pending order instead of creating another', ...)
// orderRepository.findPendingByUserEvent devolve um pedido pendente existente
// expect result.kind === 'created'; expect order.id === existente.id; expect createPayment NÃO chamado; providerRef preservado

it('renews the holds when the order is created', ...)
// expect holdRepository.renew(holdSeatKey(eventId,rowId,seatId), 'u1', SEAT_HOLD_TTL_SECONDS)
//   E seatmapRepository.renewSeatHold({ seatId, userId: 'u1', expiresAt: now+TTL }) para cada assento

it('returns empty_cart when the user holds no seat', ...)
it('returns event_not_found when the event does not exist', ...)
it('marks the order failed and returns payment_failed when the provider throws', ...)
```

Use fakes: `seatmapRepository` com `findSeatmap` devolvendo `{ eventSlug, sectors: [...] }`, `findHoldsByUser` devolvendo `SeatHoldRecord[]` (`{ sectorSlug, rowLabel, seatLabel, priceFromCents, expiresAt }`) e `findSeatByCoords` devolvendo `{ found: true, seat: { seatId: 'seat-6', rowId: 'row-A', eventId: 'ev1', sectorSlug: 'plateia', sectorName: 'Plateia', rowLabel: 'A', seatLabel: '6', priceFromCents: 12000, ... } }` por cadeira; `holdRepository` fake que registra `renew`; `orderRepository` fake que registra `create`; `paymentProvider` fake que registra `createPayment`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/use-cases/create-order.use-case.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`CreateOrderUseCase` — ctor `(seatmapRepository: SeatmapRepository, holdRepository: HoldRepository, cartRepository: CartRepository, orderRepository: OrderRepository, paymentProvider: PaymentProvider, now: () => Date = () => new Date())`. Algoritmo:
1. `await seatmapRepository.expireHolds()`.
2. `seatmapRepository.findSeatmap(eventSlug)` → `null` ⇒ `event_not_found`.
3. `findHoldsByUser({ eventSlug, userId })`; vazio ⇒ `empty_cart`.
4. `cartRepository.getTypes({ userId, eventSlug })` → default `'inteira'`; para cada hold, `findSeatByCoords({ eventSlug, sectorSlug: hold.sectorSlug, rowLabel: hold.rowLabel, seatLabel: hold.seatLabel })` (descarte holds cujo lookup não é `found`) e `priceCents = ticketPriceCents(type, hold.priceFromCents)`; monte `items: OrderItemRecord[]` (`seatId: seat.seatId`, `rowId: seat.rowId`, `sectorSlug`, `rowLabel`, `seatLabel`, `ticketType`, `priceCents`).
5. `orderTotals(items)` → subtotal/fee/total.
6. `findPendingByUserEvent({ userId, eventId })` — o `eventId` vem de `seat.eventId` do primeiro `findSeatByCoords` (o `SeatmapEntity` **não** carrega `eventId`; não o altere). Se existir pendente com `providerRef` ⇒ devolva-o com `payment = { provider: order.provider, providerRef, clientSecret: null }` (não crie outro PI).
7. Senão: `orderRepository.create({...})` com `provider: paymentProvider.providerName` (definido na Task 4).
8. Renove os holds (Redis **e** espelho no Postgres, para não divergir o TTL): para cada item, `holdRepository.renew(holdSeatKey(eventId, rowId, seatId), userId, SEAT_HOLD_TTL_SECONDS)` e `seatmapRepository.renewSeatHold({ seatId, userId, expiresAt: new Date(now().getTime() + SEAT_HOLD_TTL_SECONDS * 1000) })`.
9. `paymentProvider.createPayment({ orderId, amountCents: totalCents, method, description: 'Pedido <id>', buyerEmail })`; em `throw` ⇒ `orderRepository.markFailed` e `{ kind: 'payment_failed' }`.
10. `orderRepository.setProviderRef({ orderId, providerRef })` e devolva `{ kind: 'created', order: {...order, providerRef}, payment: { provider: paymentProvider.providerName, providerRef, clientSecret } }`.

`CreateOrderResult = { kind: 'created'; order: OrderRecord; payment: { provider: string; providerRef: string; clientSecret: string | null } } | { kind: 'event_not_found' } | { kind: 'empty_cart' } | { kind: 'payment_failed' }`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/use-cases/create-order.use-case.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/use-cases/create-order.use-case.ts apps/api/src/modules/orders/use-cases/create-order.use-case.spec.ts
git commit -m "feat(api): create orders from the cart with payment intents"
```

---

### Task 6: Confirmação, falha e expiração do pedido + job do worker

**Files:**
- Create: `apps/api/src/modules/orders/use-cases/confirm-order-payment.use-case.ts`
- Create: `apps/api/src/modules/orders/use-cases/fail-order.use-case.ts`
- Create: `apps/api/src/modules/orders/use-cases/expire-pending-orders.use-case.ts`
- Create: `apps/api/src/modules/payments/jobs/process-payment-event.ts`
- Modify: `apps/api/src/worker.ts` (registra a fila/worker de pagamentos)
- Test: `apps/api/src/modules/orders/use-cases/confirm-order-payment.use-case.spec.ts`
- Test: `apps/api/src/modules/orders/use-cases/fail-order.use-case.spec.ts`
- Test: `apps/api/src/modules/orders/use-cases/expire-pending-orders.use-case.spec.ts`
- Test: `apps/api/src/modules/payments/jobs/process-payment-event.spec.ts`
- Test: `apps/api/src/modules/orders/use-cases/confirm-order-payment.integration.spec.ts`

**Interfaces:**
- Consumes: `OrderRepository`, `SeatCaptureGateway`, `PaymentProvider`, `HoldRepository` (`release`), `CartRepository` (`clear` — veja abaixo), `holdSeatKey`.
- Produces: `ConfirmOrderPaymentUseCase`, `FailOrderUseCase`, `ExpirePendingOrdersUseCase`, `PAYMENTS_QUEUE_NAME`, `PROCESS_PAYMENT_EVENT_JOB`, `createProcessPaymentEventJob(deps)`.

- [ ] **Step 1: Adicionar `clear` ao CartRepository**

`RedisCartRepository`/`InMemoryCartRepository` ganham `clear(input: { userId: string; eventSlug: string }): Promise<void>` (`del cart:<userId>:<eventSlug>` / `map.delete`). Atualize `lazyCartRepository` em `app.ts` para delegar `clear`. Teste curto em `in-memory-cart-repository.spec.ts` + `redis-cart-repository.spec.ts`. Commit junto ao fim da task.

- [ ] **Step 2: Testes dos use-cases (red)**

`confirm-order-payment.use-case.spec.ts` — fakes inline. Casos (Review Focus 1, 2, 4, 5):

```ts
it('confirms a paid order and releases nothing', ...)
// gateway.confirmOrderPayment -> { kind:'paid' }; expect kind 'paid'; refund NÃO chamado; releaseOrderSeats NÃO chamado

it('ignores an unknown payment reference', ...)
// orderRepository.findByProviderRef -> null; expect { kind: 'ignored' }

it('does not downgrade an already paid order', ...)
// order.status === 'paid'; expect { kind: 'already' }; refund/release NÃO chamados

it('refunds and releases when the seats were lost', ...)
// gateway.confirmOrderPayment -> { kind:'seats_lost' }; expect paymentProvider.refund chamado com providerRef; releaseOrderSeats chamado; kind 'refunded'

it('refunds on an amount mismatch without capturing', ...)
// order.totalCents 13200, input.amountCents 100; expect refund + markFailed + release; gateway.confirmOrderPayment NÃO chamado

it('never captures a hold owned by another user', ...)
// integração (Step 5) cobre; no unit, gateway devolve seats_lost e o fluxo reembolsa
```

`fail-order.use-case.spec.ts`: `failed` e `expired` em pedido `pending` ⇒ `markFailed`/`markExpired` + `releaseOrderSeats` + `holdRepository.release` para cada `seatKey` + `cartRepository.clear({ userId, eventSlug })`; pedido terminal ⇒ no-op (`{ kind: 'ignored' }`); pedido inexistente ⇒ `{ kind: 'ignored' }`.

`expire-pending-orders.use-case.spec.ts`: `listStalePending({ now, olderThan: now - SEAT_HOLD_TTL_SECONDS*1000 })` devolve 2 ⇒ ambos `markExpired` + release + clear; devolve `{ expired: 2 }`.

`process-payment-event.spec.ts`: dado `{ type: 'succeeded', providerRef, amountCents }` ⇒ chama `confirmOrderPayment.execute`; `failed`/`expired` ⇒ `failOrder.execute` com o kind certo; `ignored` ⇒ nenhum use-case chamado.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/use-cases src/modules/payments/jobs`
Expected: FAIL.

- [ ] **Step 4: Implementar os use-cases e o job**

`ConfirmOrderPaymentUseCase` — ctor `(orderRepository, seatCaptureGateway, paymentProvider, holdRepository, cartRepository)`. Algoritmo:
1. `order = findByProviderRef(providerRef)`; `null` ⇒ `{ kind: 'ignored' }`.
2. `order.status !== 'pending'` ⇒ `{ kind: 'already', status }`.
3. `amountCents !== null && amountCents !== order.totalCents` ⇒ `markFailed` + `provider.refund(providerRef)` + `releaseOrderSeats` + release holds + `cartRepository.clear` ⇒ `{ kind: 'amount_mismatch' }`.
4. `seatCaptureGateway.confirmOrderPayment({ providerRef, now })`:
   - `paid` ⇒ `{ kind: 'paid' }`;
   - `already` ⇒ `{ kind: 'already', status }`;
   - `order_not_found` ⇒ `{ kind: 'ignored' }`;
   - `seats_lost` ⇒ `provider.refund(providerRef)` + `releaseOrderSeats` + release holds + clear ⇒ `{ kind: 'refunded' }`.

O `now` vem do ctor (`now: () => Date = () => new Date()`). A liberação de holds usa `holdRepository.release(seatKey, order.userId)` para cada `seatKey` devolvida por `releaseOrderSeats`.

`FailOrderUseCase` — ctor `(orderRepository, seatCaptureGateway, holdRepository, cartRepository, now)`; `execute({ providerRef, terminal: 'failed' | 'expired' })`: acha o pedido por `providerRef`; ausente ou não-`pending` ⇒ `{ kind: 'ignored' }`; senão `markFailed`/`markExpired` + `releaseOrderSeats` + release holds + `cartRepository.clear({ userId, eventSlug })` ⇒ `{ kind: 'terminal', status }`.

`ExpirePendingOrdersUseCase` — ctor `(orderRepository, seatCaptureGateway, holdRepository, cartRepository, now)`; `execute()`: `listStalePending({ now: now(), olderThan: new Date(now() - SEAT_HOLD_TTL_SECONDS*1000) })`; para cada um: `markExpired` + `releaseOrderSeats` + release holds + `clear` ⇒ `{ expired: n }`.

`process-payment-event.ts`:

```ts
export const PAYMENTS_QUEUE_NAME = 'payments';
export const PROCESS_PAYMENT_EVENT_JOB = 'process-payment-event';
export const EXPIRE_ORDERS_JOB_ID = 'expire-pending-orders';
export const EXPIRE_ORDERS_EVERY_MS = 30_000;

export interface PaymentEventJobData {
  providerEventId: string;
  type: PaymentEventType;
  providerRef: string;
  amountCents: number | null;
}

export function createProcessPaymentEventJob(deps: {
  confirmOrderPayment: ConfirmOrderPaymentUseCase;
  failOrder: FailOrderUseCase;
}): (data: PaymentEventJobData) => Promise<void> { /* switch por type */ }

export function createExpirePendingOrdersJob(deps: { expirePendingOrders: ExpirePendingOrdersUseCase }): () => Promise<number> { /* devolve expired */ }
```

- [ ] **Step 5: Registro no worker + integração da corrida**

Em `apps/api/src/worker.ts`, além do worker de seat-holds existente, crie a fila `PAYMENTS_QUEUE_NAME` (`new Queue(...)`), o `new Worker<PaymentEventJobData>(PAYMENTS_QUEUE_NAME, (job) => createProcessPaymentEventJob(deps)(job.data), { connection })` e `queue.upsertJobScheduler(EXPIRE_ORDERS_JOB_ID, { every: EXPIRE_ORDERS_EVERY_MS }, { name: EXPIRE_ORDERS_JOB_ID })` chamando `createExpirePendingOrdersJob`. Instancie os deps com `DrizzleOrderRepository`, `DrizzleSeatCaptureGateway`, `DrizzlePaymentEventRepository`, `getCartRepository`/`RedisCartRepository`, `RedisHoldRepository`, `createPaymentProvider()`.

`confirm-order-payment.integration.spec.ts` (Postgres + Redis reais, `seedFixtures`) — a corrida **pagamento × expiração**:
- cria hold real (via `HoldSeatUseCase` ou `app.inject POST /holds`), cria pedido `pending` (via repos Drizzle), e então:
  - caso A (pagamento vence): `confirmOrderPayment` ⇒ `paid`, `seats.status = 'occupied'`, `paid_at` preenchido; depois `expireExpiredHolds` NÃO libera (já não está `reserved`).
  - caso B (expiração vence): backdate `hold_expires_at` no passado + `expireExpiredHolds` e só então confirmar ⇒ `seats_lost`, pedido `failed`, assentos `available`.
- assento reservado por outro usuário nunca é capturado ⇒ `seats_lost` (Review Focus 5).

- [ ] **Step 6: Rodar e commitar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders src/modules/payments src/modules/seatmaps && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/api/src/modules/orders apps/api/src/modules/payments apps/api/src/worker.ts apps/api/src/modules/seatmaps
git commit -m "feat(api): confirm and fail orders from payment events"
```

---

### Task 7: Rota de webhook + fila BullMQ + wiring

**Files:**
- Create: `apps/api/src/modules/payments/infra/bullmq-payment-event-queue.ts`
- Create: `apps/api/src/modules/payments/routes/webhook.routes.ts`
- Modify: `apps/api/src/app.ts` (content-type parser com `rawBody`, opções novas, `registerWebhookRoutes`)
- Modify: `apps/api/src/index.ts` (worker in-process da fila de pagamentos — D8)
- Test: `apps/api/src/modules/payments/routes/webhook.routes.integration.spec.ts`
- Test: `apps/api/src/modules/payments/routes/webhook.routes.spec.ts`

**Interfaces:**
- Consumes: `PaymentProvider`, `PaymentEventRepository`, `PaymentEventQueue`, `PaymentEventJobData`, `PAYMENTS_QUEUE_NAME`.
- Produces: `PaymentEventQueue` interface + `BullMqPaymentEventQueue`, `registerWebhookRoutes(app, deps)`, opções novas em `buildApp`.

- [ ] **Step 1: Interface de fila + impl BullMQ**

`apps/api/src/modules/payments/domain/payment-event-queue.ts`:

```ts
import type { PaymentEventJobData } from '../jobs/process-payment-event.js';

export interface PaymentEventQueue {
  enqueue(data: PaymentEventJobData): Promise<void>;
}
```

`bullmq-payment-event-queue.ts`: `BullMqPaymentEventQueue` recebe um `Queue` do BullMQ e faz `queue.add(PROCESS_PAYMENT_EVENT_JOB, data)`.

- [ ] **Step 2: Teste unitário da rota (red)**

`webhook.routes.spec.ts` (buildApp com fakes injetados: provider fake, `paymentEventRepository` fake, `paymentEventQueue` fake que registra enqueues):

```ts
it('rejects an invalid signature with 400', ...)
// payload assinado com outro secret -> 400 { error: 'invalid_signature' }

it('records and enqueues a valid event with 200', ...)
// assinado corretamente -> 200 { received: true }; queue.enqueue chamado 1x com { providerEventId, type, providerRef, amountCents }

it('returns 200 duplicate without enqueueing on redelivery', ...)
// segundo POST do mesmo evt -> 200 { received: true, duplicate: true }; enqueue 1x só
```

- [ ] **Step 3: Implementar rota + wiring**

`registerWebhookRoutes(app, deps: { paymentProvider, paymentEventRepository, paymentEventQueue })`:

```ts
app.post('/webhooks/stripe', async (request, reply) => {
  const signature = (request.headers['stripe-signature'] as string | undefined) ?? null;
  const event = await deps.paymentProvider.parseWebhook({
    rawBody: (request as { rawBody?: string }).rawBody ?? '',
    signature,
  });
  if (!event) return reply.code(400).send({ error: 'invalid_signature' });
  const fresh = await deps.paymentEventRepository.record({
    providerEventId: event.providerEventId,
    provider: deps.paymentProvider.providerName,
    type: event.type,
  });
  if (!fresh) return reply.send({ received: true, duplicate: true });
  await deps.paymentEventQueue.enqueue({
    providerEventId: event.providerEventId,
    type: event.type,
    providerRef: event.providerRef,
    amountCents: event.amountCents,
  });
  return reply.send({ received: true });
});
```

Em `app.ts`: adicione o content-type parser que preserva o corpo cru **antes** das rotas:

```ts
app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
  (request as { rawBody?: string }).rawBody = body as string;
  try {
    done(null, JSON.parse(body as string));
  } catch (error) {
    done(error as Error, undefined);
  }
});
```

Novas opções de `buildApp`: `paymentProvider?: PaymentProvider`, `orderRepository?: OrderRepository`, `seatCaptureGateway?: SeatCaptureGateway`, `paymentEventRepository?: PaymentEventRepository`, `paymentEventQueue?: PaymentEventQueue`, `createOrder?`, `confirmOrderPayment?`, `failOrder?`, `expirePendingOrders?`. Defaults: provider via `createPaymentProvider()`, repos Drizzle, fila BullMQ (`new Queue(PAYMENTS_QUEUE_NAME, { connection: getRedis() })` — reutilize a conexão lazy; BullMQ exige `maxRetriesPerRequest: null`, então crie uma conexão dedicada em `getPaymentsConnection()` com `createRedis()` e `options.maxRetriesPerRequest = null`). Registre `registerWebhookRoutes(app, { ... })`.

Em `index.ts`, após `buildApp()`, inicie o worker in-process (D8): `new Worker<PaymentEventJobData>(PAYMENTS_QUEUE_NAME, (job) => createProcessPaymentEventJob({ confirmOrderPayment, failOrder })(job.data), { connection })` — reaproveite os use-cases do app via `app.getX`? Como `buildApp` não expõe deps, exporte de `app.ts` uma factory `createPaymentsWorkerDeps(db, redis)` usada tanto por `index.ts` quanto por `worker.ts` para não duplicar wiring.

- [ ] **Step 4: Teste de integração da rota**

`webhook.routes.integration.spec.ts` (Postgres + Redis reais): POST assinado de `payment_intent.succeeded` com `paymentEventRepository` Drizzle ⇒ 200 e linha em `payment_events`; segundo POST ⇒ `duplicate: true` e **uma** linha; assinatura inválida ⇒ 400 e nenhuma linha.

- [ ] **Step 5: Rodar e commitar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/payments && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/api/src/modules/payments apps/api/src/app.ts apps/api/src/index.ts
git commit -m "feat(api): accept stripe webhooks through the payment queue"
```

---

### Task 8: Rotas de pedido

**Files:**
- Create: `apps/api/src/modules/orders/routes/order.routes.ts`
- Modify: `apps/api/src/app.ts` (registra `registerOrderRoutes`)
- Test: `apps/api/src/modules/orders/routes/order.routes.spec.ts`
- Test: `apps/api/src/modules/orders/routes/order.routes.integration.spec.ts`

**Interfaces:**
- Consumes: `GetSessionFn`, `CreateOrderUseCase`, `OrderRepository`, `orderSchema`/`createOrderResponseSchema`/`orderResponseSchema`.
- Produces: `registerOrderRoutes(app, deps)`.

- [ ] **Step 1: Teste unitário da rota (red)**

`order.routes.spec.ts` (fakes injetados, `getSession` por header de teste como em `cart.routes.integration.spec.ts`):
- `POST /events/o-fantasma-da-opera/orders` sem sessão ⇒ 401.
- body inválido (`{ paymentMethod: 'pix' }`) ⇒ 400 `invalid_body`.
- `event_not_found` ⇒ 404; `empty_cart` ⇒ 409; `payment_failed` ⇒ 502; sucesso ⇒ 201 com `createOrderResponseSchema.parse(...)` válido e `payment.clientSecret` ecoado.
- `GET /orders/<id>`: sem sessão ⇒ 401; pedido de outro usuário ⇒ 404 `order_not_found`; pedido próprio ⇒ 200 com `orderSchema` (datas em ISO).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/routes/order.routes.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** 

`registerOrderRoutes(app, deps: { getSession, createOrder, orderRepository })`:
- `POST /events/:slug/orders`: sessão → `createOrderRequestSchema.safeParse(request.body ?? {})` (400) → `createOrder.execute({ userId, eventSlug: slug, paymentMethod, buyerEmail: session.email ?? null })` → mapeie os kinds para 404/409/502/201 e serialize com `toISOString()` para `createdAt`/`paidAt` antes de `createOrderResponseSchema.parse`.
- `GET /orders/:id`: sessão → `orderRepository.findById(id)`; ausente **ou** `order.userId !== session.userId` ⇒ 404 `order_not_found`; senão 200 `orderResponseSchema.parse`.
- Estenda `SessionUser` com `email?: string | null` (**opcional**, para não quebrar os fakes de `getSession` já existentes em `holds.routes.integration.spec.ts`, `cart.routes.integration.spec.ts`, `seatmap.routes.spec.ts` e `holds.routes.spec.ts`) e preencha `email: session.user.email ?? null` em `createGetSession`.

Registre em `app.ts` (`registerOrderRoutes(app, { getSession, createOrder: options.createOrder ?? new CreateOrderUseCase(...), orderRepository })`).

- [ ] **Step 4: Integração + rodar tudo**

`order.routes.integration.spec.ts`: com Postgres/Redis reais e provider fake injetado — hold de 2 assentos (um `meia`) → `POST /orders` ⇒ 201 com `subtotalCents`/`serviceFeeCents`/`totalCents` corretos e uma linha em `orders` + duas em `order_items`; segundo POST imediato ⇒ mesmo `order.id` e uma única linha em `orders` (Review Focus 3).

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/routes apps/api/src/app.ts apps/api/src/modules/auth/get-session.ts
git commit -m "feat(api): expose order routes and wire payments"
```

---

### Task 9: Migrar holds/carrinho anônimos no link de conta

**Files:**
- Create: `apps/api/src/modules/auth/migrate-anonymous-data.ts`
- Modify: `apps/api/src/modules/auth/auth.ts` (recebe o migrador e chama em `onLinkAccount`)
- Modify: `apps/api/src/app.ts` (passa o migrador com `getRedis()`)
- Test: `apps/api/src/modules/auth/migrate-anonymous-data.integration.spec.ts`

**Interfaces:**
- Consumes: `RedisClient`; `seats` (Drizzle).
- Produces: `migrateAnonymousRedisData(redis, fromUserId, toUserId)`.

- [ ] **Step 1: Teste de integração (red)**

`migrate-anonymous-data.integration.spec.ts` (Redis real, db 1; `flushTestRedis` no `beforeEach`):

```ts
it('reassigns hold keys to the new user keeping the TTL', async () => {
  await redis.set('hold:seat:ev1:row1:seat1', 'anon-1', 'EX', 600);
  await redis.set('hold:seat:ev1:row1:seat2', 'other-user', 'EX', 600);
  await migrateAnonymousRedisData(redis, 'anon-1', 'user-9');
  expect(await redis.get('hold:seat:ev1:row1:seat1')).toBe('user-9');
  expect(await redis.get('hold:seat:ev1:row1:seat2')).toBe('other-user');
  expect(await redis.ttl('hold:seat:ev1:row1:seat1')).toBeGreaterThan(0);
});

it('renames the cart hash keeping the TTL', async () => {
  await redis.hset('cart:anon-1:o-fantasma-da-opera', 'plateia:A:6', 'meia');
  await redis.expire('cart:anon-1:o-fantasma-da-opera', 600);
  await migrateAnonymousRedisData(redis, 'anon-1', 'user-9');
  expect(await redis.hget('cart:user-9:o-fantasma-da-opera', 'plateia:A:6')).toBe('meia');
  expect(await redis.exists('cart:anon-1:o-fantasma-da-opera')).toBe(0);
  expect(await redis.ttl('cart:user-9:o-fantasma-da-opera')).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth/migrate-anonymous-data.integration.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`migrateAnonymousData.ts`:

```ts
export async function migrateAnonymousRedisData(redis: RedisClient, fromUserId: string, toUserId: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'hold:seat:*', 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      if ((await redis.get(key)) === fromUserId) await redis.set(key, toUserId, 'KEEPTTL');
    }
  } while (cursor !== '0');

  cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `cart:${fromUserId}:*`, 'COUNT', 100);
    cursor = next;
    for (const key of keys) await redis.rename(key, key.replace(`cart:${fromUserId}:`, `cart:${toUserId}:`));
  } while (cursor !== '0');
}
```

Em `auth.ts`, `createAuth(db, deps)` passa a receber `deps: { sendEmail: SendEmailFn; migrateAnonymousData?: (from: string, to: string) => Promise<void> }` — **opcional com default no-op** (`deps.migrateAnonymousData ?? (async () => {})`), para `auth.integration.spec.ts` (que chama `createAuth(testDb, { sendEmail: collectEmail })`) continuar compilando sem alteração. `onLinkAccount` chama os dois (o `update seats` atual + `await migrate(anonymousUser.user.id, newUser.user.id)`). Em `app.ts`, passe `migrateAnonymousData: (from, to) => migrateAnonymousRedisData(getRedis(), from, to)`.

- [ ] **Step 4: Rodar e commitar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/auth && pnpm --filter @ticketvibe/api exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/api/src/modules/auth apps/api/src/app.ts
git commit -m "fix(api): migrate anonymous holds and cart on account link"
```

---

### Task 10: Proxies web de pedidos

**Files:**
- Create: `apps/web/src/app/api/events/[slug]/orders/route.ts` (+ `route.spec.ts`)
- Create: `apps/web/src/app/api/orders/[id]/route.ts` (+ `route.spec.ts`)

**Interfaces:**
- Consumes: `createOrderRequestSchema`, `createOrderResponseSchema`, `orderResponseSchema`.
- Produces: rotas `POST /api/events/[slug]/orders` e `GET /api/orders/[id]`.

- [ ] **Step 1: Testes (red)**

Espelhe `apps/web/src/app/api/events/[slug]/cart/route.spec.ts`: msw/mock do `fetch` upstream. Casos do POST: sem cookie/sem sessão upstream 401 ⇒ passthrough; body inválido ⇒ 400 `invalid_body` sem chamar upstream; upstream 409 ⇒ passthrough de `{ error: 'empty_cart' }`; upstream 502 ⇒ passthrough; sucesso ⇒ `createOrderResponseSchema.parse` do corpo. Casos do GET: 401 passthrough, 404 passthrough (`order_not_found`), sucesso parsa `orderResponseSchema`; cookie repassado em ambos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/events/[slug]/orders src/app/api/orders`
Expected: FAIL.

- [ ] **Step 3: Implementar seguindo o padrão do proxy de cart**

`API_URL = process.env.API_URL ?? 'http://localhost:3001'`, `cache: 'no-store'`, `AbortSignal.timeout(3000)`, `cookie` repassado, `502 { error: 'upstream_error' }` em erro de rede/schema. O POST faz `createOrderRequestSchema.safeParse(await request.json().catch(() => null))` → 400 se inválido, e repassa `JSON.stringify(parsed.data)`. Preserve os status upstream (401/404/409/502) devolvendo o corpo quando for `{ error }`.

- [ ] **Step 4: Rodar e commitar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/web/src/app/api/events/[slug]/orders apps/web/src/app/api/orders
git commit -m "feat(web): proxy order creation and reads"
```

---

### Task 11: UI de checkout (resumo, taxa, pagamento, confirmação)

**Files:**
- Create: `apps/web/src/app/events/[slug]/checkout/page.tsx`
- Create: `apps/web/src/app/events/[slug]/checkout/retorno/page.tsx`
- Create: `apps/web/src/components/checkout-summary.tsx` (+ `checkout-summary.spec.tsx`)
- Create: `apps/web/src/components/checkout-flow.tsx` (+ `checkout-flow.spec.tsx`)
- Create: `apps/web/src/components/order-confirmation.tsx` (+ `order-confirmation.spec.tsx`)
- Modify: `apps/web/src/components/cart-panel.tsx` (+ spec) — CTA "Finalizar compra"
- Modify: `apps/web/src/components/seat-map.tsx` — passa o `href` do checkout ao CartPanel
- Modify: `apps/web/package.json` (deps `@stripe/stripe-js`, `@stripe/react-stripe-js`)

**Interfaces:**
- Consumes: `orderTotals`, `orderSchema`, `createOrderResponseSchema`, `orderResponseSchema`, `CartDto`, `OrderDto`; `formatBRL`; `authClient.useSession()`.
- Produces: `CheckoutSummary` (`{ items, subtotalCents, serviceFeeCents, totalCents }`), `CheckoutFlow` (`{ eventSlug, eventTitle }`), `OrderConfirmation` (`{ order }`); `CartPanelProps.checkoutHref?: string`.

- [ ] **Step 1: Instalar as deps e testar o resumo (red)**

Run: `pnpm --filter @ticketvibe/web add @stripe/stripe-js @stripe/react-stripe-js`

`checkout-summary.spec.tsx` — presentacional, sem rede:

```tsx
it('shows each item, the service fee and the total', ...)
// items: plateia/A/6 meia 6000, plateia/A/7 inteira 12000; subtotal 18000; fee 1800; total 19800
// expect getByText('Plateia · Fila A · Cadeira 6 · R$ 60,00'), /Taxa de serviço/ + 'R$ 18,00', 'Total: R$ 198,00'
```

`order-confirmation.spec.tsx`: pedido `paid` mostra "Pedido confirmado", os assentos e o total; `pending` mostra "Aguardando pagamento"; `failed` mostra "Pagamento não confirmado" e o motivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/checkout-summary.spec.tsx src/components/order-confirmation.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar resumo + confirmação + CTA**

`checkout-summary.tsx`: `section aria-label="Resumo do pedido"` com `<h2>Resumo do pedido</h2>`, lista de itens (`{sectorName?} · Fila {rowLabel} · Cadeira {seatLabel} · {formatBRL(priceCents)}` — use `sectorSlug` quando não houver nome), linha `Taxa de serviço` `/` `{formatBRL(serviceFeeCents)}`, e `Total: {formatBRL(totalCents)}` em destaque. Reuse o padrão visual/aria do `cart-panel.tsx`.

`order-confirmation.tsx`: presentacional, `section aria-label="Pedido"`; estados `paid`/`pending`/`failed` com textos pt-BR; lista de assentos e valores.

`cart-panel.tsx`: adicione `checkoutHref?: string`; quando houver itens e `checkoutHref`, renderize um link "Finalizar compra" para `checkoutHref`. **Antes de escrever**, abra `apps/web/src/components/ui/button.tsx` e use o padrão de "link como botão" que o repo já expõe (se houver `asChild`/`buttonVariants`, use; senão use o `Link` do `next/link` com `className` equivalente) — não invente API. Mantenha "Desistir de todos". Atualize `cart-panel.spec.tsx`: novo teste "links to checkout when items exist" (`getByRole('link', { name: 'Finalizar compra' })` com `href`), e que o link **não** aparece com carrinho vazio.

`seat-map.tsx`: passe `checkoutHref` com o **eventSlug** disponível no componente → `/events/${eventSlug}/checkout`; atualize `seat-map.spec.tsx` com uma asserção de que o link existe após adicionar um assento.

- [ ] **Step 4: Implementar CheckoutFlow (red → green)**

`checkout-flow.spec.tsx` (MSW nos handlers `/api/events/[slug]/cart`, `/api/events/[slug]/orders`, `/api/orders/[id]`; `authClient.useSession` mockado):
- sem usuário ⇒ `getByText('Entre para finalizar a compra')` + link para `/entrar`.
- carrinho vazio ⇒ `getByText('Seu carrinho está vazio.')`.
- com itens e usuário ⇒ resumo com taxa e total; `getByRole('radio', { name: 'Boleto' })` selecionável.
- submit com provider `fake` ⇒ aparece `getByText(/pagamento simulado/i)` e **não** renderiza o Stripe Element (garanta que `loadStripe` não é chamado).
- polling: quando `GET /api/orders/:id` passa a devolver `paid`, aparece `Pedido confirmado`.

`checkout-flow.tsx` ('use client'):
- `authClient.useSession()`; sem user → estado "Entre para finalizar a compra" com link para `/entrar` (a página de login **não** suporta `?redirect=`, então o usuário volta manualmente ao checkout).
- `useEffect` inicial → `GET /api/events/${eventSlug}/cart` e `orderTotals(cart.items)`; estado vazio → "Seu carrinho está vazio.".
- Radio cartão/boleto (default `card`), botão `Pagar` (`POST /api/events/${eventSlug}/orders`) com tratamento 401/409/502 e estados `pending`/`error` (mesmo padrão do `seat-map.tsx`).
- Se `payment.provider === 'stripe'` e método `card`: `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)`, `<Elements stripe options={{ clientSecret }}>`, `<PaymentElement/>` e `stripe.confirmPayment({ elements, confirmParams: { return_url: /events/${eventSlug}/checkout/retorno?order=${order.id} } })`.
- Se `payment.provider === 'fake'`: painel "Pagamento simulado (sandbox)" com o `providerRef` visível e nota para disparar o webhook.
- Poll `GET /api/orders/${order.id}` a cada 3s até `status !== 'pending'` → `<OrderConfirmation order/>`.

`checkout/page.tsx`: server component; `fetchEventBySlug` (de `lib/events-api.ts`) para o título; renderiza `<CheckoutFlow eventSlug={slug} eventTitle={event.title}/>`. `checkout/retorno/page.tsx`: lê `?order=`, busca `GET /api/orders/[id]` (client) e mostra `<OrderConfirmation/>` com poll curto.

- [ ] **Step 5: Rodar e commitar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components && pnpm --filter @ticketvibe/web exec tsc --noEmit`
Expected: PASS; tsc limpo.

```bash
git add apps/web/src/app/events apps/web/src/components apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add the checkout flow with stripe payments"
```

---

### Task 12: E2E do checkout

**Files:**
- Create: `apps/web/tests/e2e/checkout.spec.ts`
- Create: `apps/web/tests/e2e/helpers/auth.ts`
- Create: `apps/web/tests/e2e/helpers/stripe.ts`

**Interfaces:**
- Consumes: `signStripeWebhook` (reimplementado em `helpers/stripe.ts` com `node:crypto`), Mailpit helpers, `podman exec ticketvibe-postgres psql`.
- Produces: `registerVerifiedBuyer(page, { email, password })`, `signStripeWebhook(payload, secret)`, `readLatestOrder()`.

- [ ] **Step 1: Helpers**

- `helpers/stripe.ts`: `signStripeWebhook(payload, secret, timestamp = Math.floor(Date.now()/1000))` idêntico ao da API (`t=…,v1=hmac(secret, `${ts}.${payload}`)`).
- `helpers/auth.ts`: extraia o fluxo de cadastro+verificação de `apps/web/tests/e2e/auth.spec.ts` (signup → e-mail via Mailpit → link de confirmação → login) numa função reutilizável; ajuste `auth.spec.ts` para usá-la (sem alterar asserções).
- `readLatestOrder()`: `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -At -c "select id || '|' || provider_ref || '|' || total_cents from orders order by created_at desc limit 1"` (ignora erro se vazio) e devolve `{ id, providerRef, totalCents }`.

- [ ] **Step 2: Teste 1 — compra completa com webhook simulado**

`checkout.spec.ts`, com `PAYMENT_PROVIDER` não definido (⇒ fake) — o `webServer` do Playwright sobe a API com o ambiente herdado; **não** toque no `playwright.config.ts` (D8 garante que a API consome a fila).

**A sequência é o coração do teste** (valida a migração Redis do D11): cadastrar+verificar o comprador → **sair** → escolher assento **anônimo** → ir ao checkout → **entrar** → voltar ao checkout → pagar → webhook → confirmar.

```ts
test('completes a purchase with a simulated webhook', async ({ page, request }) => {
  const email = `buyer-${Date.now()}@example.com`;
  const password = 'senha-forte-123';

  // 1. comprador verificado (cadastro -> verificação Mailpit -> login), depois sai
  await registerVerifiedBuyer(page, { email, password });
  await page.getByRole('button', { name: 'Sair' }).click();

  // 2. escolhe o assento na sessão ANÔNIMA (holds no Redis sob o id anônimo)
  await page.goto('/events/o-fantasma-da-opera/ingressos');
  await page.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await expect(page.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00')).toBeVisible();

  // 3. checkout exige login; a migração onLinkAccount deve preservar carrinho/holds
  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page.getByText('Entre para finalizar a compra')).toBeVisible();
  await page.getByRole('link', { name: /entrar/i }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('http://localhost:3000/');
  await page.goto('/events/o-fantasma-da-opera/checkout');

  // 4. resumo com taxa e total (12000 + 1200)
  await expect(page.getByText('Total: R$ 132,00')).toBeVisible();
  await page.getByRole('button', { name: 'Pagar' }).click();
  await expect(page.getByText(/pagamento simulado/i)).toBeVisible();

  // 5. simula o webhook de aprovação com a assinatura Stripe
  const order = readLatestOrder();
  const payload = JSON.stringify({
    id: `evt_${Date.now()}`,
    type: 'payment_intent.succeeded',
    data: { object: { id: order.providerRef, amount_received: order.totalCents } },
  });
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
  const response = await request.post('http://127.0.0.1:3001/webhooks/stripe', {
    headers: { 'content-type': 'application/json', 'stripe-signature': signStripeWebhook(payload, secret) },
    data: payload,
  });
  expect(response.ok()).toBe(true);

  // 6. confirmação e assento definitivamente ocupado
  await expect(page.getByText('Pedido confirmado')).toBeVisible({ timeout: 15_000 });
  await page.goto('/events/o-fantasma-da-opera/ingressos');
  await expect(page.getByRole('button', { name: 'Cadeira 1, fila A' })).toBeDisabled();
});
```

Seletores de radio (Cartão/Boleto), aria-label dos assentos e textos de confirmação devem ser lidos do que a Task 11 realmente renderizou; o essencial é: sair → assento anônimo → checkout pede login → entrar → total com taxa → pagar → webhook assinado → `Pedido confirmado` → assento ocupado.

- [ ] **Step 3: Teste 2 — aprovado sem assento (reembolso)**

```ts
test('fails and frees the seat when payment arrives after the hold expired', async ({ page }) => {
  // login + seleciona Cadeira 4 + vai ao checkout + paga (fake, pending)
  // backdate do hold via psql (como cart.spec.ts), recarrega o seatmap para expirar
  // posta payment_intent.succeeded assinado com o total correto
  // expect getByText('Pagamento não confirmado') e assento 4 habilitado; pedido failed no banco
});
```

- [ ] **Step 4: Rodar a bateria E2E**

Run: `pnpm infra:up && pnpm --filter @ticketvibe/web exec playwright test`
Expected: PASS — todos os specs anteriores + `checkout.spec.ts` (2 testes), sem flakes. Rode o `checkout.spec.ts` 2× para confirmar estabilidade.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e
git commit -m "test(web): cover checkout end to end"
```

---

### Task 13: Gates finais + fechar o ticket 13

**Files:**
- Modify: `.scratch/ticketvibe/issues/13-checkout-stripe-cartao-e-boleto.md`

- [ ] **Step 1: Gates**

Run, em sequência, e registre os números reais:
`pnpm lint` (0 erros; 1 info pré-existente), `pnpm typecheck` (5/5), `pnpm test` (API/web/shared), `pnpm --filter @ticketvibe/web exec playwright test`, `pnpm build`, `pnpm --filter @ticketvibe/api exec drizzle-kit check`.

- [ ] **Step 2: Fechar a issue**

Em `.scratch/ticketvibe/issues/13-checkout-stripe-cartao-e-boleto.md`: `Status: ready-for-agent` → `Status: done`; `[ ]` → `[x]`; adicione a seção **Implementação** (tabela Task|Commit|Escopo com os SHAs reais) e **Gates finais**; adicione **Deferrals**:
- Pix (modo live do Stripe) → quando migrar para live.
- Split/Connect, `platform_fee_cents`/`organizer_net_cents` no pedido → ticket 22.
- Política/regras de reembolso ao comprador (hoje só o reembolso automático do caminho "aprovado sem assento") → ticket 21.
- Auto-renew de holds na página de checkout → adiado (D12); o TTL de 10 min continua valendo.
- Boleto **real** do Stripe não é exercitado em teste (sem rede); a integração é coberta pelo provider fake + assinatura real. Verificação manual contra o sandbox fica como pendência de go-live.
- Carrinho/checkout multi-evento → não suportado (spec, Out of Scope).
- Rate limiting/antifraude do endpoint de webhook → não implementado (inferência local).

- [ ] **Step 3: Commit + verificação final**

```bash
git add .scratch/ticketvibe/issues/13-checkout-stripe-cartao-e-boleto.md
git commit -m "docs(agents): close ticket 13 with implementation notes"
git log --oneline -16
```

Expected: sequência de commits do ticket 13 no topo do `main`; working tree limpa.

---

## Self-review (feito antes da oferta de execução)

- **Cobertura dos critérios da issue 13:** resumo com preço/taxa/total (Task 1 `orderTotals` + Tasks 11/12 UI/E2E); camada de pagamento por interface + Stripe sandbox cartão+boleto (Tasks 4/11); webhook idempotente via worker (Tasks 2/6/7 — `payment_events` + `process-payment-event` + BullMQ); transação que confirma pedido e fixa assentos, liberando em falha/expiração (Tasks 3/6 — `SeatCaptureGateway.confirmOrderPayment` + `fail`/`expire`); pedido na conta do comprador com valores e status (Tasks 2/5/8 — `orders`/`order_items` + `POST /orders` + `GET /orders/:id`); testes de integração da corrida, unitários da taxa e E2E com webhook simulado (Tasks 1/5/6/8/12). ✓
- **Consistência de tipos:** `PaymentProvider.providerName` é declarado na Task 4 (interface + ambos os impls) e consumido na Task 5; `CartRepository.clear` (Task 6 Step 1) é consumido pelas Tasks 6/8; `releaseOrderSeats → { seatKeys }` casa com `holdSeatKey` da ticket 11; `order_items.row_id` existe para permitir essa chave; o `eventId` do pedido vem de `seat.eventId` de `findSeatByCoords` (o `SeatmapEntity` não é alterado); `SessionUser.email` é **opcional** (não quebra fakes existentes) e `createAuth`'s `migrateAnonymousData` é opcional com default no-op (não quebra `auth.integration.spec.ts`). ✓
- **Review Focus:** cada um dos 5 itens tem teste na task dona (3→Task 5 Step 4, 1/2/4/5→Task 6 Step 5). ✓
- **Sem placeholders:** todas as tasks nomeiam arquivos, assinaturas, comandos e asserts; os únicos "ajuste ao real" explícitos são nomes de aria-label/seletores do checkout (Task 12 lê o componente) e o padrão de link-como-botão da Task 11 (lê `ui/button.tsx`).
- **Proporção:** corpos completos só onde a decisão é algorítmica (transação `confirmOrderPayment`, assinatura HMAC, migração Redis, parser de `rawBody`); o resto são assinaturas + testes.
