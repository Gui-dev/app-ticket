# Ticket 21 — Regras de-cancelamento-e-reembolso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Política de cancelamento por evento (janela + percentual) configurável no backoffice e fluxo de cancelamento/reembolso na conta do comprador, liberando o assento e invalidando o QR.

**Architecture:** Colunas de política em `events` (`cancellation_window_hours`, `refund_percent`) e `refund_cents` em `orders`; novo status de pedido `refunded`. Regra pura em `domain/refund-policy.ts`; transação de cancelamento no `SeatCaptureGateway` (order → `refunded` + assentos → `available` + deltas no broker). Provider ganha `refund(providerRef, amountCents?)` (Stripe refund parcial; cap do Stripe protege contra double-refund). Rota buyer `POST /orders/:id/cancel`; UI do comprador mostra botão `Cancelar pedido` e veredito `Reembolsado`.

**Tech Stack:** Next.js (web), Fastify + Drizzle (API), Zod (shared), Vitest, Playwright, Stripe SDK.

**Spec:** `.scratch/ticketvibe/issues/21-regras-de-cancelamento-e-reembolso.md`

## Global Constraints

- Branch `main` direto; commits Conventional, inglês e imperativo.
- Sem comentários de código; sem `--no-verify`; UI/testes de componente (web) e specs de API em pt-BR.
- **Exceção:** `packages/shared/src/index.spec.ts` em inglês.
- Migrações SOMENTE via drizzle-kit generate (`pnpm --filter @ticketvibe/api db:generate`); nunca editar SQL gerado.
- `playwright.config.ts` / `global-setup.ts` intocáveis; `pnpm infra:down` proibido; não tocar em `.github/`.
- Nenhuma dependência nova.
- Sem diálogo de confirmação no cancelamento (clique único); sem outbox de reembolso; `has_orders` continua contando pedidos refunded.

## Review Focus

1. **Corrida de cancelamento duplo** — dois requests simultâneos: a tx do gateway só marca `WHERE status='paid'` (2º → 409 `order_not_cancellable`); fake provider dedup por ref; Stripe recusa refund acima do total. Teste em T2.
2. **Borda da janela** — `now === startsAt − windowHours` deve ser PERMITIDO (inclusivo). Teste em T2 (unitário da policy).
3. **Percentual 0** — negado (`refund_not_allowed`) sem NENHUMA mudança de estado (order segue `paid`, assentos intactos). Teste em T2.
4. **Erro do provider (502)** — order permanece `paid`, assentos ocupados, retry permitido. Teste em T2.
5. **Deltas `available` no broker** — assento liberado deve publicar delta websocket. Teste em T2.
6. **Pedido de outro usuário → 404** (nunca 403/vazamento). Teste em T2.

---

### Task 1: Shared — status `refunded`, `refundCents`, política no evento

**Files:**
- Modify: `packages/shared/src/index.ts` (~:322 `orderStatusSchema`, ~:351 `orderSchema`, schemas do organizer event)
- Test: `packages/shared/src/index.spec.ts`

**Interfaces:**
- Produces (T2–T5 consomem): `OrderStatus` inclui `'refunded'`; `OrderDto.refundCents: number | null`; `organizerEventDtoSchema` e `organizerEventCreateSchema` aceitam `cancellationWindowHours?: number` (0–2160) e `refundPercent?: number` (0–100), ambos `.optional()` (não quebrar fixtures MSW existentes; ausência = defaults 24/100).

- [ ] **Step 1: Escrever testes falhando** (em inglês) em `packages/shared/src/index.spec.ts`:

```ts
describe('orderStatusSchema', () => {
  it('accepts the refunded status', () => {
    expect(orderStatusSchema.safeParse('refunded').success).toBe(true);
  });
});

describe('orderSchema', () => {
  it('accepts a nullable refundCents', () => {
    const parsed = orderSchema.shape.refundCents.safeParse(null);
    expect(parsed.success).toBe(true);
  });
});

describe('organizer event policy fields', () => {
  it('accepts cancellationWindowHours and refundPercent', () => {
    const input = { cancellationWindowHours: 24, refundPercent: 70 };
    expect(organizerEventDtoSchema.shape.cancellationWindowHours.safeParse(24).success).toBe(true);
    expect(organizerEventDtoSchema.shape.refundPercent.safeParse(70).success).toBe(true);
    expect(organizerEventDtoSchema.shape.refundPercent.safeParse(101).success).toBe(false);
  });
  it('keeps policy fields optional', () => {
    const { cancellationWindowHours, refundPercent, ...rest } = {} as Record<string, never>;
    expect(organizerEventDtoSchema.safeParse(rest).success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL nos novos testes

- [ ] **Step 3: Implementar** em `packages/shared/src/index.ts`:
  - `orderStatusSchema`: adicionar `'refunded'` ao enum.
  - `orderSchema`: adicionar `refundCents: z.number().int().min(0).nullable()`.
  - `organizerEventCreateSchema` e `organizerEventDtoSchema`: adicionar `cancellationWindowHours: z.number().int().min(0).max(2160).optional()` e `refundPercent: z.number().int().min(0).max(100).optional()`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: PASS (suíte inteira)

- [ ] **Step 5: Verificar que nada quebrou a jusante**

Run: `pnpm --filter @ticketvibe/api test && pnpm --filter web test`
Expected: PASS. Se um switch/`Record<OrderStatus, …>` reclamar de falta de `refunded`, NÃO mexa ainda — os rótulos são da T3/T4; note o arquivo para a task certa.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat: add refunded order status and event cancellation policy contracts"
```

