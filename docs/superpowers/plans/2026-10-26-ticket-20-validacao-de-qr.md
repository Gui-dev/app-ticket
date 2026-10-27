# Ticket 20 — Validação de QR na entrada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na porta do evento, o organizador escaneia (ou digita) o QR do ingresso e recebe o veredito na hora — válido (novo), inválido (código inexistente / ingresso de outro evento) ou já utilizado (com horário e quem validou) — com cada ingresso marcado como usado de forma atômica.

**Architecture:** Migração adiciona `tickets.used_at`/`tickets.validated_by`; novo método `validateTicketForOrganizer` no port `OrganizerRepository` (in-memory + drizzle) marca o ingresso com `UPDATE ... WHERE used_at IS NULL` (a segunda leitura perde a corrida e devolve `already_used`); rota `POST /organizer/events/:id/tickets/validate` guard-first devolve o veredito como 200 discriminado (`valid`/`already_used`/`invalid`) — o transporte nunca falha por conteúdo do ingresso; página `/organizador/validacao` com componente de câmera (`getMedia` + laço de decode) mais entrada manual de código como caminho da porta e do E2E.

**Tech Stack:** Drizzle ORM + drizzle-kit (migração), Zod contratos compartilhados, Fastify, Next.js 16 (client components, MSW), Playwright; decodificação de QR com **`jsqr`** (única dependência nova, autorização do dono no handoff).

**Spec:** `.scratch/ticketvibe/issues/20-validacao-de-qr-na-entrada.md`

## Global Constraints

- Sem comentários de código; Conventional Commits em inglês/imperativo; sem `--no-verify`.
- UI e testes de componente (web) em pt-BR; descrições de testes da API em pt-BR; **exceção:** `packages/shared/src/index.spec.ts` em inglês.
- **Única dependência nova do ticket: `jsqr`** (decodificação de QR em canvas da câmera; geração de QR continua com `qrcode.react` existente). Nenhuma outra.
- Infra de pé (postgres/redis/mailpit): `pnpm infra:down` PROIBIDO; `playwright.config.ts` / `global-setup.ts` NUNCA tocados; nada em `.github/`.
- Migração: gerada **apenas** com drizzle-kit (`pnpm --filter @ticketvibe/api exec drizzle-kit generate`), sem editar o conteúdo gerado à mão.
- O conteúdo do QR é o `tickets.code` (base64url do ticket 15) — NÃO mudar o valor codificado no QR do comprador.
- Rotas do organizer: `guardOrganizer` primeiro (401 `not_authenticated` → 403 `not_organizer`), depois ownership derivado do banco (nunca confiar em id do cliente).
- Vereditos são resposta 200 discriminada (`result` no corpo), nunca 404/403/500 de acordo com o ingresso escaneado — erros HTTP só de sessão/filtro/evento.
- Marcação de uso atômica: um único `UPDATE tickets SET used_at, validated_by WHERE code = ? AND used_at IS NULL` — nunca check-then-write em duas escritas separadas no drizzle.
- Data/hora exibidas com `formatDatePtBR` (`@ticketvibe/shared`) + `Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })` para a hora.

## Review Focus

1. Corrida de dupla validação: duas leituras simultâneas do mesmo ingresso produzem exatamente UM `valid` e uma resposta `already_used` — nunca um válido duplicado. Teste: integração com duas `app.inject` em `Promise.all` no mesmo código (Task 2).
2. Releitura do ingresso já usado mostra horário e quem validou (`usedAt` ISO + `usedBy` nome), não um segundo `valid`. Teste: integração "revalidação devolve already_used com horário e quem validou" (Task 2) + E2E (Task 4).
3. Falha não marca: chamadas que falham antes do processamento (400 `invalid_body`, 403 `event_forbidden`, 401) deixam `tickets.used_at` null — verificado no banco após a resposta. Teste: integração "falhas de guarda não marcam o ingresso" (Task 2); rede perdida no cliente é coberta pela releitura (defensão: a marca ocorre no servidor uma única vez).
4. Ingresso inexistente ou de outro evento é veredito 200 `invalid` (nunca 500; nunca vaza existência via 404 de ticket). Teste: integração "código desconhecido e ingresso de outro evento são 200 invalid" (Task 2).
5. Scanner não vira zumbi: desmontar o componente cancela o laço rAF e para as tracks da câmera; `getUserMedia` indisponível → `onCameraError` sem crash e entrada manual continua. Teste: spec do `QrScanner` (Task 3).

