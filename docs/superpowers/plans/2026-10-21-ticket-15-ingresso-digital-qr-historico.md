# Ticket 15: Ingresso digital com QR Code + histórico de pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O comprador autenticado vê todo o histórico de pedidos na sua conta e, abrindo um pedido, encontra um ingresso digital por item — com QR Code pronto para a entrada no evento — que deixa de valer quando o pedido não está pago.

**Architecture:** Um novo agregado `tickets` é emitido no mesmo instante em que a captura do pagamento confirma o pedido (mesma transação), com um código opaco único por item do pedido; a validade do ingresso é **derivada** do status do pedido no momento da leitura (`paid` → válido), nunca um flag guardado, para que um pedido expirado/cancelado invalidate o ingresso sem trabalho extra. A API ganha `GET /orders` (histórico do usuário autenticado) e estende `GET /orders/:id` com o ingresso de cada item; o web ganha as páginas `/conta` e `/conta/pedidos/[id]`, com o QR renderizado no cliente a partir do código.

**Tech Stack:** Fastify + Drizzle (Postgres) + Zod (`packages/shared`) + Next.js (App Router) + `qrcode.react` (novo, só no web) + vitest/RTL/MSW + Playwright.

**Spec:** `.scratch/ticketvibe/issues/15-ingresso-digital-com-qr-e-historico.md` (issue 15) e `.scratch/ticketvibe/spec.md` (stories 32 e 33, seção F3 Pós-compra). O plano do ticket 14 (`docs/superpowers/plans/2026-10-20-ticket-14-email-de-confirmacao-de-compra.md`) é a referência do que já existe.

## Global Constraints

- **Nenhum comentário de código** em nenhum arquivo novo ou modificado.
- **Copy de UI e descrições de teste em pt-BR**; identificadores de código em inglês. Exceção já estabelecida: `packages/shared/src/index.spec.ts` fica em **inglês**.
- **Commits Conventional em inglês e no imperativo**: `feat(api): …`, `feat(web): …`, `test(web): …`.
- **Uma única dependência nova**: `qrcode.react@^4.2.0` em `apps/web` (React 19 compatível). A API **não** ganha dependência nenhuma (o QR é renderizado no cliente a partir do código).
- **`apps/web/playwright.config.ts` e `apps/web/tests/e2e/global-setup.ts` nunca são tocados.** Nunca rodar `pnpm infra:down` (usar `pnpm infra:up`).
- **Migrações só via drizzle-kit** (`pnpm --filter @ticketvibe/api db:generate`) — nunca SQL escrito à mão no schema.
- **Determinismo**: todo use-case/job recebe `now: () => Date = () => new Date()` injetado; nada de `new Date()` dentro do corpo.
- **Testes afirmar comportamento externo** (o que a API responde, o que a tela mostra) — nunca estado interno.
- **Branch `main`** (convenção do repo), commits pequenos e frequentes.

## Review Focus

Cinco modos de falha que a issue 15 implica e que nenhum teste do ticket 13/14 exercita:

1. **Reentrega do webhook de pagamento** → o mesmo item do pedido não pode receber dois ingressos (a captura é idempotente e o item do pedido é único).
2. **Pedido expirado, falho ou reembolsado** → o ingresso já emitido aparece como **não válido** para entrada (a validade é derivada do status do pedido, não um flag guardado).
3. **Pedido de outro usuário** → 404 no detalhe e ausente do histórico (o histórico é do usuário da sessão).
4. **Pedido pendente** → nenhum ingresso: o item vem com `ticket: null` (o ingresso só nasce na captura).
5. **Pedido com vários itens** → um ingresso por item, cada um com o seu código, todos distintos.

---

### Task 1: O domínio do ingresso + o contrato compartilhado

O ingresso é uma entidade de primeira classe: nasce com o pagamento, tem código próprio e tem validade derivada. O contrato compartilhado ganha o ingresso dentro do item do pedido — é o que permite à tela renderizar QR e validade sem juntar arrays.

**Files:**
- Create: `apps/api/src/modules/orders/domain/ticket-entity.ts`
- Create: `apps/api/src/modules/orders/domain/ticket-entity.spec.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/index.spec.ts`
- Modify: `apps/api/src/modules/orders/routes/order.routes.ts` (o serializador passa a emitir `ticket: null` e `sectorName`)
- Modify: `apps/web/src/components/order-confirmation.tsx` (passa a mostrar o nome do setor)
- Modify: os specs que montam um pedido como fixture (API e web) — a forma do item mudou