### Task 2: API — migração, política, gateway, use-case e rota de cancelamento

**Files:**
- Modify: `apps/api/src/db/schema.ts` (events + policy, orders + refund_cents)
- Create: migração via drizzle-kit (`apps/api/drizzle/0015_*.sql`)
- Modify: `apps/api/src/modules/payments/domain/payment-provider.ts:33`, `apps/api/src/modules/payments/infra/fake-payment-provider.ts` (+spec), `apps/api/src/modules/payments/infra/stripe-payment-provider.ts` (+spec)
- Create: `apps/api/src/modules/orders/domain/refund-policy.ts` (+spec), `apps/api/src/modules/orders/use-cases/cancel-order.use-case.ts` (+spec)
- Modify: `apps/api/src/modules/orders/domain/seat-capture-gateway.ts`, `apps/api/src/modules/orders/infra/drizzle-seat-capture-gateway.ts`
- Modify: `apps/api/src/modules/orders/routes/order.routes.ts` (+spec de integração), `apps/api/src/app.ts` (~:335 wiring)

**Interfaces:**
- Consumes (T1): `OrderStatus` com `refunded`.
- Produces (T3/T5): `POST /api/orders/:id/cancel` → 200 `{ order }` (order com `status: 'refunded'` e `refundCents`); erros: 401 não autenticado; 404 `order_not_found` (também quando não é dono); 409 `order_not_cancellable` (status ≠ paid) e `refund_window_closed` / `refund_not_allowed` (política); 502 `refund_provider_error`.
- Produces: `refundOutcomeFor({ now, startsAt, windowHours, refundPercent }) → 'allowed' | 'window_closed' | 'not_allowed'`; `refundAmountFor(totalCents, refundPercent) → number` (`Math.round(total * percent / 100)`).
- Produces: `PaymentProvider.refund(providerRef: string, amountCents?: number)`.
- Produces: `SeatCaptureGateway.cancelPaidOrder(input: { orderId: string; refundCents: number }): Promise<{ kind: 'refunded' } | { kind: 'not_paid' }>`.
- Produces: `CancelOrderUseCase` (injetado em `OrderRoutesDeps.cancelOrder`), retorna discriminated `CancelOrderResult` mapeado pela rota.

- [ ] **Step 1: Migração** — em `apps/api/src/db/schema.ts`: em `events`, adicionar `cancellationWindowHours: integer('cancellation_window_hours').notNull().default(24)` e `refundPercent: integer('refund_percent').notNull().default(100)`; em `orders`, `refundCents: integer('refund_cents')`. Gerar migração:

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: novo arquivo `apps/api/drizzle/0015_*.sql` com as 3 colunas (NOT editar o SQL)

Run: `pnpm --filter @ticketvibe/api db:migrate` (env local)
Expected: migração aplicada

- [ ] **Step 2: Provider com amount** — em `payment-provider.ts` mudar a assinatura para `refund(providerRef: string, amountCents?: number): Promise<void>`; no fake, dedupe por ref permanece (chamada repetida é no-op, amount ignorado); no Stripe, `refunds.create({ payment_intent: ref, amount: amountCents })` quando amount definido, sem `amount` (full) quando indefinido. Atualizar `fake-payment-provider.spec.ts` e `stripe-payment-provider.spec.ts`: Stripe — spyOn `refunds.create` e asserir chamada com `{ payment_intent, amount }` no refund parcial.

Run: `pnpm --filter @ticketvibe/api test src/modules/payments`
Expected: PASS

