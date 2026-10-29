# Ticket 22 — Stripe Connect Split e Platform Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador conecta sua conta Stripe Express e, a cada venda de evento dele, a plataforma separa a taxa e transfere o líquido do organizador, com falha de repasse visível e reprocessável no backoffice.

**Architecture:** Onboarding Connect Express (account link) salva `stripe_account_id` no `user`. Cobrança original plataforma (charge full), com os três valores já gravados no pedido na origem (bruto = `totalCents`, taxa = `serviceFeeCents`, líquido = derivado). No sucesso do pagamento, um use-case de repasse cria a transfer separada (`transfer_group` = orderId, idempotency key `transfer-<orderId>`) para a conta conectada; status em `orders.transfer_status`; falha não perde a venda (order segue `paid`) e é reprocessável por rota própria. Página nova `/organizador/repasses` mostra a tabela de repasses (três valores + status) e o botão de conexão.

**Tech Stack:** Stripe SDK 23 (accounts/accountLinks/transfers), Fastify + Drizzle, Zod (shared), BullMQ worker, Vitest + MSW, Playwright.

**Spec:** `.scratch/ticketvibe/issues/22-stripe-connect-split-e-platform-fee.md`

## Global Constraints

- Branch `main` direto; commits Conventional, inglês e imperativo.
- Sem comentários de código; sem `--no-verify`; UI/testes de componente (web) pt-BR; API test descriptions pt-BR.
- **Exceção:** `packages/shared/src/index.spec.ts` em inglês.
- Migrações SOMENTE via drizzle-kit generate (`pnpm --filter @ticketvibe/api db:generate`); nunca editar SQL gerado.
- `playwright.config.ts` / `global-setup.ts` intocáveis; `pnpm infra:down` proibido; não tocar em `.github/`.
- Nenhuma dependência nova (Stripe SDK já presente).
- Fake provider é o default em dev/test (`PAYMENT_PROVIDER` divergente de stripe); specs de Stripe spyOn via `stripeClientOf`.
- Transfer NUNCA muda o status do pedido; falha de repasse deixa order `paid` reprocessável.
- Sem reversão de repasse em reembolso (deferred — nota no fechamento).

## Review Focus

1. **Evento de plataforma (`organizerId` null)** — venda sem organizador: nenhum repasse, `transfer_status` permanece `'none'`, sem erro/barulho. Teste em T3.
2. **Corrida reembolso × repasse** — t21 cancela logo após `confirmOrderPayment`: o job de repasse encontra order `refunded` → não transfere, marca `'skipped'`, sem retry devido. Teste em T3.
3. **Organizador desconectado na hora do repasse** — cobrança ok, `stripe_account_id` ausente ao transferir: `'skipped'` (não é falha; nada reprocessável), venda íntegra. Teste em T3.
4. **Retry em status não-falho** — `POST /organizer/payments/transfers/:orderId/retry` só processa `'failed'`; `'succeeded'`/`'none'`/`'skipped'` → 409 `transfer_not_retryable`; repeated retry em succeeded não retransfere (spies do repo fake). Teste em T3.
5. **Rounding exato dos três valores** — `splitAmounts(19999)` → `{ grossCents: 19999, platformFeeCents: 2000, organizerNetCents: 17999 }`; propriedade sempre exata: `fee + net === gross` (fee = 10% bps). Teste em T1.
6. **Idempotência da transfer no Stripe** — `transfers.create` com idempotencyKey `transfer-<orderId>`; segunda chamada (retry concorrente) devolve a mesma transfer sem duplicar. Reviewer do Stripe depois do fake. Teste em T2.

---

### Task 1: Shared — splitAmounts, transferStatus, DTOs de connect e repasses

**Files:**
- Modify: `packages/shared/src/index.ts` (~:300 helpers de fee; ~:343 `orderSchema`/order summaries; area de schemas do organizer)
- Test: `packages/shared/src/index.spec.ts`