---

### Task 1: Contratos compartilhados da validação

**Files:**
- Modify: `packages/shared/src/index.ts` (EOF, padrão do repo)
- Test: `packages/shared/src/index.spec.ts` (em inglês)

**Interfaces:**
- Consumes: nada (adiciona no EOF como no ticket 19).
- Produces (o resto do plano importa exatamente estes nomes):
  - `organizerTicketValidationRecordSchema` = `{ result: z.enum(['valid', 'already_used', 'invalid']), usedAt: z.iso.datetime().nullable(), usedBy: z.string().nullable(), sectorName: z.string().nullable(), rowLabel: z.string().nullable(), seatLabel: z.string().nullable() }` com dois refinements: (1) `result === 'already_used'` exige `usedAt !== null && usedBy !== null`; (2) `result !== 'already_used'` exige `usedAt === null && usedBy === null` (e no caso `invalid`, também os três campos de assento nulls).
  - `organizerTicketValidationResponseSchema` = `{ validation: organizerTicketValidationRecordSchema }`.
  - `organizerTicketValidateSchema` = `z.object({ code: z.string().min(1) })` (corpo da requisição).
  - Tipos: `OrganizerTicketValidationDto` (z.infer do record), `OrganizerTicketValidationResponse` (z.infer da response), `OrganizerTicketValidate` (z.input do validate).

- [ ] **Step 1: Testes que falham (inglês)**

Casos pinados: parse do record com `result: 'valid'` (assento preenchido, usedAt/usedBy null); `result: 'already_used'` com usedAt/usedBy preenchidos; `result: 'invalid'` com tudo null; refinements rejeitam `already_used` sem usedAt/usedBy e rejeitam `valid` com usedAt preenchido; response wrap parseia; `organizerTicketValidateSchema` rejeita código vazio e ausente.

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: FAIL (schemas não definidos)

- [ ] **Step 3: Implementar schemas + tipos no EOF de `packages/shared/src/index.ts`**

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm --filter @ticketvibe/shared test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add ticket validation contracts"
```

### Task 2: Endpoint de validação na API

**Files:**
- Modify: `apps/api/src/db/schema.ts` (`tickets` ganha `usedAt: timestamp(...).nullable()` e `validatedBy: text(...).nullable())`)
- Create: migração via `pnpm --filter @ticketvibe/api exec drizzle-kit generate` (aplicar com o helper da suíte; ver ticket 18)
- Modify: `apps/api/src/modules/organizer/domain/organizer-repository.ts` (port + record + result)
- Modify: `apps/api/src/modules/organizer/infra/in-memory-organizer-repository.ts` (seed de tickets + método)
- Modify: `apps/api/src/modules/organizer/infra/drizzle-organizer-repository.ts` (método)
- Create: `apps/api/src/modules/organizer/use-cases/validate-ticket.use-case.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.ts` (nova rota ao fim)
- Modify: `apps/api/src/modules/organizer/routes/organizer.routes.spec.ts`
- Test: `apps/api/src/modules/organizer/routes/organizer.routes.integration.spec.ts` (estende fixtures diretas)
- Test: `apps/api/src/modules/organizer/infra/in-memory-organizer-repository.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`organizerTicketValidationResponseSchema`, `organizerTicketValidateSchema`, tipos); guard `guardOrganizer`; fixtures diretas de orders/tickets do spec do ticket 15 (`drizzle-ticket-repository.integration.spec.ts`) e do organizer (ticket 18).
- Produces:
  - Port verbatim:
    ```ts
    export interface OrganizerTicketValidationRecord {
      result: 'valid' | 'already_used';
      usedAt: Date | null;
      usedBy: string | null;
      sectorName: string | null;
      rowLabel: string | null;
      seatLabel: string | null;
    }
    export type TicketValidationForOrganizerResult =
      | { kind: 'ok'; record: OrganizerTicketValidationRecord }
      | { kind: 'invalid' }
      | { kind: 'not_found' }
      | { kind: 'forbidden' };
    export interface TicketValidationForOrganizerInput {
      eventId: string;
      userId: string;
      code: string;
    }
    // no OrganizerRepository:
    validateTicketForOrganizer(input: TicketValidationForOrganizerInput): Promise<TicketValidationForOrganizerResult>;
    ```
  - Semântica de validação (binding):
    - Ownership: `events.id = eventId` com `events.organizer_id === userId` estrito (inexistente → `not_found`; plataforma/alheio → `forbidden`).
    - Ingresso: busca por `tickets.code = code`; inexistente OU `order.event_id !== eventId` → `invalid`.
    - Marcação: `UPDATE tickets SET used_at = now(), validated_by = userId WHERE code = code AND used_at IS NULL RETURNING id` — 1 linha → `valid`; 0 linhas → re-select do estado atual → `already_used` com `used_at`/`used_by` públicos (join `user.name`).
    - Registro devolvido: dados de assento de `order_items` (`sector_name` nullable, `row_label`, `seat_label`) do item do ticket; `already_used` carrega o mesmo assento.
  - Seed in-memory (`InMemoryOrganizerSeed` ganha `tickets?: InMemoryOrganizerTicketSeed[]`, tipo novo):
    ```ts
    export interface InMemoryOrganizerTicketSeed {
      eventId: string;
      code: string;
      sectorName?: string | null;
      rowLabel?: string | null;
      seatLabel?: string | null;
      usedAt?: Date | null;
      usedBy?: string | null;
    }
    ```
  - Use-case: `ValidateTicketUseCase` (pass-through).
  - Rota: `POST /organizer/events/:id/tickets/validate` → guard → `eventIdSchema` (404 `event_not_found`) → body `organizerTicketValidateSchema` (400 `invalid_body`) → repo. Respostas: 200 `organizerTicketValidationResponseSchema.parse` com `usedAt` em ISO (`record.usedAt?.toISOString() ?? null`); `kind: 'invalid'` → 200 com record `{ result: 'invalid', tudo null }`; `not_found` → 404 `event_not_found`; `forbidden` → 403 `event_forbidden`.

