# Ticket 19 — Relatórios de vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador vê, por evento e por período, quantos ingressos vendeu e quanto faturou (bruto, taxa da plataforma e líquido), com os números vindo exclusivamente dos pedidos confirmados.

**Architecture:** Novo método `salesReportForOrganizer` no port `OrganizerRepository` (in-memory + drizzle), agregando `orders`/`order_items` com `status = 'paid'`; use-case thin + rota `GET /organizer/events/:id/report` guard-first no módulo organizer existente; página client `/organizador/relatorios` no backoffice consumindo o endpoint via `organizer-api.ts`, com select de eventos e filtros de período.

**Tech Stack:** Drizzle ORM (SQL de agregação direto sobre `orders`/`order_items`), Zod schemas compartilhados, Fastify, Next.js 16 (client components, MSW nos specs, Playwright no E2E).

**Spec:** `.scratch/ticketvibe/issues/19-relatorios-de-vendas.md`

## Global Constraints

- Sem comentários de código; Conventional Commits em inglês/imperativo; sem `--no-verify`.
- UI e testes de componente (web) em pt-BR; descrições de testes da API em pt-BR; **exceção:** `packages/shared/src/index.spec.ts` em inglês.
- Sem novas dependências; sem migração (reports lê `orders`/`order_items` existentes — NÃO gerar drizzle-kit migration).
- Infra de pé (postgres/redis/mailpit): `pnpm infra:down` PROIBIDO; `playwright.config.ts` / `global-setup.ts` NUNCA tocados; nada em `.github/`.
- Rotas do organizer: `guardOrganizer` primeiro (401 `not_authenticated` → 403 `not_organizer`), depois ownership; ownership sempre rederivado do banco (nunca confiar em id vindo do cliente).
- Fonte única do relatório: pedidos confirmados (`orders.status = 'paid'`, janela por `orders.paid_at`); `subtotalCents = Σ order_items.priceCents` e a taxa da plataforma é `orders.serviceFeeCents` por pedido (SERVICE_FEE_BPS = 1000 — não recriar a conta).
- Task 6 fixou a semântica SP do editor: usar os helpers `toDateTimeLocalValue`/`fromDateTimeLocalValue` de `apps/web/src/lib/format.ts` nos inputs de período da página (não `new Date(local)`).
- Valores monetários na UI via `formatBRL` (`@/lib/format`).

## Review Focus

1. Pedidos não confirmados (`pending`/`failed`/`expired`) e pedidos fora da janela NÃO podem entrar no relatório — fantasma de receita é o erro mais caro deste ticket. Teste: integração "pedidos pendentes, falha/expiração ficam fora e janela recusa o resto" (Task 2).
2. Período na borda: `paidAt == from` entra (inclusivo), `paidAt == to` sai (exclusivo). Teste: integração "fronteira do período é inclusiva no início e exclusiva no fim" (Task 2).
3. Taxa e líquido: `platformFeeCents` = Σ `orders.serviceFeeCents` (pedido inteiro conta UMA vez, mesmo com vários itens) e `netCents = gross - fee`; uma rodapé com itens múltiplos não pode dobrar a taxa. Teste: integração "pedido com vários itens conta ingressos, bruto e taxa corretamente" (Task 2).
4. Ownership: relatório de evento da plataforma ou de outro organizador → 403 `event_forbidden`; não vazar existência (404 só quando o evento não existe). Teste: integração "dados da plataforma e evento alheio são 403" (Task 2).
5. Zero vendas: evento próprio sem pedidos pagos → 200 com zeros + `ordersCount 0` (a página mostra "Nenhuma venda no período.", não um erro). Teste: integração "evento sem vendas devolve zeros" (Task 2) + MSW na página (Task 3).

---

### Task 1: Contratos compartilhados do relatório

**Files:**
- Modify: `packages/shared/src/index.ts` (EOF, padrão do repo)
- Test: `packages/shared/src/index.spec.ts` (em inglês)

**Interfaces:**
- Consumes: nada (schemas domno EOF, como no ticket 18).
- Produces (o resto do plano importa exatamente estes nomes):
  - `organizerSalesReportSchema` = `{ eventId: z.uuid(), from: z.iso.datetime().nullable(), to: z.iso.datetime().nullable(), ticketsSold: z.number().int().min(0), ordersCount: z.number().int().min(0), grossCents: z.number().int().min(0), platformFeeCents: z.number().int().min(0), netCents: z.number().int().min(0) }` com `.refine` de invariantes: `netCents === grossCents - platformFeeCents`, `from === null OR to === null OR from < to`.
  - `organizerSalesReportResponseSchema` = `{ report: organizerSalesReportSchema }`.
  - `organizerSalesReportQuerySchema` = `z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() })` (query da rota).
  - Tipos: `OrganizerSalesReportDto` (z.infer do report), `OrganizerSalesReportQuery` (z.input do query).