**Interfaces:**
- Produces (T2–T5 consomem):
  - `splitAmounts(totalCents: number): { grossCents: number; platformFeeCents: number; organizerNetCents: number }` (usa `serviceFeeCents()` existente; garantia `gross = fee + net`).
  - `transferStatusSchema = z.enum(['none', 'pending', 'succeeded', 'failed', 'skipped'])`.
  - `orderSchema`/`orderSummarySchema` ganham `organizerNetCents: z.number().int().min(0).optional()` e `transferStatus: transferStatusSchema.optional()` (opcionais ⇒ nenhum fixture web quebra em T2).
  - `organizerConnectStatusSchema = z.object({ connected: z.boolean(), payoutsEnabled: z.boolean() })`.
  - `organizerConnectResponseSchema = z.object({ onboardingUrl: z.string().url().nullable() })`.
  - `organizerTransferEntrySchema = z.object({ orderId, eventTitle, eventSlug, grossCents, platformFeeCents, organizerNetCents, transferStatus, createdAt })`; `organizerTransfersResponseSchema = z.object({ transfers: z.array(...) })`.- [ ] **Step 1: Escrever testes falhando** (em inglês) em `packages/shared/src/index.spec.ts`: `splitAmounts(19999)` deep-equals `{ grossCents: 19999, platformFeeCents: 2000, organizerNetCents: 17999 }`; `splitAmounts(10000)` → fee 1000/net 9000; propriedade `fee + net === gross` nos dois casos; `transferStatusSchema` aceita as cinco strings e recusa `'unknown'`; schemas de connect/repasses parseiam um fixture mínimo válido.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL nos novos.

- [ ] **Step 3: Implementar** em `packages/shared/src/index.ts` conforme o Interfaces block (nenhum cálculo novo além de `splitAmounts` reaproveitando `serviceFeeCents`).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ticketvibe/shared test && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat: add split amounts and transfer status contracts"
```

### Task 2: API — migração, provider de connect e rotas de onboarding

**Files:**
- Modify: `apps/api/src/db/schema.ts` (`user` + `stripe_account_id` text nullable)
- Create: migração via drizzle-kit (`0016_*.sql`)
- Modify: `apps/api/src/modules/payments/domain/payment-provider.ts` (3 métodos novos), `apps/api/src/modules/payments/infra/fake-payment-provider.ts` (+spec), `apps/api/src/modules/payments/infra/stripe-payment-provider.ts` (+spec)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.ts` (+spec), `apps/api/src/app.ts` (wiring)

**Interfaces:**
- Consumes (T1): schemas de connect.
- Produces (T3/T4): `PaymentProvider.createConnectOnboarding(input: { userId: string }): Promise<{ accountId: string; onboardingUrl: string }>`; `getConnectAccount(accountId: string): Promise<{ payoutsEnabled: boolean }>` (T3 adiciona `transfer` à interface).
- Produces: rota `POST /organizer/payments/connect` (cria conta Express se faltar, persiste `user.stripe_account_id` via porta nova `StripeAccountStore`) e `GET /organizer/payments/connect` → `organizerConnectStatusSchema`. Fake: `createConnectOnboarding` retorna `acct_fake_<userId>` + url fake e já marca `payoutsEnabled: true` (ready-imediato para E2E); Stripe: `accounts.create({ type: 'express' })` → `accountLinks.create({ ... type: 'account_onboarding' })`; `getConnectAccount` = `accounts.retrieve(...).payouts_enabled`.
- Produces: `StripeAccountStore` (novo port, `apps/api/src/modules/payments/domain/stripe-account-store.ts`): `getByUserId(userId): Promise<{ stripeAccountId: string } | null>` e `setByUserId(userId, stripeAccountId)`; impls drizzle (`user.stripe_account_id`) + in-memory twin (padrão das twins existentes).

- [ ] **Step 1: Migração** — em `schema.ts`: `user.stripe_account_id` text nullable. Gerar via drizzle-kit (`pnpm --filter @ticketvibe/api db:generate`) e aplicar (`pnpm --filter @ticketvibe/api db:migrate`); nunca editar o SQL gerado.

- [ ] **Step 2: Provider TDD** — a interface `PaymentProvider` ganha `createConnectOnboarding` e `getConnectAccount` (transfer fica para T3). Specs pt-BR: fake — onboarding retorna `{ accountId: 'acct_fake_<userId>', onboardingUrl }` e marca a conta pronta (`getConnectAccount` → `payoutsEnabled: true`); Stripe — spyOn via `stripeClientOf(provider)`: `accounts.create` chamado com `{ type: 'express' }`; `accountLinks.create` chamado com `{ account, refresh_url, return_url, type: 'account_onboarding' }`; `getConnectAccount` retorna `payouts_enabled` do retrieve. URLs de refresh/return: `process.env.WEB_APP_URL ?? 'http://localhost:3000'` + `/organizador/repasses`.

- [ ] **Step 3: Idempotência de onboarding e rotas TDD** — POST connect: userId sem conta → cria, persiste via `StripeAccountStore`, devolve `{ onboardingUrl }`; userId com conta existente → reusa (não cria segunda), devolve `onboardingUrl` novo; GET status: sem conta → `{ connected: false, payoutsEnabled: false }`; com conta → `provider.getConnectAccount` → `{ connected: true, payoutsEnabled }`. Guard `guardOrganizer` como nas demais rotas do organizer. `app.ts` wiring com `paymentProvider` já em escopo.