- [ ] **Step 3: TDD da regra pura** — `domain/refund-policy.ts` com `refundOutcomeFor` e `refundAmountFor`. Nomear os testes em pt-BR (spec de API) em `domain/refund-policy.spec.ts`: janela aberta → `allowed`; `now === startsAt − window` → `allowed` (inclusivo); `now` depois → `window_closed`; percent 0 → `not_allowed`; janela 0 com `now < startsAt` → `allowed`; `refundAmountFor(9000, 70) === 6300` e `refundAmountFor(999, 50) === 500`.

Run: `pnpm --filter @ticketvibe/api test src/modules/orders/domain/refund-policy`
Expected: FAIL → implementar → PASS

- [ ] **Step 4: TDD do gateway** — em `domain/seat-capture-gateway.ts` adicionar `cancelPaidOrder` (port acima). Em `drizzle-seat-capture-gateway.ts`, tx: `UPDATE orders SET status='refunded', refund_cents=$ WHERE id=$ AND status='paid'`; 0 rows → `{ kind: 'not_paid' }`; assentos dos order items com `status='occupied'` → `available`; `broker.publish` deltas com status `'available'`; retorna `{ kind: 'refunded' }`. Testes de integração (seguir o padrão do spec do `confirmPaidOrder` existente): order pago → refunded + refund_cents gravado + seats available + deltas; order não-pago/id inexistente → `{ kind: 'not_paid' }` (testes em pt-BR).

Run: `pnpm --filter @ticketvibe/api test src/modules/orders/infra/drizzle-seat-capture-gateway`
Expected: FAIL → implementar → PASS

- [ ] **Step 5: TDD do use-case** — `use-cases/cancel-order.use-case.ts` com deps `{ orderRepository, eventsRepository, seatGateway, paymentProvider, now: () => Date }`; fakes inline no spec (padrão do spec do confirm use-case; gateway fake inline). Fluxo: `findById` → null ou userId ≠ owner → `{ code: 'order_not_found' }` (rota → 404); status ≠ `'paid'` → `order_not_cancellable`; política via `eventsRepository.findBySlugs([order.eventSlug])` (event do order; usar os campos novos); `refundOutcomeFor` → `window_closed`/`not_allowed` nos erros 409; `allowed` → `amount = refundAmountFor(order.totalCents, event.refundPercent)`; `paymentProvider.refund(order.providerRef, amount)` com try/catch → `refund_provider_error`; `seatGateway.cancelPaidOrder({ orderId, refundCents: amount })` → `not_paid` → `order_not_cancellable`; senão → `{ code: 'ok', refundCents: amount }`. Specs (pt-BR), um por ramo: feliz (order refunded + fake provider recebeu amount), janela fechada, percent 0, não-pago, não-dono/404, provider error (fake que lança — order NÃO marca), corrida (gateway responde `not_paid` → 409).

Run: `pnpm --filter @ticketvibe/api test src/modules/orders/use-cases/cancel-order`
Expected: FAIL → implementar → PASS

- [ ] **Step 6: TDD da rota + wiring** — em `order.routes.ts`: `OrderRoutesDeps` ganha `cancelOrder`; rota `POST /orders/:id/cancel`, autenticação igual às demais rotas de order (401AnonymousError → 401), owner/uso do use-case; erros mapeados: 404 `order_not_found`, 409 `order_not_cancellable`|`refund_window_closed`|`refund_not_allowed`, 502 `refund_provider_error`; sucesso → 200 `orderResponseSchema` com order atualizado (`refunded` + `refundCents`). `serializeOrder` inclui `refundCents` do record. Specs de integração em pt-BR cobrindo os Review Focus 1–6 (corrida duplo-cancel com fake provider dedupée; borda inclusiva via data injetada; percent 0 sem mudança de estado; provider error deixa order `paid` + assentos intactos; deltas `available` publicados; pedido alheio → 404). Invalidação do QR é automática (order `refunded` → `ticketStatusFor` deriva `invalid`) — assertar num teste de integração que o ticket do pedido cancelado volta com status `invalid`. Wiring em `app.ts`: instanciar `CancelOrderUseCase` com `paymentProvider` e passar em `registerOrderRoutes`.