**Interfaces:**
- Consumes: `orderStatusSchema`/`OrderStatus`, `ticketTypeSchema` (já em `packages/shared`); `OrderItemRecord.sectorName` (existiu desde o ticket 14).
- Produces:
  - `apps/api/src/modules/orders/domain/ticket-entity.ts`:
    ```ts
    export type TicketStatus = 'valid' | 'invalid';

    export interface TicketRecord {
      id: string;
      orderId: string;
      orderItemId: string;
      seatId: string;
      code: string;
      createdAt: Date;
    }

    export function generateTicketCode(): string;
    export function ticketStatusFor(orderStatus: OrderStatus): TicketStatus;
    ```
    `generateTicketCode()` devolve `randomBytes(16).toString('base64url')` (22 caracteres, alfabeto URL-safe). `ticketStatusFor` devolve `'valid'` só para `'paid'`.
  - `packages/shared/src/index.ts`:
    ```ts
    export const ticketStatusSchema = z.enum(['valid', 'invalid']);
    export type TicketStatusDto = z.infer<typeof ticketStatusSchema>;

    export const orderTicketSchema = z.object({
      code: z.string().min(1),
      status: ticketStatusSchema,
    });
    export type OrderTicketDto = z.infer<typeof orderTicketSchema>;

    export const orderItemSchema = z.object({
      sectorSlug: z.string().min(1),
      sectorName: z.string().min(1).nullable(),
      rowLabel: z.string().min(1),
      seatLabel: z.string().min(1),
      ticketType: ticketTypeSchema,
      priceCents: z.number().int().min(0),
      ticket: orderTicketSchema.nullable(),
    });

    export const orderSummarySchema = z.object({
      id: z.uuid(),
      eventSlug: z.string().min(1),
      eventTitle: z.string().min(1),
      eventStartsAt: z.iso.datetime(),
      status: orderStatusSchema,
      subtotalCents: z.number().int().min(0),
      serviceFeeCents: z.number().int().min(0),
      totalCents: z.number().int().min(0),
      itemCount: z.number().int().min(0),
      createdAt: z.iso.datetime(),
    });
    export type OrderSummaryDto = z.infer<typeof orderSummarySchema>;

    export const orderListResponseSchema = z.object({
      orders: z.array(orderSummarySchema),
    });
    export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
    ```

- [ ] **Step 1: Escreva os testes que falham (domínio do ingresso)**

Crie `apps/api/src/modules/orders/domain/ticket-entity.spec.ts` (descrições em **pt-BR**):

- `generateTicketCode()` devolve uma string de **22 caracteres** que só usa `A-Z a-z 0-9 - _` (regex `/^[A-Za-z0-9_-]{22}$/`) e 500 códigos gerados são **todos distintos**;
- `ticketStatusFor('paid')` devolve `'valid'`;
- `ticketStatusFor('pending')`, `ticketStatusFor('failed')` e `ticketStatusFor('expired')` devolvem `'invalid'`.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/domain/ticket-entity.spec.ts`
Expected: FAIL — `Cannot find module '.../orders/domain/ticket-entity'`.

- [ ] **Step 3: Implemente o domínio do ingresso**

Crie `apps/api/src/modules/orders/domain/ticket-entity.ts` com as interfaces e as duas funções do bloco acima. `generateTicketCode` usa `randomBytes` de `node:crypto`; `ticketStatusFor` compara o status com `'paid'`.

- [ ] **Step 4: Escreva os testes que falham (shared)**

Em `packages/shared/src/index.spec.ts` (descrições em **inglês**), acrescente:

```ts
describe('orderItemSchema', () => {
  it('accepts an item with a ticket and a null ticket', () => {
    expect(
      orderItemSchema.parse({
        sectorSlug: 'plateia',
        sectorName: 'Plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
        priceCents: 12000,
        ticket: { code: 'abc123', status: 'valid' },
      }).ticket?.status,
    ).toBe('valid');
    expect(
      orderItemSchema.parse({
        sectorSlug: 'plateia',
        sectorName: null,
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
        priceCents: 12000,
        ticket: null,
      }).ticket,
    ).toBeNull();
  });
});

describe('orderListResponseSchema', () => {
  it('parses the order history', () => {
    expect(
      orderListResponseSchema.parse({
        orders: [
          {
            id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
            eventSlug: 'o-fantasma-da-opera',
            eventTitle: 'O Fantasma da Ópera',
            eventStartsAt: '2026-10-22T20:00:00.000Z',
            status: 'paid',
            subtotalCents: 12000,
            serviceFeeCents: 1200,
            totalCents: 13200,
            itemCount: 1,
            createdAt: '2026-10-18T12:00:00.000Z',
          },
        ],
      }).orders[0]?.itemCount,
    ).toBe(1);
  });
});
```

- [ ] **Step 5: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/shared exec vitest run`
Expected: FAIL — `orderListResponseSchema is not a function` / `orderItemSchema` rejeita `sectorName`/`ticket`.

- [ ] **Step 6: Implemente o contrato compartilhado**

Em `packages/shared/src/index.ts`: acrescente `ticketStatusSchema`, `orderTicketSchema`, `orderSummarySchema` e `orderListResponseSchema`; estenda `orderItemSchema` com `sectorName: z.string().min(1).nullable()` e `ticket: orderTicketSchema.nullable()`; exporte os tipos `TicketStatusDto`, `OrderTicketDto`, `OrderSummaryDto` e `OrderListResponse` (o `OrderItemDto` acompanha o novo shape automaticamente).