- [ ] **Step 1: Testes que falham (inglês, arquivo existente em EN)**

Casos pinados: parse do report válido (todos os campos, `from`/`to` null permitidos); rejeita `netCents` incoerente (refine do invariante); rejeita `from >= to` quando ambos presentes; rejeita contagens/cents negativos; query schema aceita ausência de `from`/`to` e rejeita string de data inválida.

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL (schemas/type não definidos)

- [ ] **Step 3: Implementar schemas + tipos no EOF de `packages/shared/src/index.ts`**

Sem corpo além do zod pinado acima.

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: PASS (All 118+N)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add organizer sales report contracts"
```

### Task 2: Endpoint de agregação na API

**Files:**
- Modify: `apps/api/src/modules/organizer/domain/organizer-repository.ts` (port + record + result)
- Modify: `apps/api/src/modules/organizer/infra/in-memory-organizer-repository.ts`
- Modify: `apps/api/src/modules/organizer/infra/drizzle-organizer-repository.ts`
- Create: `apps/api/src/modules/organizer/use-cases/get-organizer-sales-report.use-case.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.ts` (nova rota ao fim do arquivo)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.spec.ts`
- Test: `apps/api/src/modules/organizer/routes/organizer.routes.integration.spec.ts` (estende fixtures diretas existentes)
- Test: `apps/api/src/modules/organizer/infra/in-memory-organizer-repository.spec.ts` (extende o spec do in-memory)

**Interfaces:**
- Consumes: Task 1 (`organizerSalesReportSchema`, `organizerSalesReportResponseSchema`, `organizerSalesReportQuerySchema`, `OrganizerSalesReportQuery`); guard `guardOrganizer` do ticket 17; padrão de fixtures com `x-test-user-id` do spec de integração existente.
- Produces:
  - `OrganizerSalesReportRecord` = `{ eventId: string; ticketsSold: number; ordersCount: number; grossCents: number; platformFeeCents: number; netCents: number }`.
  - Port (nome/signature verbatim): `salesReportForOrganizer(input: { eventId: string; userId: string; from: Date | null; to: Date | null }): Promise<SalesReportForOrganizerResult>` com `SalesReportForOrganizerResult = { kind: 'ok'; report: OrganizerSalesReportRecord } | { kind: 'not_found' } | { kind: 'forbidden' }`.
  - Use-case: `GetSalesReportUseCase` (`execute(input: ReportInput): Promise<SalesReportForOrganizerResult>`), pass-through como os demais do módulo.
  - Rota: `GET /organizer/events/:id/report?from=&to=` → guard → id válido (`eventIdSchema`; inválido → 404 `event_not_found`) → query `organizerSalesReportQuerySchema.safeParse` (falha → 400 `invalid_query`) → repo. Respostas: 200 `organizerSalesReportResponseSchema.parse` com `from`/`to` ecoando os parâmetros efetivos (null quando ausentes); 404 `{ error: 'event_not_found' }`; 403 `{ error: 'event_forbidden' }`.
  - Seed in-memory (extende `InMemoryOrganizerOrderSeed`): `{ eventId: string; seatIds?: string[]; status?: 'pending' | 'paid' | 'failed' | 'expired'; paidAt?: Date; serviceFeeCents?: number; items?: { priceCents: number }[] }` — status default `'paid'`, `paidAt` default `new Date()`, `serviceFeeCents` default `Math.round(sum(items)*0.1)`, `items` default `[{ priceCents: 0 }]` (assim os seeds de `has_orders` existentes não mudam de comportamento). Store novo agrega SEM toque nos stores de assentos/filas.

Semântica de agregação (binding, in-memory e drizzle):
- Escopo: evento com `events.organizer_id === userId` estrito (evento da plataforma e evento alheio → `forbidden`; inexistente → `not-found`).
- Pedidos: `status = 'paid'`, `paid_at >= from` (se from), `paid_at < to` (se to).
- `ticketsSold` = Σ itens; `grossCents` = Σ `order_items.price_cents`; `ordersCount` = nº de pedidos distintos; `platformFeeCents` = Σ `orders.service_fee_cents` (pedido conta uma vez); `netCents` = gross − fee (Zero quando não há pedidos).