Run: `pnpm --filter @ticketvibe/api test`
Expected: PASS (suíte inteira)

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat: add order cancellation with refund policy"
```

### Task 3: Web buyer — botão Cancelar pedido e veredito Reembolsado

**Files:**
- Modify: `apps/web/src/app/conta/pedidos/[id]/page.tsx` (+spec), `apps/web/src/components/account-orders.tsx`, `apps/web/src/components/order-confirmation.tsx` (+spec)

**Interfaces:**
- Consumes (T2): `POST /api/orders/:id/cancel` (`orderResponseSchema`); códigos de erro `order_not_cancellable`, `refund_window_closed`, `refund_not_allowed`, `refund_provider_error`; status `refunded`; `refundCents`.
- Produces: página de detalhe com botão `Cancelar pedido` visível somente para status `paid`.

- [ ] **Step 1: TDD do botão e do desfecho** — em `apps/web/src/app/conta/pedidos/[id]/page.spec.tsx` (MSW/patterns existentes, specs pt-BR): order `paid` renderiza botão com nome `Cancelar pedido`; order != `paid` não renderiza; clique no botão faz `POST /api/orders/:id/cancel`, troca o "chip" para `Reembolsado` e mostra linha `Reembolso de {formatBRL(order.refundCents)}`; resposta 409 `refund_window_closed` mostra, com `role="alert"`, `O período de cancelamento deste pedido já encerrou.`; 409 `not_allowed` → `A política de cancelamento deste evento não permite reembolso.`; 409 `order_not_cancellable` → `Este pedido não pode mais ser cancelado.`; 502 `refund_provider_error` → `Não foi possível processar o reembolso agora. Tente novamente.` (order na tela segue `Pagamento confirmado`). Sem diálogo de confirmação — clique único.
  - No `page.tsx`: `STATUS_LABELS` ganha `refunded: 'Reembolsado'`; handler `cancelOrder` com o fetch/parse e o mapa de erros local (padrão dos handlers existentes da página).

- [ ] **Step 2: Rótulos em lista e confirmação** — `account-orders.tsx` e `order-confirmation.tsx` ganham `refunded: 'Reembolsado'` em seus mapas de status; spec de `order-confirmation` atualizado com o caso `refunded`.

Run: `pnpm --filter web test`
Expected: FAIL nos novos → implementar → PASS (suíte toda)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat: let buyers cancel paid orders for refund"
```

### Task 4: Web organizer — política de cancelamento no editor

**Files:**
- Modify: `apps/web/src/app/organizador/eventos/[id]/page.tsx` (+spec)

**Interfaces:**
- Consumes (T1): `cancellationWindowHours` / `refundPercent` no `organizerEventDtoSchema` (opcionais).

- [ ] **Step 1: TDD da seção de política** — no spec do editor (pt-BR): o form mostra os campos com labels `Janela de cancelamento (horas)` e `Reembolso (%)`, valor default `24` / `100` quando fixture não traz os campos (`.optional()`); fixture COM campos mostra os valores; PATCH (handler existente, corpo completo) inclui os dois campos. Inputs numéricos,iguais aos `number` inputs existentes do editor.

- [ ] **Step 2: Implementar** no `page.tsx`: seção no form com os 2 inputs ligados ao state (init `event.cancellationWindowHours ?? 24` / `refundPercent ?? 100`), incluídos no body do PATCH.

Run: `pnpm --filter web test src/app/organizador`
Expected: FAIL → implementar → PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat: configure refund policy in event editor"
```

### Task 5: E2E — cancelar pedido e ver assento livre

**Files:**
- Create: `apps/web/tests/e2e/refund.spec.ts`

**Interfaces:**
- Consumes: helpers `tests/e2e/helpers/{auth,checkout,orders,db}.ts` (two-context: organizador + comprador); migração já aplicada no env (T2 empurra via `pnpm --filter @ticketvibe/api db:migrate`).

- [ ] **Step 1: Escrever a spec** — fluxo único (pt-BR locators role-based): organizador cria evento pela UI (política default 24h/100% — evento futuro, logo cancelável) → comprador compra 1 ingresso e paga → comprador abre `/conta/pedidos/{id}` → clica `Cancelar pedido` → vê `Reembolsado` e o valor do reembolso → abre o seatmap público do evento → assento comprado aparece como disponível.
  - Padrões de `checkout.spec.ts` / `reports.spec.ts` como referência; NADA em `playwright.config.ts` / `global-setup.ts`.

- [ ] **Step 2: Rodar** (com migração aplicada)

Run: `pnpm --filter web e2e -- refund.spec.ts`
Expected: PASS

Run: `pnpm --filter web e2e`
Expected: 37 + 1 = PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests
git commit -m "test: cover buyer refund and seat release e2e"
```

### Task 6: Gates e fechamento do ticket

- [ ] **Step 1: Gates completos**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @ticketvibe/shared test && pnpm --filter @ticketvibe/api test && pnpm --filter web test && pnpm --filter web e2e`
Expected: tudo verde (suítes API/web pt-BR, shared EN). Flake one-time conhecido na suíte API (ledger 18–20): re-run focado antes de concluir falha.

- [ ] **Step 2: Marcar checkboxes da issue** `.scratch/ticketvibe/issues/21-regras-de-cancelamento-e-reembolso.md` + Status: closed; commit `docs: close ticket 21 refund policies`.

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: pushed