- [ ] **Step 1: Migração**

Run: `pnpm --filter @ticketvibe/api exec drizzle-kit generate` → novo arquivo `drizzle/00XX_*.sql` com as duas colunas da `tickets` (não editar à mão); confirmar que a suíte de integração aplica a migração.

- [ ] **Step 2: Testes unitários que falham (in-memory, pt-BR)**

Casos pinados: ingresso próprio novo → `valid` com assento; revalidação → `already_used` com usedAt/usedBy; Review Focus 3 e 4; evento `not_found`/`forbidden`. Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/organizer/infra` → FAIL.

- [ ] **Step 3: Implementar port + in-memory + spec do use-case (pass-through)**

Run de novo → PASS.

- [ ] **Step 4: Testes de integração que falham (fixtures diretas: evento próprio + order/item/ticket via helpers do ticket 15) e testes de rota**

Casos: feliz 200 `valid`; revalidação 200 `already_used` com `usedAt`/`usedBy` (Review Focus 2); corrida com duas `app.inject` em `Promise.all` — exatamente um corpo `valid` e um `already_used` (Review Focus 1); código desconhecido e ingresso de outro evento → 200 `invalid` (Review Focus 4); guardas 401/403/400 e Review Focus 3 (assert `used_at IS NULL` no banco após cada guard); roda `pnpm exec vitest run src/modules/organizer/routes` → FAIL.

- [ ] **Step 5: Implementar drizzle `validateTicketForOrganizer` + use-case + rota guard-first**

Run de novo → PASS.

- [ ] **Step 6: Suíte da API completa + typecheck**

Run: `pnpm --filter @ticketvibe/api test` e `pnpm --filter @ticketvibe/api typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): add organizer ticket validation endpoint"
```

### Task 3: Scanner + página `/organizador/validacao`

**Files:**
- Modify: `apps/web/package.json` (adiciona `jsqr`)
- Create: `apps/web/src/components/qr-scanner.tsx` (+ `qr-scanner.spec.tsx`)
- Modify: `apps/web/src/lib/organizer-api.ts` (`fetchOrganizerTicketValidation`)
- Create: `apps/web/src/app/organizador/validacao/page.tsx` (+ `page.spec.tsx`)
- Modify: `apps/web/src/components/organizador-nav.tsx` (NAV_ITEMS ganha `{ href: '/organizador/validacao', label: 'Validação' }`; spec da nav cobre)
- Modify: `apps/web/src/app/organizador/page.tsx` (SHORTCUTS ganha `Validação`)

**Interfaces:**
- Consumes: Task 1 (schemas/tipos), Task 2 (rota POST), `fetchOrganizerEvents()` e o estilo de `organizer-api.ts` (todos os códigos de erro já mapeados — `invalid_body` existe), `formatBRL`/`formatDatePtBR` de `@ticketvibe/shared`.
- Produces:
  - `fetchOrganizerTicketValidation(eventId: string, input: { code: string }): Promise<OrganizerTicketValidationDto>` — POST `/api/organizer/events/<encoded id>/tickets/validate` com body `{ code }`, parse por `organizerTicketValidationResponseSchema`, erro pelo pipeline `messageFor` existente.
  - `QrScanner({ onCode: (code: string) => void; onCameraError: () => void; decode: (imageData: ImageData) => string | null })`: no mount pede `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`; anexa o stream ao `<video playsInline muted>`; ao evento `playing` inicia laço rAF: desenha o vídeo num `<canvas>`, `getImageData`, `decode(...)`; código não-nulo → `onCode(code)` e contabiliza; desmontar cancela o rAF e para as tracks; `getUserMedia` rejeita/ausente → `onCameraError()` uma vez e sem laço; `canvas.getContext('2d')` null (jsdom) reagenda sem lançar. `decode` default (página): `jsQr(imageData.data, imageData.width, imageData.height)?.data ?? null` — wrapper `decodeQr` plain em `lib/qr-decoder.ts` com `jsQR` externo importado; spec curto do wrapper (imagem de ruído → null).
  - Página: heading `Validação de ingressos`; select `Evento` apenas `!platform` (copy `Nenhum evento do organizador ainda.`); região do scanner com `aria-label="Câmera do scanner"` renderizando `QrScanner` com `decode: decodeQr` e `onCameraError` → linha `Não foi possível acessar a câmera. Use o código manual.` (`role="status"`); entrada manual: label `Código do ingresso` + botão `Validar` (desabilitado enquanto nenhum evento selecionado); mensagem pré-ação `Selecione um evento antes de validar.` quando algum `onCode` chega sem evento; durante fetch `Validando ingresso…` em `role="status"`; vereditos (`role="status"`): `valid` → `Ingresso válido.` + `{sectorName} · Fila {rowLabel} · Assento {seatLabel}` (inline, campos podem ser null no DTO valid — a linha só renderiza com os três); `invalid` → `Ingresso inválido.`; `already_used` → `Ingresso já utilizado.` + `Utilizado em {formatDatePtBR(usedAt)} às {hora} por {usedBy}.`; erro de carga/parse `Não foi possível validar o ingresso.` + mensagem mapeada em `role="alert"`; cada fetch substitui o veredito anterior.

- [ ] **Step 1: Dependência + specs que falham (pt-BR, behavioral)**

`pnpm --filter @ticketvibe/web add jsqr` — única dependência nova do ticket.

Specs pinados: `qr-scanner.spec.tsx` — mount pede câmera (stub de `navigator.mediaDevices.getUserMedia` captura a chamada); desmontar para o laço (rAF stub contado) e para as tracks (`stop` espiado); rejeição do getUserMedia → `onCameraError` e nenhum tick; guard do canvas-null não crasha e reagenda. `page.spec.tsx` — vereditos via MSW (válido com assento, `Utilizado em ...` com data pt-BR exata do usedAt fixo + hora, inválido); fetch em `onCode` do scanner (a spec injeta o `decode` fake que devolve o código, e a página dispara exatamente como no manual); corpo/URL da request pinados no handler; `Validar` desabilitado sem evento; `Selecione um evento antes de validar.` quando `onCode` chega sem evento; loading `Validando ingresso…`; 502 → `Não foi possível validar o ingresso.`; nav/painel cobertos nos specs existentes. Run: `pnpm --filter @ticketvibe/web exec vitest run src/components/qr-scanner.spec.tsx src/app/organizador/validacao src/lib/qr-decoder.spec.ts src/components/organizador-nav.spec.tsx src/app/organizador/page.spec.tsx` → FAIL.

- [ ] **Step 2: Implementar `decodeQr` + `QrScanner` + lib + página + nav + painel**

Run de novo → PASS.

- [ ] **Step 3: Suíte web + typecheck + lint**

Run: `pnpm --filter @ticketvibe/web test`, `pnpm --filter @ticketvibe/web typecheck`, `pnpm lint` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add qr validation scanner page"
```