Run: `pnpm --filter @ticketvibe/api test`
Expected: FAIL → implementar → PASS (suíte toda)

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat: add stripe connect onboarding for organizers"
```

### Task 3: API — fluxo de repasse e reprocesso

**Files:**
- Modify: `apps/api/src/db/schema.ts` (`orders.transfer_status` text `$type<TransferStatus>()` NOT NULL DEFAULT 'none'; `orders.transfer_ref` text nullable) + migração via drizzle-kit
- Create: `apps/api/src/modules/payments/use-cases/transfer-organizer-share.use-case.ts` (+spec)
- Modify: `apps/api/src/modules/orders/domain/order-repository.ts` (port + impls), `apps/api/src/modules/payments/jobs/process-payment-event.ts` (+spec), `apps/api/src/modules/organizer/routes/organizer.routes.ts` (+spec), `apps/api/src/modules/organizer/infra/{drizzle,in-memory}-organizer-repository.ts`, `apps/api/src/app.ts`

**Interfaces:**
- Consumes (T1): `transferStatusSchema`, `splitAmounts`.
- Consumes (T2): `StripeAccountStore.getByUserId`, `provider.getConnectAccount` (fake ready-imediato).
- Produces (T3): adiciona `PaymentProvider.transfer(input: { orderId: string; amountCents: number; destination: string }): Promise<{ transferRef: string }>`; fake injeta falha via estado próprio (ex.: `failNextTransfer`), Stripe usa `idempotencyKey: 'transfer-<orderId>'`.
- Produces (T4/T5): `GET /organizer/payments/transfers` → `organizerTransfersResponseSchema`; `POST /organizer/payments/transfers/:orderId/retry` → 200 `{ transferStatus: 'succeeded' | … }`; erros: 404 `order_not_found` (não-dono/unknown), 409 `transfer_not_retryable`.
- Produces: `OrderRepository.setTransfer(input: { orderId; status; transferRef? }): Promise<void>` (drizzle + in-memory);
  `OrganizerRepository.listOrderTransfers(organizerId: string): Promise<Array<{ orderId, eventTitle, eventSlug, grossCents, platformFeeCents, organizerNetCents, transferStatus, createdAt }>>` (join orders×orders→events para title; drizzle + in-memory com comportamento idêntico);
  `TransferOrganizerShareUseCase(input: { orderId }): Promise<'transferred' | 'skipped' | 'failed'>`.
- Produces: `process-payment-event` chama o use-case após confirm com sucesso; falha do repasse marca `'failed'` e o job COMPLETA (não derruba o pipeline de confirm/email).

- [ ] **Step 1: Migração** — colunas em `orders` conforme acima; gerar e aplicar (regras da seção Global Constraints).

- [ ] **Step 2: TDD do use-case** — fakes inline (padrão confirm/cancel), spec pt-BR, um teste por ramo:
  - sucesso: order `paid` + organizador conectado → `provider.transfer({ amountCents = splitAmounts(totalCents).organizerNetCents, destination: stripeAccountId })` → `setTransfer('succeeded', transferRef)` → retorna `'transferred'`;
  - evento de plataforma: `organizerId` null → `'skipped'`, transfer_status permanece `'none'` (nenhum write);
  - organizador desconectado → `'skipped'` + marca `'skipped'` (não reprocessável, cobre Review Focus 3);
  - order não-`paid` (refunded corrida) → `'skipped'`, status permanece igual (Review Focus 2);
  - provider lançando → `'failed'` + marca `'failed'` (Review Focus: order segue `paid`);
  - já `succeeded` → retorna sem chamar provider (guarda reentrada).

- [ ] **Step 3: TDD do worker** — `process-payment-event.spec.ts`: webhook `succeeded` → confirm + transfer executada; transfer falhando (fake injetando erro) → job não lança, ordem marcada `'failed'`, email de confirmação AINDA enfileirado; `failed`/`expired` de webhook não chamam transfer.

- [ ] **Step 4: TDD das rotas e listagem** — specs pt-BR (integração Postgres, padrão das specs individuais):
  - `GET /organizer/payments/transfers`: organizador com vendas próprias → lista com bruto/taxa/líquido exatos via `splitAmounts`; evento alheio/plataforma não aparece; ordenado por `createdAt` desc;
  - `POST .../retry`: `failed` → reinvoca use-case, 200; `'succeeded'`/`'none'`/`'skipped'` → 409 `transfer_not_retryable` (Review Focus 4); order alheio → 404 (nunca 403).

Run: `pnpm --filter @ticketvibe/api test`
Expected: FAIL → implementar → PASS (suíte toda; flake de seed paralelo → re-run focado antes de concluir)

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: transfer organizer share and allow retry"
```