- [ ] **Step 7: Ajuste o serializador da API e as fixtures**

Em `apps/api/src/modules/orders/routes/order.routes.ts`, o `serializeOrder` passa a emitir `sectorName: item.sectorName` e `ticket: null` no item (o ingresso ainda não existe — a Task 3 traz o de verdade). Depois, **atualize toda fixture que tenha itens de pedido** nos specs da API e do web: o `orderItemSchema` agora exige `sectorName` e `ticket`. Use `grep -rn "sectorSlug" apps/api/src apps/web/src --include=*.spec.ts --include=*.spec.tsx` para achar todas; a lista conhecida é `apps/api/src/modules/orders/routes/order.routes.spec.ts`, `apps/api/src/modules/orders/routes/order.routes.integration.spec.ts`, `apps/web/src/app/api/orders/[id]/route.spec.ts`, `apps/web/src/components/checkout-flow.spec.tsx`, `apps/web/src/components/order-confirmation.spec.tsx` e `apps/web/src/components/order-status.spec.tsx`. Fixtures com `items: []` não precisam de ajuste.

Em `apps/web/src/components/order-confirmation.tsx`, o item passa a mostrar `{item.sectorName ?? item.sectorSlug}` (o nome do setor é o que o comprador reconhece — o slug sozinho vira "plateia"). Atualize a expectativa do `apps/web/src/components/order-confirmation.spec.tsx` (a fixture ganha `sectorName: 'Plateia'` e a asserção passa a esperar "Plateia · Fila A · Cadeira 1").

- [ ] **Step 8: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/shared exec vitest run` e `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders` e `pnpm --filter @ticketvibe/web exec vitest run`
Expected: PASS nos três.

- [ ] **Step 9: Verifique e commit**

Run: `pnpm typecheck` e `pnpm lint`
Expected: 5/5 no typecheck, 0 erros no lint.

```bash
git add packages/shared apps/api/src/modules/orders apps/web/src
git commit -m "feat(api): add the ticket contract and the order history schema"
```

---

### Task 2: A tabela de ingressos e a emissão na captura

O ingresso nasce no mesmo instante em que o pedido é pago — na mesma transação da captura. Assim não existe estado "pedido pago sem ingresso", e a reentrega do webhook não emite um segundo ingresso (a captura é idempotente e o item do pedido é único).

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/00XX_*.sql` (gerado) + o snapshot
- Create: `apps/api/src/modules/orders/domain/ticket-repository.ts`
- Create: `apps/api/src/modules/orders/infra/drizzle-ticket-repository.ts`
- Create: `apps/api/src/modules/orders/infra/drizzle-ticket-repository.integration.spec.ts`
- Modify: `apps/api/src/modules/orders/infra/drizzle-seat-capture-gateway.ts` (emite os ingressos na transação da captura)
- Modify: `apps/api/src/modules/orders/use-cases/confirm-order-payment.integration.spec.ts`
- Modify: `apps/api/src/app.ts` (wiring do repositório de ingressos)

**Interfaces:**
- Consumes: `generateTicketCode()` (Task 1), `orderItems.id`/`orderItems.seatId` (o item do pedido tem id próprio).
- Produces:
  - Tabela `tickets`:
    ```ts
    export const tickets = pgTable(
      'tickets',
      {
        id: uuid('id').defaultRandom().primaryKey(),
        orderId: uuid('order_id')
          .notNull()
          .references(() => orders.id, { onDelete: 'cascade' }),
        orderItemId: uuid('order_item_id')
          .notNull()
          .references(() => orderItems.id, { onDelete: 'cascade' }),
        seatId: uuid('seat_id')
          .notNull()
          .references(() => seats.id),
        code: text('code').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
          .notNull()
          .defaultNow(),
      },
      (table) => [
        uniqueIndex('tickets_code_unique').on(table.code),
        uniqueIndex('tickets_order_item_unique').on(table.orderItemId),
      ],
    );
    ```
  - `apps/api/src/modules/orders/domain/ticket-repository.ts`:
    ```ts
    export interface TicketRepository {
      findByOrderId(orderId: string): Promise<TicketRecord[]>;
    }
    ```
  - `apps/api/src/modules/orders/infra/drizzle-ticket-repository.ts`:
    ```ts
    export class DrizzleTicketRepository implements TicketRepository {
      constructor(private readonly db: Db) {}
      async findByOrderId(orderId: string): Promise<TicketRecord[]>;
    }
    ```

- [ ] **Step 1: Escreva o teste que falha (integração da captura)**