- [ ] **Step 1: Testes unitários que falham (in-memory, descrições pt-BR)**

Casos pinados: ingressos/bruto/fee/líquido e ordersCount com pedidos seedados (incluindo 1 pedido com 2 itens); Review Focus itens 1, 2, 5.

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/organizer/infra` → FAIL.

- [ ] **Step 2: Implementar port + in-memory** (mesmo estilo dos métodos do ticket 18; agregação itera o store)

Run de novo → PASS (foco).

- [ ] **Step 3: Spec do use-case (1 caso: pass-through) + implementar `GetSalesReportUseCase`**

- [ ] **Step 4: Testes de integração que falham (fixtures diretas: user, event próprio, orders paid/pending/failed/expired com paid_at relativo e 1 pedido multi-item)**

Casos: feliz com números exatos vs seed (fixture cobre a borda do Review Focus 1 e do 2 — `paid_at` um segundo antes/depois de `from`/`to`); guard 401/403 anônimo/comprador; 400 `invalid_query` com `from >= to` e com string inválida; eco de `from`/`to` nullables na resposta. Run: `pnpm exec vitest run src/modules/organizer/routes` → FAIL.

- [ ] **Step 5: Implementar drizzle `salesReportForOrganizer` (SQL raw com parâmetros qualificados, mesmo cuidado de identificadores do ticket 18) + rota guard-first**

Run de novo → PASS.

- [ ] **Step 6: Suíte da API completa + typecheck**

Run: `pnpm --filter @ticketvibe/api test` e `pnpm --filter @ticketvibe/api typecheck` → PASS (85+N arquivos, 534+N testes).

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): add organizer sales report endpoint"
```

### Task 3: Página de relatórios no backoffice

**Files:**
- Modify: `apps/web/src/lib/organizer-api.ts` (nova export + mensagem de erro)
- Create: `apps/web/src/app/organizador/relatorios/page.tsx` (+ `page.spec.tsx`)
- Modify: `apps/web/src/components/organizador-nav.tsx` (NAV_ITEMS ganha `{ href: '/organizador/relatorios', label: 'Relatórios' }`; spec da nav: link presente e `aria-current` na rota)
- Modify: `apps/web/src/app/organizador/page.tsx` (SHORTCUTS ganha Relatórios → `/organizador/relatorios`; `page.spec` do painel fica com os atalhos)

**Interfaces:**
- Consumes: Task 1 (schemas/tipos), Task 2 (rota), `fetchOrganizerEvents()` e o estilo de fetch/erro de `organizer-api.ts` (ticket 5), helpers `toDateTimeLocalValue`/`fromDateTimeLocalValue`, `formatBRL`.
- Produces:
  - `fetchOrganizerSalesReport(eventId: string, period?: { from?: string; to?: string }): Promise<OrganizerSalesReportDto>` — fetch `/api/organizer/events/<id>/report?...` (usa `encodeURIComponent`), parse por `organizerSalesReportResponseSchema`, erro → `messageFor` pipeline existente. `ERROR_MESSAGES` ganha `invalid_query: 'Período inválido.'` (os demais códigos já mapeados).
  - Página (client, padrão das páginas Task 5/7): heading `Relatórios`; select `Evento` com apenas eventos `!platform` (copy `Nenhum evento do organizador ainda.` quando a lista filtrada fica vazia); período com dois inputs `datetime-local` labeled `De`/`Até` + botão `Aplicar` (envia `from`/`to` como ISO via `fromDateTimeLocalValue`; vazios = sem filtro); KPIs `Ingressos vendidos`, `Pedidos pagos`, `Faturamento bruto`, `Taxa da plataforma`, `Líquido do evento` (valores inteiros e monetários via `formatBRL`); `Nenhuma venda no período.` quando `ticketsSold === 0`; carregando `role="status"`; erro `Não foi possível carregar o relatório.` com mensagem mapeada do endpoint (ex. `Período inválido.`) em `role="alert"`; fetch dispara ao trocar o select e ao aplicar o período.

- [ ] **Step 1: Specs MSW que falham (pt-BR, behavioral)**

Casos: KPIs renderizados a partir de report seedado no handler (números/labels exatos); select só lista `!platform`; `Aplicar` dispara fetch com `from`/`to` na URL (assert no `info.request.url`); estado de zeros com `Nenhuma venda no período.`; upstream 502 → `Não foi possível carregar o relatório.` (e `Período inválido.` para 400 `invalid_query`); nav/atalhos especificados nos specs que já existem. Run: `pnpm --filter @ticketvibe/web exec vitest run src/app/organizador src/components/organizador-nav.spec.tsx` → FAIL.