### Task 4: Web organizer — página de repasses + conexão

**Files:**
- Modify: `apps/web/src/components/organizador-nav.tsx` (+spec se existir), `apps/web/src/lib/organizer-api.ts` (+spec)
- Create: `apps/web/src/app/organizador/repasses/page.tsx`, `apps/web/src/app/organizador/repasses/page.spec.tsx`, handler MSW em `apps/web/src/components/test-utils/msw` (localizar o home dos handlers, seguindo padrão)

**Interfaces:**
- Consumes (T1): `organizerConnectStatusSchema`/`organizerConnectResponseSchema`/`organizerTransfersResponseSchema`/`organizerTransferEntrySchema`/`transferStatusSchema`.
- Consumes (T2/T3): `POST /organizer/payments/connect`, `GET /organizer/payments/connect`, `GET /organizer/payments/transfers`, `POST /organizer/payments/transfers/:orderId/retry` (contrato acima).
- Consumes: `organizerNetCents`/`transferStatus` opcionais nas summaries (T1) se a página preferir reusar order summaries — não são necessários aqui.

- [ ] **Step 1: Helpers de API (TDD)** — em `organizer-api.ts` + spec (pt-BR): `fetchOrganizerConnectStatus`, `startOrganizerConnect` (POST → onboardingUrl | null), `fetchOrganizerTransfers`, `retryOrganizerTransfer(orderId)`.

- [ ] **Step 2: TDD da página** — specs pt-BR (MSW):
  - sem conta: página mostra pill `Não conectado` e link-âncora `Conectar Stripe` com o `onboardingUrl` (âncora real `target="_blank"`; sem pop-up programático);
  - com conta (`connected: true`): pill `Conta conectada; repasse automático` (e não mostra o link);
  - tabela de repasses: colunas com `formatBRL` para bruto/taxa/líquido exatos do fixture e rótulos de status: `none`→`Sem repasse`, `pending`→`Pendente`, `succeeded`→`Repasse enviado`, `failed`→`Falha no repasse`, `skipped`→`Não aplicável`;
  - linha `failed` mostra botão `Reprocessar repasse` que chama retry e recarrega a lista (após sucesso a linha vira `Repasse enviado`);
  - linha não-`failed` não mostra o botão;
  - estado vazio (`transfers: []`) → mensagem `Nenhum repasse ainda.`.

- [ ] **Step 3: Nav** — `organizador-nav.tsx` ganha item `Repasses` (rota `/organizador/repasses`); ajustar spec do nav se existir.

Run: `pnpm --filter web test`
Expected: FAIL → implementar → PASS (suíte toda; typecheck limpo)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat: organizer payouts page with connect onboarding"
```

### Task 5: E2E — vender com conta conectada e conferir valores

**Files:**
- Create: `apps/web/tests/e2e/repasses.spec.ts`

**Interfaces:**
- Consumes: helpers `tests/e2e/helpers/{auth,checkout,orders,db}.ts` (two-context: organizador + comprador); fake provider marca a conta pronta no onboarding (T2), então o status conecta sem interação externa; migração/já aplicadas pelo env (T2 empurra via `pnpm --filter @ticketvibe/api db:migrate`).

- [ ] **Step 1: Escrever a spec** — fluxo único (pt-BR, locators role-based): organizador abre `/organizador/repasses` → conecta (`Conectar Stripe` → pill `Conta conectada`) → cria evento pela UI → comprador compra 1 ingresso e paga (checkout helpers) → organizador recarrega `/organizador/repasses` → vê a linha do pedido com bruto/taxa/líquido exatos via `formatBRL` (usar o valor do assento conhecido dos helpers) e status `Repasse enviado`.
  - Padrões de `refund.spec.ts`/`checkout.spec.ts` como referência; NADA em `playwright.config.ts`/`global-setup.ts`.

- [ ] **Step 2: Rodar** (dev server out-of-band se o fluxo via Playwright flakar `ERR_CONNECTION_REFUSED` — nota ambiental conhecida)

Run: `pnpm --filter web test:e2e -- repasses.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests
git commit -m "test: cover connected sale payout e2e"
```

### Task 6: Gates e fechamento do ticket

- [ ] **Step 1: Gates completos**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @ticketvibe/shared test && pnpm --filter @ticketvibe/api test && pnpm --filter web test && pnpm --filter web test:e2e`
Expected: tudo verde (shared EN, restante pt-BR). Flake one-time → re-run focado antes de concluir.

- [ ] **Step 2: Marcar checkboxes da issue** `.scratch/ticketvibe/issues/22-stripe-connect-split-e-platform-fee.md` + Status: closed; commit `docs: close ticket 22 stripe connect split`.

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: pushed (flake de pre-push → re-run focado).