Em `apps/api/src/modules/orders/use-cases/confirm-order-payment.integration.spec.ts`, acrescente um caso (pt-BR) que confirma o pagamento de um pedido com **dois itens** e verifica no banco que existem **dois** ingressos, um por item, com `order_item_id` e `seat_id` distintos e `code` presente e diferente entre eles. Depois, chame o `execute` de novo com o mesmo `providerRef` (a reentrega) e verifique que continua havendo **dois** ingressos (nenhum duplicado).

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/use-cases/confirm-order-payment.integration.spec.ts`
Expected: FAIL — a tabela `tickets` não existe.

- [ ] **Step 3: Migre o schema e gere a migração**

Em `apps/api/src/db/schema.ts`, acrescente a tabela `tickets` (bloco acima). Depois:

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: cria `apps/api/drizzle/00XX_<nome>.sql` com o `CREATE TABLE tickets` (PK `id`, FKs para `orders`, `order_items` e `seats`, dois índices únicos). Confira o SQL gerado antes de seguir.

- [ ] **Step 4: O port e o repositório**

- `domain/ticket-repository.ts`: a interface do bloco acima.
- `infra/drizzle-ticket-repository.ts`: `findByOrderId` faz o select da linha por `order_id` e mapeia para `TicketRecord` (`createdAt` como `Date`).

- [ ] **Step 5: A emissão na captura**

Em `apps/api/src/modules/orders/infra/drizzle-seat-capture-gateway.ts`, dentro da transação de `confirmOrderPayment`, **depois** de marcar o pedido como `paid`, insira um ingresso por item lido (`orderItems`), com `code: generateTicketCode()` e `orderId`/`orderItemId`/`seatId` do item. Use um único `insert` com o array de valores. A inserção usa a **mesma `tx`** da transação (nada de `this.db` aqui) — é o que garante que não exista pedido pago sem ingresso.

- [ ] **Step 6: O teste de integração do repositório**

Crie `apps/api/src/modules/orders/infra/drizzle-ticket-repository.integration.spec.ts`: grava dois ingressos e verifica que `findByOrderId` devolve os dois, com o `code` e o `createdAt` preenchidos.

- [ ] **Step 7: Ligue o repositório na aplicação**

Em `apps/api/src/app.ts`, crie `new DrizzleTicketRepository(db)` e passe-o para `registerOrderRoutes` (que o usará na Task 3) — se `registerOrderRoutes` ainda não aceitar a dependência, adicione o parâmetro ao tipo das deps agora, mesmo sem uso, para que o wiring não quebre em dois commits.

- [ ] **Step 8: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders`
Expected: PASS.

- [ ] **Step 9: Verifique a migração no banco de dev**

Run: `pnpm --filter @ticketvibe/api db:migrate` e depois `pnpm --filter @ticketvibe/api exec drizzle-kit check`
Expected: migração aplicada sem erro; `drizzle-kit check` limpo.

- [ ] **Step 10: Verifique e commit**

Run: `pnpm --filter @ticketvibe/api test` (suíte completa — reporte o total), `pnpm --filter @ticketvibe/api exec tsc --noEmit` e `pnpm --filter @ticketvibe/api exec biome check src`
Expected: tudo limpo.

```bash
git add apps/api/src/db apps/api/drizzle apps/api/src/modules/orders apps/api/src/app.ts
git commit -m "feat(api): issue a ticket for every item when the payment is captured"
```

---

### Task 3: As rotas de conta — histórico e detalhe com ingressos

**Files:**
- Modify: `apps/api/src/modules/orders/domain/order-entity.ts` (o registro do resumo)
- Modify: `apps/api/src/modules/orders/domain/order-repository.ts` (o port ganha o histórico)
- Modify: `apps/api/src/modules/orders/infra/drizzle-order-repository.ts`
- Modify: `apps/api/src/modules/orders/infra/in-memory-order-repository.ts`
- Modify: `apps/api/src/modules/events/domain/events-repository.ts` (busca em lote dos eventos)
- Modify: `apps/api/src/modules/events/infra/drizzle-events-repository.ts`
- Modify: `apps/api/src/modules/orders/routes/order.routes.ts`
- Modify: `apps/api/src/modules/orders/routes/order.routes.spec.ts`
- Modify: `apps/api/src/modules/orders/routes/order.routes.integration.spec.ts`

**Interfaces:**
- Consumes: `TicketRepository` e `OrderRepository` (Task 2), `ticketStatusFor` (Task 1).
- Produces:
  - `apps/api/src/modules/orders/domain/order-entity.ts`:
    ```ts
    export interface OrderSummaryRecord {
      id: string;
      eventSlug: string;
      status: OrderStatus;
      subtotalCents: number;
      serviceFeeCents: number;
      totalCents: number;
      itemCount: number;
      createdAt: Date;
    }
    ```
  - `apps/api/src/modules/orders/domain/order-repository.ts`:
    ```ts
    listByUser(input: { userId: string; limit: number }): Promise<OrderSummaryRecord[]>;
    ```
  - `apps/api/src/modules/events/domain/events-repository.ts`:
    ```ts
    findBySlugs(slugs: string[]): Promise<EventEntity[]>;
    ```
  - `GET /orders` → `orderListResponseSchema` (`{ orders: OrderSummaryDto[] }`), **somente** do usuário da sessão, ordenadas do mais recente para o mais antigo, no máximo 50.
  - `GET /orders/:id` → `orderResponseSchema`, agora com `item.ticket = { code, status }` quando o item tem ingresso (`status` vem de `ticketStatusFor(order.status)`), ou `null` quando não tem.