- [ ] **Step 2: Implementar lib + página + nav + painel**

Run de novo → PASS.

- [ ] **Step 3: Suíte web + typecheck + lint**

Run: `pnpm --filter @ticketvibe/web test`, `pnpm --filter @ticketvibe/web typecheck`, `pnpm lint` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add organizer sales reports page"
```

### Task 4: E2E de vender → ver no relatório

**Files:**
- Create: `apps/web/tests/e2e/reports.spec.ts`

**Interfaces:**
- Consumes: padrão de `helpers/auth` (`registerVerifiedBuyer`, `WEB`), `helpers/db` (`promoteOrganizerByEmail`), `helpers/checkout` (`approvePayment`), `helpers/orders` (`deleteOrdersByBuyer`, `readLatestOrder`, `deletePaymentEvents`) — espelhe o ciclo `afterEach` de `tests/e2e/checkout.spec.ts`; jornada de criação de backoffice igual à do `backoffice.spec.ts` (local → evento → setor com fila/10 lugares/`R$ 50,00`).
- Produces: teste único pinado —
  1. organizador cria `Teatro E2E Relatórios` + `Show do Organizador Relatório E2E` (mesmo fluxo do `backoffice.spec.ts`);
  2. context de comprador (browser novo): `registerVerifiedBuyer` → `page.goto(/events/show-do-organizador-relatorio-e2e/ingressos)` → `Cadeira 1, fila A` → `Finalizar compra` → login (`/entrar`) → `checkout` → `Pagar` (painel simulado) → `approvePayment` com `readLatestOrder()` → `Pedido confirmado` (prazo: 15s);
  3. organizador abre `Relatórios` (nav) → `/organizador/relatorios` → seleciona o evento → espera UMA resposta de `/report` → assert visível: `Ingressos vendidos` = 1, `Pedidos pagos` = 1, `R$ 50,00` (bruto), `R$ 5,00` (taxa), `R$ 45,00` (líquido);
  4. Aplicar período do último dia → números continuam; período sem vendas (janela terminando antes do pedido) → `Nenhuma venda no período.`.

- [ ] **Step 1: Escrever o spec (locators role-based; sufixo Date.now() apenas no email; cleanup no afterEach = padrão checkout.spec)**

- [ ] **Step 2: Iterar até passar sem afrouxar asserts**

Run: `pnpm --filter @ticketvibe/web test:e2e reports` → PASS.
- [ ] **Step 3: Suíte completa E2E**

Run: `pnpm --filter @ticketvibe/web test:e2e` → PASS (35+N).
- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/reports.spec.ts
git commit -m "test(e2e): verify sales show up in organizer report"
```

### Task 5: Gates finais + fechar a issue

**Files:**
- Modify: `.scratch/ticketvibe/issues/19-relatorios-de-vendas.md` (status done, checkboxes, tabelas de commits/gates/deferrals — formato das issues 17/18)

- [ ] **Step 1:** `pnpm lint` → 0 erros (1 info pré-existente permitida)
- [ ] **Step 2:** `pnpm typecheck` → 5/5
- [ ] **Step 3:** `pnpm test --force` → API/web/shared pass com números reais no report
- [ ] **Step 4:** `pnpm --filter @ticketvibe/web test:e2e` → todas pass
- [ ] **Step 5:** `pnpm build` → ok (warning de prerender sem API é ruído conhecido)
- [ ] **Step 6:** Subagent de revisão final do branch inteiro (spec coverage ×issue, seams com ticket 18, fonte única = pedidos paid, ownership na rota nova).
- [ ] **Step 7:** Atualizar a issue (tabelas com SHAs, gates com números reais, deferrals) → commit `docs: close ticket 19 sales reports`

## Deferrals a declarar na issue (rulings do plano)

- **Quebra adicional/taxa por método:** o relatório não separa card/boleto nem manipula split Stripe (ticket 22); fee = `serviceFeeCents` do pedido conforme hoje.
- **Só evento próprio:** evento da plataforma e alheio → 403 (attribution de receita fica com o dono; painel "da plataforma" fora de escopo).
- **Granularidade de tempo:** KPIs do período como número único (sem série por dia/por setor/tipo de ingresso) — YAGNI do spec.
- **Sem export/downloading:** sem CSV/XLSX no ticket.