### Task 4: E2E de validar → revalidar

**Files:**
- Create: `apps/web/tests/e2e/validate.spec.ts`

**Interfaces:**
- Consumes: jornada de criação de backoffice (estilo `reports.spec.ts`/`backoffice.spec.ts` — `registerVerifiedBuyer` + `promoteOrganizerByEmail`, local `Teatro E2E Validação`, evento `Show do Organizador Validação E2E`, setor `Plateia` fila `A` 10 lugares R$ 50); fluxo de compra de `checkout.spec.ts` (buyer compra `Cadeira 1, fila A`, `approvePayment` + `readLatestOrder`, `Pedido confirmado` em 15s); cleanup `afterEach` = `deleteOrdersByBuyer` + `deletePaymentEvents` (padrão checkout.spec/report.spec).
- Produces: teste único pinado:

  1. organizador cria local + evento + setor (mesmo fluxo do E2E do backoffice);
  2. comprador compra via checkout e paga (total `R$ 55,00`), aguarda `Pedido confirmado`;
  3. extrai o código do banner do comprador: do figure `QR Code do ingresso` (elemento `<code>`, padrão `account.spec.ts` — se a view de confirmação não exibir o figure, navegar o comprador até o pedido em `/conta/pedidos/[id]` e extrair lá; reportar o que funcionou);
  4. `Sair` → login do organizador → `/organizador/validacao` → seleciona o evento → digita o código → `Validar` → `Ingresso válido.` + `Plateia · Fila A · Assento Cadeira 1`;
  5. digita o mesmo código de novo → `Ingresso já utilizado.` e linha casa `/Utilizado em .+ por .+/` (Review Focus 2);
  6. digita um código inventado → `Ingresso inválido.`.