- [ ] **Step 1: Escreva os testes que falham (rotas)**

Em `apps/api/src/modules/orders/routes/order.routes.spec.ts` (pt-BR), acrescente:

1. `GET /orders` sem sessão → **401** `unauthorized`;
2. `GET /orders` com sessão anônima → **401** `unauthorized`;
3. `GET /orders` com sessão autenticada → **200** e a lista com o resumo do pedido (evento, status, valores, `itemCount`);
4. `GET /orders/:id` de outro usuário → **404** `order_not_found` (já existe, mantenha);
5. `GET /orders/:id` de um pedido `paid` com dois itens e dois ingressos → o item traz `ticket: { code, status: 'valid' }` com o código de cada ingresso;
6. `GET /orders/:id` de um pedido `expired` (com ingresso emitido) → o item traz `ticket: { code, status: 'invalid' }`;
7. `GET /orders/:id` de um pedido `pending` → o item traz `ticket: null`.

Em `apps/api/src/modules/orders/routes/order.routes.integration.spec.ts`, acrescente o caso do histórico com **dois pedidos de usuários diferentes**: o histórico do usuário A só traz o pedido dele.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/routes`
Expected: FAIL — `GET /orders` não existe (404) e o item não traz `ticket`.

- [ ] **Step 3: O histórico no repositório de pedidos**

- `order-entity.ts`: acrescente `OrderSummaryRecord` (bloco acima).
- `order-repository.ts`: acrescente `listByUser(input: { userId: string; limit: number })`.
- `drizzle-order-repository.ts`: implemente com uma consulta que traz os pedidos do usuário (`where user_id = ?`), o `count` de itens por pedido e `order by created_at desc limit ?` — uma única query com `left join` na tabela de itens e `count` agrupado por pedido.
- `in-memory-order-repository.ts`: mesma assinatura, filtrando por `userId`, ordenando por `createdAt` decrescente e cortando em `limit` (`itemCount` = número de itens do pedido).

- [ ] **Step 4: A busca em lote dos eventos**

- `events-repository.ts`: acrescente `findBySlugs(slugs: string[]): Promise<EventEntity[]>`.
- `drizzle-events-repository.ts`: implemente com **um** select filtrando por `inArray(events.slug, slugs)`, devolvendo `EventEntity` (o mesmo mapeamento do `findAll`, sem os setores). Lista vazia devolve `[]` sem consultar.

- [ ] **Step 5: A rota do histórico**

Em `apps/api/src/modules/orders/routes/order.routes.ts`, registre `app.get('/orders', ...)`:

- sem sessão ou sessão anônima → **401** `unauthorized`;
- `const orders = await deps.orderRepository.listByUser({ userId: session.userId, limit: 50 })`;
- resolve os eventos em lote: `const events = await deps.eventsRepository.findBySlugs(orders.map((order) => order.eventSlug))` e indexa por `slug`;
- responde `orderListResponseSchema.parse({ orders: orders.map((order) => ({ id, eventSlug, eventTitle: event?.title ?? order.eventSlug, eventStartsAt: event?.startsAt ?? <data do pedido>, status, subtotalCents, serviceFeeCents, totalCents, itemCount, createdAt: order.createdAt.toISOString() })) })`.

**Regra de degradação**: se o evento do pedido não existir mais (evento removido do catálogo), a resposta **não** quebra — `eventTitle` cai para o `eventSlug` e `eventStartsAt` para a data de criação do pedido. A tela precisa mostrar o pedido mesmo sem o evento.

- [ ] **Step 6: O detalhe com o ingresso**

No mesmo arquivo, `GET /orders/:id` passa a buscar os ingressos (`deps.ticketRepository.findByOrderId(order.id)`), indexa por `orderItemId` e monta o item com `ticket: ticket ? { code: ticket.code, status: ticketStatusFor(order.status) } : null`. O `serializeOrder` recebe o mapa de ingressos como segundo parâmetro (opcional); quando ausente, `ticket: null`.

- [ ] **Step 7: O wiring**

Em `apps/api/src/app.ts`, passe `ticketRepository` e `eventsRepository` para `registerOrderRoutes` e acrescente os dois campos ao tipo `OrderRoutesDeps`.

- [ ] **Step 8: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders src/modules/events`
Expected: PASS.

- [ ] **Step 9: Verifique e commit**

Run: `pnpm --filter @ticketvibe/api test` (suíte completa — reporte o total), `pnpm --filter @ticketvibe/api exec tsc --noEmit` e `pnpm --filter @ticketvibe/api exec biome check src`
Expected: tudo limpo.

```bash
git add apps/api/src
git commit -m "feat(api): add the order history route and the ticket details"
```

---

### Task 4: O proxy do web e a página de conta

**Files:**
- Create: `apps/web/src/app/api/orders/route.ts`
- Create: `apps/web/src/app/api/orders/route.spec.ts`
- Create: `apps/web/src/app/conta/page.tsx`
- Create: `apps/web/src/components/account-orders.tsx`
- Create: `apps/web/src/components/account-orders.spec.tsx`
- Modify: `apps/web/src/components/auth-menu.tsx` (link "Minha conta")
- Modify: `apps/web/src/components/auth-menu.spec.tsx`

**Interfaces:**
- Consumes: `orderListResponseSchema`/`OrderSummaryDto` (Task 1), `formatBRL`/`formatDatePtBR` (shared, ticket 14).
- Produces:
  - `apps/web/src/app/api/orders/route.ts`: `export async function GET(request: Request): Promise<Response>` — proxy do histórico, repassando o `cookie` para `GET {API_URL}/orders` e validando com `orderListResponseSchema` (mesmo formato do proxy `api/orders/[id]/route.ts`: `upstream_error` com 502 quando a API não responde ou quebra o contrato).
  - `apps/web/src/components/account-orders.tsx`:
    ```ts
    export interface AccountOrdersProps {
      orders: OrderSummaryDto[];
    }
    export function AccountOrders({ orders }: AccountOrdersProps): JSX.Element;
    ```
    Renderiza um `<ul>` com um `<li>` por pedido: título do evento, data do evento, status (rótulo em pt-BR), total e a quantidade de ingressos; cada item é um `<Link href={`/conta/pedidos/${order.id}`}>`.
  - `apps/web/src/app/conta/page.tsx`: página cliente que busca `/api/orders`; **401** → redireciona para `/entrar`; erro → mensagem "Não foi possível carregar seus pedidos."; lista vazia → "Você ainda não fez nenhum pedido."

- [ ] **Step 1: Escreva o teste que falha (proxy com MSW)**

Crie `apps/web/src/app/api/orders/route.spec.ts` no padrão de `apps/web/src/app/api/orders/[id]/route.spec.ts` (MSW com `setupServer`, `http.get('http://localhost:3001/orders', ...)`):

- a API devolve `{ orders: [...] }` → o proxy responde **200** com o mesmo corpo;
- a API responde **401** → o proxy repassa **401** e o corpo `{ error: 'unauthorized' }`;
- a API devolve um corpo que quebra o contrato → o proxy responde **502** `{ error: 'upstream_error' }`;
- o proxy repassa o `cookie` do request para a chamada upstream (assert no handler do MSW).

- [ ] **Step 2: Escreva o teste que falha (componente com MSW)**

Crie `apps/web/src/components/account-orders.spec.tsx` (MSW + `render`/`screen`): com um pedido `paid` (evento "O Fantasma da Ópera", total 13200, `itemCount: 1`), a tela mostra o título do evento, "R$ 132,00" e um link para `/conta/pedidos/<id>`; com a lista vazia, mostra "Você ainda não fez nenhum pedido.".

- [ ] **Step 3: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/orders src/components/account-orders`
Expected: FAIL — os arquivos ainda não existem.

- [ ] **Step 4: O proxy**

Implemente `apps/web/src/app/api/orders/route.ts` copiando a estrutura de `apps/web/src/app/api/orders/[id]/route.ts` (mesmo `API_URL`, mesmo `isUpstreamError`, mesmo `AbortSignal.timeout(3000)`, mesmo tratamento de `upstream_error`).

- [ ] **Step 5: A página e o componente**

- `apps/web/src/components/account-orders.tsx`: componente de servidor (sem `'use client'`) que recebe `orders` e renderiza a lista; o rótulo de status vem de um mapa local `pending`/`paid`/`failed`/`expired` → "Aguardando pagamento" / "Pagamento confirmado" / "Pagamento não confirmado" / "Pedido expirado".
- `apps/web/src/app/conta/page.tsx`: componente **cliente** (`'use client'`) que busca `/api/orders` no `useEffect`, com os estados de carregamento ("Carregando seus pedidos..."), erro e lista vazia; em **401** redireciona para `/entrar` com `useRouter().push('/entrar')`.

- [ ] **Step 6: O link "Minha conta"**

Em `apps/web/src/components/auth-menu.tsx`, para o usuário logado, renderize um `<Link href="/conta">Minha conta</Link>` antes do botão "Sair" (mesmo estilo do link "Entrar" já existente). Atualize `apps/web/src/components/auth-menu.spec.tsx` para esperar esse link.

- [ ] **Step 7: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/api/orders src/components/account-orders src/components/auth-menu`
Expected: PASS.

- [ ] **Step 8: Verifique e commit**

Run: `pnpm --filter @ticketvibe/web exec tsc --noEmit` e `pnpm --filter @ticketvibe/web exec biome check src`
Expected: limpos.

```bash
git add apps/web/src
git commit -m "feat(web): add the account page with the order history"
```

---

### Task 5: O detalhe do pedido com os QR Codes

O QR é renderizado no cliente a partir do código que a API devolve — a API não conhece imagem, só o código.