- [ ] **Step 1: Escrever o spec (locators role-based; cleanup checkout.spec; sem prints de QR reais — código via texto)**

- [ ] **Step 2: Iterar até passar sem afrouxar asserts**

Run: `pnpm --filter @ticketvibe/web test:e2e validate` → PASS.

- [ ] **Step 3: Suíte completa E2E**

Run: `pnpm --filter @ticketvibe/web test:e2e` → PASS (36+N).

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/validate.spec.ts
git commit -m "test(e2e): verify ticket qr validation flow"
```

### Task 5: Gates finais + fechar a issue

**Files:**
- Modify: `.scratch/ticketvibe/issues/20-validacao-de-qr-na-entrada.md` (status done, checkboxes, tabelas de commits/gates/deferrals — formato das issues 18/19)

- [ ] **Step 1:** `pnpm lint` → 0 erros (1 info pré-existente permitida)
- [ ] **Step 2:** `pnpm typecheck` → 5/5
- [ ] **Step 3:** `pnpm test --force` → API/web/shared pass com números reais no report
- [ ] **Step 4:** `pnpm --filter @ticketvibe/web test:e2e` → todas pass
- [ ] **Step 5:** `pnpm build` → ok (número fresco, sem cache de turbo)
- [ ] **Step 6:** Subagent de revisão final do branch inteiro (spec coverage ×issue, corrida atômica, ownership derivado do banco, resposta discriminada, exception de dependência `jsqr` documentada).
- [ ] **Step 7:** Atualizar a issue (tabelas com SHAs, gates com números reais, deferrals) → commit `docs: close ticket 20 qr validation`

## Deferrals a declarar na issue (rulings do plano)

- **Câmera só decodifica; nada de live preview enriquecido:** sem zoom/torch/leitura contínua em segundo plano — laço rAF simples; `BarcodeDetector` nativo fica para depois (só Chromium).
- **Sem histórico de leituras na página:** apenas o último veredito permanece visível; log da sessão da porta é evolução.
- **Sem validação offline/fila de sincronização:** a porta exige conexão; recontagem do assunto é ticket próprio.
- **`invalid` não diferencia motivo:** código desconhecido e ingresso de outro evento devolvem o mesmo `Ingresso inválido.` (YAGNI do veredito na porta).
- **Dependência `jsqr` nova:** única do ticket; decoder positivo (código real decodificado) exercitado apenas em uso real — componente cobre lifecycle e assinatura do laço com `decode` injetado.