**Files:**
- Modify: `apps/web/package.json` (dependência `qrcode.react`)
- Create: `apps/web/src/components/ticket-qr.tsx`
- Create: `apps/web/src/components/ticket-qr.spec.tsx`
- Create: `apps/web/src/components/order-tickets.tsx`
- Create: `apps/web/src/components/order-tickets.spec.tsx`
- Create: `apps/web/src/app/conta/pedidos/[id]/page.tsx`
- Modify: `apps/web/src/app/api/orders/[id]/route.ts` (o contrato do item mudou — o proxy já valida com o schema novo)

**Interfaces:**
- Consumes: `orderResponseSchema`/`OrderDto` (Task 1), `OrderTicketDto` (Task 1), `formatBRL` (shared).
- Produces:
  - `apps/web/src/components/ticket-qr.tsx`:
    ```ts
    export interface TicketQrProps {
      code: string;
      size?: number;
    }
    export function TicketQr({ code, size = 192 }: TicketQrProps): JSX.Element;
    ```
    Renderiza `<QRCodeSVG value={code} size={size} />` (de `qrcode.react`) dentro de um `<figure>` com `aria-label="QR Code do ingresso"`, e **debaixo** o código em texto monoespaçado (`<code>{code}</code>`) para conferência manual.
  - `apps/web/src/components/order-tickets.tsx`:
    ```ts
    export interface OrderTicketsProps {
      order: OrderDto;
    }
    export function OrderTickets({ order }: OrderTicketsProps): JSX.Element;
    ```
    Um cartão por item do pedido: setor (`sectorName ?? sectorSlug`), fila, cadeira, tipo, preço, o `TicketQr` e o selo de validade — "Válido para entrada" quando `ticket.status === 'valid'`, "Ingresso não válido para entrada" quando `'invalid'`. Item sem ingresso (`ticket === null`): mostra "Ingresso ainda não emitido" e **não** renderiza QR.
  - `apps/web/src/app/conta/pedidos/[id]/page.tsx`: página cliente que busca `/api/orders/<id>` e renderiza o resumo do pedido (evento, status, valores) + `OrderTickets`.

- [ ] **Step 1: A dependência**

Run: `pnpm --filter @ticketvibe/web add qrcode.react@^4.2.0`
Expected: `apps/web/package.json` ganha `"qrcode.react": "^4.2.0"` e o lockfile é atualizado. Nenhuma outra dependência nova no repositório.

- [ ] **Step 2: Escreva o teste que falha (o componente do QR)**

Crie `apps/web/src/components/ticket-qr.spec.tsx` (descrições em pt-BR): renderizar `<TicketQr code="abc123" />` produz um `svg` com `aria-label` "QR Code do ingresso" **e** o texto `abc123` visível.

- [ ] **Step 3: Escreva o teste que falha (a lista de ingressos)**

Crie `apps/web/src/components/order-tickets.spec.tsx`: com um pedido `paid` de um item **com** ingresso (`{ code: 'abc123', status: 'valid' }`), a tela mostra "Plateia · Fila A · Cadeira 6", "R$ 120,00", o selo "Válido para entrada" e o QR; com `status: 'invalid'`, mostra "Ingresso não válido para entrada" e o QR continua visível; com `ticket: null`, mostra "Ingresso ainda não emitido" e **não** existe `svg` na tela.

- [ ] **Step 4: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/ticket-qr src/components/order-tickets`
Expected: FAIL — os componentes ainda não existem.

- [ ] **Step 5: O componente do QR**

Crie `apps/web/src/components/ticket-qr.tsx` com `'use client'`, importando `{ QRCodeSVG }` de `qrcode.react`. Envolva o SVG num `<figure aria-label="QR Code do ingresso">` e mostre o código em `<code>` abaixo.

- [ ] **Step 6: A lista de ingressos**

Crie `apps/web/src/components/order-tickets.tsx` (servidor) conforme a interface acima, reaproveitando `formatBRL` do `@ticketvibe/shared` e o nome do setor (`item.sectorName ?? item.sectorSlug`).

- [ ] **Step 7: A página do detalhe**

Crie `apps/web/src/app/conta/pedidos/[id]/page.tsx` (cliente): busca `/api/orders/<id>` (mesma mecânica de `apps/web/src/lib/use-order-status.ts`, mas sem polling — uma leitura só), com os estados de carregamento ("Carregando o pedido..."), erro ("Não foi possível carregar o pedido.") e **404** ("Pedido não encontrado."). Renderize o resumo (evento pela data, status, total) e `<OrderTickets order={order} />`.

- [ ] **Step 8: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/ticket-qr src/components/order-tickets src/app/api/orders`
Expected: PASS.

- [ ] **Step 9: Verifique e commit**

Run: `pnpm --filter @ticketvibe/web exec tsc --noEmit` e `pnpm --filter @ticketvibe/web exec biome check src`
Expected: limpos.

```bash
git add apps/web/package.json apps/web/src pnpm-lock.yaml
git commit -m "feat(web): render the ticket QR code on the order detail"
```

---

### Task 6: E2E — comprar e ver o QR na conta

**Files:**
- Create: `apps/web/tests/e2e/account.spec.ts`

**Interfaces:**
- Consumes: `registerVerifiedBuyer` (`helpers/auth.ts`), `approvePayment` (`helpers/checkout.ts`, extraído no ticket 14), `readLatestOrder` (`helpers/orders.ts`), `restoreSeat`/`deleteOrdersByBuyer`/`deletePaymentEvents` (`helpers/db.ts` e `helpers/orders.ts`).
- Produces: o spec `compra libera o ingresso digital com QR Code na conta`.

- [ ] **Step 1: Escreva o spec E2E**

Crie `apps/web/tests/e2e/account.spec.ts` (título em pt-BR): `compra libera o ingresso digital com QR Code na conta`. Sequência: `registerVerifiedBuyer` → escolher `Cadeira 1, fila A` → "Finalizar compra" → "Pagar" → `readLatestOrder` → `approvePayment` (webhook assinado) → esperar a tela "Pedido confirmado" → ir para `${WEB}/conta` → o pedido aparece na lista → clicar no pedido → a página do detalhe mostra `Plateia · Fila A · Cadeira 1`, o selo "Válido para entrada" e um `svg` com o `aria-label` "QR Code do ingresso".

Higiene igual à do `checkout.spec.ts`: `test.setTimeout(60_000)`, `afterEach` com `restoreSeat('1')`, `deleteOrdersByBuyer([...buyerEmails])`, `deletePaymentEvents([...providerEventIds])` e limpeza dos sets.

- [ ] **Step 2: Rode o spec (ele é a prova de que a engrenagem inteira funciona)**

Este spec é escrito **depois** da implementação (Tasks 1-5): ele não tem um RED sintético, e sim uma prova de que emissão do ingresso → rota → página → QR funcionam em conjunto. Ele deve **passar** na primeira execução.

Run: `pnpm --filter @ticketvibe/web exec playwright test tests/e2e/account.spec.ts`
Expected: PASS. Se falhar, a falha é do **produto** (emissão do ingresso na captura, rota do histórico, rota do detalhe, página ou QR) — investigue e corrija o código do produto; **nunca** afrouxe a asserção para o teste passar.

- [ ] **Step 3: Rode o spec junto dos de checkout**

Run: `pnpm --filter @ticketvibe/web exec playwright test tests/e2e/account.spec.ts tests/e2e/checkout.spec.ts tests/e2e/checkout-email.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 4: Verifique a suíte E2E inteira**

Run: `pnpm --filter @ticketvibe/web exec playwright test`
Expected: PASS (os 31 anteriores + 1 novo = 32). Rode o spec novo **duas vezes seguidas** e reporte os dois resultados — o e-mail/QR de um teste não pode vazar para o outro.

- [ ] **Step 5: Verifique e commit**

Run: `pnpm --filter @ticketvibe/web exec tsc --noEmit` e `pnpm --filter @ticketvibe/web exec biome check tests`
Expected: limpos.

```bash
git add apps/web/tests/e2e
git commit -m "test(web): cover the digital ticket on the account end to end"
```

---

### Task 7: Gates finais e fechamento da issue 15

**Files:**
- Modify: `.scratch/ticketvibe/issues/15-ingresso-digital-com-qr-e-historico.md`

- [ ] **Step 1: Rode os gates**

Run, em sequência: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @ticketvibe/web exec playwright test`, `pnpm build`, `pnpm --filter @ticketvibe/api exec drizzle-kit check`.
Expected: lint 0 erros (1 info pré-existente em `db/test-helpers.ts`), typecheck 5/5, suíte completa verde, E2E verde, build ok, drizzle limpo. **Reporte os números reais** (total de testes por workspace e o total do E2E).

- [ ] **Step 2: Feche a issue**

Em `.scratch/ticketvibe/issues/15-ingresso-digital-com-qr-e-historico.md`: `Status: ready-for-agent` → `Status: done`; marque os 5 critérios com `[x]`; acrescente as seções **Implementação** (tabela Task|Commit|Escopo com os SHAs reais) e **Gates finais** (com os números do Step 1); acrescente **Deferrals**:
- o QR Code é renderizado no cliente a partir de um código opaco; o conteúdo do QR é o código puro (não uma URL) — o link "abrir o ingresso" fica para o ticket 20 (validação na entrada);
- o histórico mostra no máximo os **50 pedidos mais recentes**, sem paginação;
- não há registro de "check-in" (uso do ingresso): ele nasce com o ticket 20;
- a validade do ingresso é derivada do status do pedido; um reembolso (ticket 21) invalida o ingresso por consequência, sem rotina extra;
- o e-mail de confirmação (ticket 14) continua sem QR — o QR aparece na conta;
- `sectorName` passou a integrar o contrato do item do pedido (o carrinho e a confirmation já usavam o nome), o que fecha o deferral registrado na issue 13/14.

- [ ] **Step 3: Commit**

```bash
git add .scratch/ticketvibe/issues/15-ingresso-digital-com-qr-e-historico.md
git commit -m "docs(agents): close ticket 15 with implementation notes"
```

Expected: working tree limpa e a sequência de commits do ticket 15 no topo da `main`.
