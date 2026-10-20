# Ticket 14: E-mail de confirmação de compra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depois que o pagamento é confirmado, o comprador recebe um e-mail de texto com o resumo do pedido e seus ingressos, enviado por um job BullMQ no worker — sem duplicar o e-mail em reentregas, sem travar a compra quando o envio falha.

**Architecture:** O job de pagamento (que já roda no worker e no processo da API) enfileira um job novo na fila `emails` assim que o pedido fica `paid`. Um worker de e-mails — registrado tanto em `src/worker.ts` quanto em `src/index.ts` (consumidor in-process, como o de pagamentos) — lê o pedido, monta o texto do e-mail e envia via SMTP (Mailpit em dev). A idempotência do envio mora em uma tabela própria do módulo de e-mails (`order_confirmation_emails`): o job pula o pedido cuja confirmação já foi enviada, e o `jobId` (`order-confirmation-<orderId>`) impede que a reentrega do webhook crie um segundo job.

**Tech Stack:** Fastify + Drizzle (Postgres) + Redis/BullMQ + nodemailer (SMTP) + Zod (`packages/shared`) + vitest + Playwright (Mailpit via API HTTP).

**Spec:** `.scratch/ticketvibe/issues/14-email-de-confirmacao-de-compra.md` (issue 14) e `.scratch/ticketvibe/spec.md` (story 31, seção F3 Pós-compra). O plano do ticket 13 (`docs/superpowers/plans/2026-10-18-ticket-13-checkout-stripe-cartao-e-boleto.md`) é a referência do que já existe.

## Global Constraints

- **Nenhum comentário de código** em nenhum arquivo novo ou modificado.
- **Copy de UI e descrições de teste em pt-BR**; identificadores de código em inglês. Exceção já estabelecida: `packages/shared/src/index.spec.ts` fica em **inglês** (consistência com o arquivo).
- **Commits Conventional em inglês e no imperativo**: `feat(api): …`, `fix(api): …`, `test(web): …`.
- **Sem dependências novas**: `bullmq`, `nodemailer`, `ioredis` e `drizzle-orm` já estão no `apps/api`.
- **`apps/web/playwright.config.ts` e `apps/web/tests/e2e/global-setup.ts` nunca são tocados.** Nunca rodar `pnpm infra:down` (usar `pnpm infra:up`).
- **Migrações só via drizzle-kit** (`pnpm --filter @ticketvibe/api db:generate`) — nunca SQL escrito à mão no schema.
- **Determinismo**: todo use-case/job recebe `now: () => Date = () => new Date()` injetado; nada de `new Date()` dentro do corpo.
- **Testes afirmar comportamento externo** (o que foi enviado, o que foi gravado, o que a API responde) — nunca estado interno.
- **Branch `main`** (convenção do repo), commits pequenos e frequentes.

## Review Focus

Cinco modos de falha que a issue 14 implica e que nenhum teste do ticket 13 exercita:

1. **Reentrega/retry do job de e-mail** → o mesmo pedido não recebe dois e-mails (marcador `sent` na tabela + `jobId` determinístico).
2. **SMTP fora do ar** → a compra continua paga e entregue; a falha fica registrada (status `failed` + `lastError` na tabela + log do worker) e o retry do BullMQ reenvia.
3. **O processo morre entre a captura do pagamento e o enfileiramento do e-mail** → o e-mail ainda sai, porque o retry do job de pagamento reenfileira o e-mail ao ver o pedido já `paid`.
4. **Job disparado para um pedido que não está `paid`** → nenhum e-mail é enviado e o motivo fica registrado.
5. **Pedido sem e-mail do comprador** (pedido anterior à migration, ou sessão sem e-mail) → nenhum e-mail é enviado e o motivo fica registrado.

---

### Task 1: Formatação de dinheiro/data no shared + o template do e-mail

O template é uma função pura: recebe os dados e devolve `{ to, subject, text }`. Nenhum acesso a banco, nenhum I/O — é o que permite os testes unitários exigidos pela issue.

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/index.spec.ts`
- Modify: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/components/cart-panel.tsx`
- Create: `apps/api/src/modules/emails/domain/email-sender.ts`
- Create: `apps/api/src/modules/emails/domain/order-confirmation.ts`
- Create: `apps/api/src/modules/emails/domain/order-confirmation.spec.ts`

**Interfaces:**
- Consumes: `ticketTypeSchema`/`TicketType` (já em `packages/shared`), `Intl` (Node 25 e o browser têm ICU completo).
- Produces:
  - `packages/shared`: `formatBRL(cents: number): string`, `formatDatePtBR(isoDate: string): string`, `TICKET_TYPE_LABELS: Record<TicketType, string>`.
  - `apps/api/src/modules/emails/domain/email-sender.ts` (o port de envio, criado aqui porque o template já devolve o formato da mensagem):
    ```ts
    export interface EmailMessage {
      to: string;
      subject: string;
      text: string;
    }
    export interface EmailSender {
      send(message: EmailMessage): Promise<void>;
    }
    ```
  - `apps/api/src/modules/emails/domain/order-confirmation.ts`:
    ```ts
    export interface OrderConfirmationItem {
      sectorSlug: string;
      sectorName: string | null;
      rowLabel: string;
      seatLabel: string;
      ticketType: TicketType;
      priceCents: number;
    }
    export interface OrderConfirmationData {
      orderId: string;
      buyerEmail: string;
      eventTitle: string;
      eventStartsAt: Date;
      venueName: string;
      venueCity: string;
      venueState: string;
      items: OrderConfirmationItem[];
      subtotalCents: number;
      serviceFeeCents: number;
      totalCents: number;
    }
    export function buildOrderConfirmationEmail(
      data: OrderConfirmationData,
    ): EmailMessage;
    ```

- [ ] **Step 1: Escreva os testes que falham (shared)**

Em `packages/shared/src/index.spec.ts` (descrições em **inglês**, como no resto do arquivo):

```ts
describe('formatBRL', () => {
  it('formats cents as brazilian reais', () => {
    expect(formatBRL(19800)).toBe('R$ 198,00');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('formatDatePtBR', () => {
  it('formats an iso date in portuguese', () => {
    expect(formatDatePtBR('2026-07-12T23:00:00.000Z')).toBe('12 de Julho, 2026');
  });
});

describe('TICKET_TYPE_LABELS', () => {
  it('labels every ticket type', () => {
    expect(TICKET_TYPE_LABELS).toEqual({
      inteira: 'Inteira',
      meia: 'Meia',
      vip: 'VIP',
    });
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/shared exec vitest run`
Expected: FAIL — `formatBRL is not a function` (os três nomes ainda não existem no shared).

- [ ] **Step 3: Implemente no shared**

Em `packages/shared/src/index.ts`, mova **a implementação** de `apps/web/src/lib/format.ts` para o shared, copiando os corpos como estão (inclusive o `cents / 100` do `formatBRL` — `formatBRL(19800)` precisa devolver `R$ 198,00`, não `R$ 19.800,00`; e o `capitalize` do mês em `formatDatePtBR`, que produz `12 de Julho, 2026`). O `Intl.DateTimeFormat('pt-BR', …)` do `formatDatePtBR` usa `timeZone: 'America/Sao_Paulo'` e divide o resultado em `' de '` para remontar `dia de Mês, ano` — mantenha esse comportamento idêntico ao de hoje. Exporte também:

```ts
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  inteira: 'Inteira',
  meia: 'Meia',
  vip: 'VIP',
};
```

- [ ] **Step 4: Faça o web reutilizar o shared (sem duplicar)**

Em `apps/web/src/lib/format.ts`, substitua as implementações por re-exports (`export { formatBRL, formatDatePtBR } from '@ticketvibe/shared';`) e mantenha o resto do arquivo como está. Em `apps/web/src/components/cart-panel.tsx`, apague a constante local `TICKET_TYPE_OPTIONS` e monte as opções com `Object.entries(TICKET_TYPE_LABELS)` do `@ticketvibe/shared` (o array vira `{ value, label }` no map; mesmos rótulos, mesmos valores — os specs existentes continuam válidos).

- [ ] **Step 5: Escreva o teste do template (red)**

Crie `apps/api/src/modules/emails/domain/order-confirmation.spec.ts` (descrições em **pt-BR**) com o caso completo: um item `meia` de 6000 e um `inteira` de 12000, evento "O Fantasma da Opera", local "Teatro Municipal" em "São Paulo/SP", subtotal 18000, taxa 1800, total 19800. Asserte:

- `subject` é `Compra confirmada: O Fantasma da Opera`;
- `to` é o e-mail do comprador;
- o texto contém, nesta ordem: `Pedido: <id>`, `Evento: O Fantasma da Opera`, `Data: 12 de Julho, 2026 às 20:00`, `Local: Teatro Municipal - São Paulo/SP`, o cabeçalho `Ingressos:`, uma linha por ingresso no formato `<setor> · Fila <fila> · Cadeira <cadeira> · <rótulo do tipo> · <preço>` (ex.: `Plateia · Fila A · Cadeira 6 · Meia · R$ 60,00`), `Subtotal: R$ 180,00`, `Taxa de serviço: R$ 18,00`, `Total: R$ 198,00`;
- um item sem `sectorName` (só `sectorSlug`) aparece com o slug no lugar do nome.

- [ ] **Step 6: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/emails`
Expected: FAIL — `Cannot find module '.../emails/domain/order-confirmation'`.

- [ ] **Step 7: O port de envio e o template**

Crie `apps/api/src/modules/emails/domain/email-sender.ts` com as duas interfaces do bloco de Interfaces acima (sem corpo — é o contrato).

Em `apps/api/src/modules/emails/domain/order-confirmation.ts`, implemente `buildOrderConfirmationEmail` montando exatamente o texto do Step 5, com esta estrutura de linhas (uma linha em branco entre os blocos):

```
Olá!

Sua compra foi confirmada no TICKETVIBE.

Pedido: {orderId}
Evento: {eventTitle}
Data: {formatDatePtBR(eventStartsAt.toISOString())} às {hora em America/Sao_Paulo}
Local: {venueName} - {venueCity}/{venueState}

Ingressos:
- {sectorName ?? sectorSlug} · Fila {rowLabel} · Cadeira {seatLabel} · {TICKET_TYPE_LABELS[ticketType]} · {formatBRL(priceCents)}

Subtotal: {formatBRL(subtotalCents)}
Taxa de serviço: {formatBRL(serviceFeeCents)}
Total: {formatBRL(totalCents)}
```

A hora usa `new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })` (formato `20:00`). `formatBRL` e `formatDatePtBR` vêm de `@ticketvibe/shared`.

- [ ] **Step 8: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/emails` e `pnpm --filter @ticketvibe/shared exec vitest run` e `pnpm --filter @ticketvibe/web exec vitest run src/lib src/components`
Expected: PASS nos três.

- [ ] **Step 9: Verifique e commit**

Run: `pnpm typecheck` e `pnpm lint`
Expected: 5/5 no typecheck, 0 erros no lint.

```bash
git add packages/shared apps/web/src/lib/format.ts apps/web/src/components/cart-panel.tsx apps/api/src/modules/emails
git commit -m "feat(shared): add money, date and ticket label formatters"
```

---

### Task 2: O pedido guarda o e-mail do comprador e o nome do setor

O recibo precisa do endereço do comprador no momento da compra (o e-mail do usuário pode mudar depois) e do nome do setor (o `sectorSlug` sozinho — "plateia" — não serve para um recibo).

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/00XX_*.sql` (gerado pelo drizzle-kit) + o snapshot correspondente
- Modify: `apps/api/src/modules/orders/domain/order-entity.ts`
- Modify: `apps/api/src/modules/orders/domain/order-repository.ts`
- Modify: `apps/api/src/modules/orders/infra/drizzle-order-repository.ts`
- Modify: `apps/api/src/modules/orders/use-cases/create-order.use-case.ts`
- Test: os specs existentes de `apps/api/src/modules/orders/**` (atualizados)

**Interfaces:**
- Consumes: `findSeatByCoords` (devolve `sectorName` — `apps/api/src/modules/seatmaps/domain/seatmap-repository.ts`).
- Produces:
  - `orders.buyer_email` — `text('buyer_email')` (nullable: os pedidos anteriores à migration ficam `null`).
  - `order_items.sector_name` — `text('sector_name')` (nullable pelo mesmo motivo).
  - `OrderRecord.buyerEmail: string | null`, `OrderItemRecord.sectorName: string | null`.
  - `CreateOrderInput.buyerEmail: string | null` (o `execute` já recebe `buyerEmail: string | null`; a coluna é nullable).

- [ ] **Step 1: Escreva o teste que falha (unitário do use-case)**

Em `apps/api/src/modules/orders/use-cases/create-order.use-case.spec.ts`, acrescente um caso (pt-BR) que monta um carrinho com um assento e verifica que `orderRepository.create` foi chamado com `buyerEmail: 'comprador@example.com'` e com o item carregando `sectorName: 'Plateia'` (o nome devolvido pelo lookup de assento).

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders/use-cases/create-order.use-case.spec.ts`
Expected: FAIL — `create` foi chamado sem `buyerEmail`/`sectorName`.

- [ ] **Step 3: Migre o schema e gere a migração**

Em `apps/api/src/db/schema.ts`, acrescente `buyerEmail: text('buyer_email')` em `orders` e `sectorName: text('sector_name')` em `orderItems` (ambos nullable, sem default). Depois:

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: cria `apps/api/drizzle/00XX_<nome>.sql` com os dois `ALTER TABLE ... ADD COLUMN` e o snapshot novo. Confira o SQL gerado antes de seguir (a ordem das colunas é irrelevante, mas não pode haver `NOT NULL` nem `DEFAULT`).

- [ ] **Step 4: Propague os campos no domínio e no repositório**

- `order-entity.ts`: `OrderRecord` ganha `buyerEmail: string | null`; `OrderItemRecord` ganha `sectorName: string | null`.
- `order-repository.ts`: `CreateOrderInput` ganha `buyerEmail: string | null`.
- `drizzle-order-repository.ts`: o `insert` em `orders` passa a gravar `buyer_email: input.buyerEmail`; o `insert` em `order_items` grava `sector_name: item.sectorName`; o `select`/map de `orders` e `order_items` traz as duas colunas.
- `create-order.use-case.ts`: no `create(...)`, passa `buyerEmail: input.buyerEmail` (o `execute` já recebe `buyerEmail` — ele hoje só vai para o provider) e, ao montar os itens, copia o `sectorName` devolvido por `findSeatByCoords`.

- [ ] **Step 5: Atualize os fakes dos specs**

Todos os specs que montam `OrderRecord`/`CreateOrderInput` (orders, payments e as rotas) ganham os campos novos: `buyerEmail` (`'comprador@example.com'` ou `null`) e `sectorName` (`'Plateia'` ou `null`).

- [ ] **Step 6: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/orders src/modules/payments`
Expected: PASS.

- [ ] **Step 7: Verifique a migração no banco de dev**

Run: `pnpm --filter @ticketvibe/api db:migrate` e depois `pnpm --filter @ticketvibe/api exec drizzle-kit check`
Expected: migração aplicada sem erro; `drizzle-kit check` limpo.

- [ ] **Step 8: Verifique e commit**

Run: `pnpm --filter @ticketvibe/api test` (suíte completa — reporte o total) e `pnpm --filter @ticketvibe/api exec tsc --noEmit` e `pnpm --filter @ticketvibe/api exec biome check src`
Expected: tudo limpo.

```bash
git add apps/api/src/db apps/api/drizzle apps/api/src/modules/orders
git commit -m "feat(api): store the buyer email and sector name on the order"
```

---

### Task 3: A infraestrutura de e-mail (port, transporte SMTP e fila)

O módulo de e-mails nasce aqui: um port de envio, o transporte SMTP extraído do módulo de auth (para não haver dois "remetentes" no código) e o port/impl da fila.

**Files:**
- Create: `apps/api/src/modules/emails/infra/smtp-email-sender.ts`
- Create: `apps/api/src/modules/emails/infra/smtp-email-sender.spec.ts`
- Create: `apps/api/src/modules/emails/domain/order-confirmation-queue.ts`
- Create: `apps/api/src/modules/emails/infra/bullmq-order-confirmation-queue.ts`
- Create: `apps/api/src/modules/emails/infra/bullmq-order-confirmation-queue.spec.ts`
- Modify: `apps/api/src/modules/auth/email.ts`
- Test: `apps/api/src/modules/auth/email.spec.ts` (novo ou existente)

**Interfaces:**
- Consumes: `nodemailer` (já instalado), `bullmq` (já instalado), `RedisClient`, `EmailSender`/`EmailMessage` (criados na Task 1).
- Produces:
  - `apps/api/src/modules/emails/infra/smtp-email-sender.ts`:
    ```ts
    export function createSmtpEmailSender(transport?: Transporter): EmailSender;
    export function createSmtpTransport(): Transporter; // reutilizado pelo módulo de auth
    ```
  - `apps/api/src/modules/emails/domain/order-confirmation-queue.ts`:
    ```ts
    export const EMAILS_QUEUE_NAME = 'emails';
    export const ORDER_CONFIRMATION_JOB = 'order-confirmation';
    export interface OrderConfirmationQueue {
      enqueue(input: { orderId: string }): Promise<void>;
    }
    ```
  - `apps/api/src/modules/emails/infra/bullmq-order-confirmation-queue.ts`:
    ```ts
    export function createBullMqOrderConfirmationQueue(input: {
      connection: RedisClient;
    }): OrderConfirmationQueue;
    ```
  - `apps/api/src/modules/auth/email.ts` mantém a assinatura pública `SendEmailFn`/`SendEmailInput` (usada por `createAuth`) e passa a delegar o transporte ao módulo de e-mails.

- [ ] **Step 1: Escreva os testes que falham**

- `smtp-email-sender.spec.ts` (pt-BR): injete um `Transporter` falso e afirme que `createSmtpEmailSender().send({ to, subject, text })` chama `sendMail` com `{ from: 'TICKETVIBE <no-reply@ticketvibe.local>', to, subject, text }` — o mesmo `from` que o módulo de auth já usa hoje.
- `bullmq-order-confirmation-queue.spec.ts` (pt-BR): com um `Queue` falso, afirme que `enqueue({ orderId })` chama `queue.add('order-confirmation', { orderId }, { jobId: 'order-confirmation-<orderId>' })`.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/emails`
Expected: FAIL — os módulos ainda não existem.

- [ ] **Step 3: Implemente o transporte SMTP**

- `infra/smtp-email-sender.ts`: mova de `apps/api/src/modules/auth/email.ts` a criação do `nodemailer.createTransport({ host: process.env.SMTP_HOST ?? '127.0.0.1', port: Number(process.env.SMTP_PORT ?? 1025), secure: false })` (mesmo default de porta) para `createSmtpTransport()`, e implemente `createSmtpEmailSender()` chamando `transport.sendMail({ from: 'TICKETVIBE <no-reply@ticketvibe.local>', to, subject, text })`.
- `apps/api/src/modules/auth/email.ts`: o `sendEmail` passa a usar `createSmtpTransport()` (uma única instância de transporte, como o `transporter` em cache de hoje) e mantém `SendEmailInput`/`SendEmailFn` exportados — `createAuth` não muda.

- [ ] **Step 4: Implemente o port e a impl da fila**

- `domain/order-confirmation-queue.ts`: as constantes `EMAILS_QUEUE_NAME = 'emails'` e `ORDER_CONFIRMATION_JOB = 'order-confirmation'` mais a interface `OrderConfirmationQueue` (bloco de Interfaces acima). A Task 4 importa estas constantes daqui — não as redeclare nem duplique.
- `infra/bullmq-order-confirmation-queue.ts`: `new Queue(EMAILS_QUEUE_NAME, { connection })` e `enqueue` chamando `queue.add(ORDER_CONFIRMATION_JOB, { orderId }, { jobId: `order-confirmation-${orderId}` })`.

- [ ] **Step 5: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/emails src/modules/auth`
Expected: PASS.

- [ ] **Step 6: Verifique e commit**

Run: `pnpm --filter @ticketvibe/api exec tsc --noEmit` e `pnpm --filter @ticketvibe/api exec biome check src`
Expected: limpos.

```bash
git add apps/api/src/modules/emails apps/api/src/modules/auth/email.ts
git commit -m "feat(api): add the email sender and order confirmation queue"
```

---

### Task 4: O job do e-mail de confirmação e o worker que o consome

O job decide sozinho se há e-mail a enviar (é o único que conhece o estado do pedido e do envio) — quem enfileira só diz "este pedido está pago".

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/00XX_*.sql` (gerado) + o snapshot
- Create: `apps/api/src/modules/emails/domain/order-confirmation-repository.ts`
- Create: `apps/api/src/modules/emails/infra/drizzle-order-confirmation-repository.ts`
- Create: `apps/api/src/modules/emails/jobs/order-confirmation.ts`
- Create: `apps/api/src/modules/emails/jobs/order-confirmation.spec.ts`
- Create: `apps/api/src/modules/emails/jobs/order-confirmation.integration.spec.ts`
- Create: `apps/api/src/modules/emails/create-emails-worker.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `OrderRepository` (`findById`), `EventsRepository` (`findBySlug`), `EmailSender`, `OrderConfirmationQueue` (só para o nome da fila), `Db`, `RedisClient`.
- Produces:
  - `apps/api/src/modules/emails/domain/order-confirmation-repository.ts`:
    ```ts
    export type OrderConfirmationStatus = 'pending' | 'sent' | 'failed';
    export interface OrderConfirmationState {
      status: OrderConfirmationStatus;
      sentAt: Date | null;
      lastError: string | null;
    }
    export interface OrderConfirmationRepository {
      find(orderId: string): Promise<OrderConfirmationState | null>;
      markSent(input: { orderId: string; now: Date }): Promise<void>;
      markFailed(input: { orderId: string; error: string; now: Date }): Promise<void>;
    }
    ```
  - `apps/api/src/modules/emails/jobs/order-confirmation.ts` (importa `EMAILS_QUEUE_NAME` e `ORDER_CONFIRMATION_JOB` de `domain/order-confirmation-queue.ts` — não os redeclara):
    ```ts
    export const EMAIL_JOB_ATTEMPTS = 6;
    export const EMAIL_JOB_BACKOFF_DELAY_MS = 5000;
    export const EMAIL_JOB_OPTIONS = {
      attempts: EMAIL_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: EMAIL_JOB_BACKOFF_DELAY_MS },
      removeOnFail: true,
    } as const;
    export interface OrderConfirmationJobData {
      orderId: string;
    }
    export function createOrderConfirmationJob(deps: {
      orders: OrderRepository;
      events: EventsRepository;
      confirmations: OrderConfirmationRepository;
      emailSender: EmailSender;
      now?: () => Date;
    }): (data: OrderConfirmationJobData) => Promise<void>;
    ```
  - `apps/api/src/modules/emails/create-emails-worker.ts` (`async`, como `createPaymentsWorker`):
    ```ts
    export async function createEmailsWorker(input: {
      db: Db;
      connection: RedisClient;
    }): Promise<{
      queue: Queue<OrderConfirmationJobData>;
      worker: Worker<OrderConfirmationJobData, unknown>;
    }>;
    ```
  - Tabela `order_confirmation_emails`:
    ```ts
    orderConfirmationEmails = pgTable('order_confirmation_emails', {
      orderId: uuid('order_id')
        .primaryKey()
        .references(() => orders.id, { onDelete: 'cascade' }),
      status: text('status')
        .$type<'pending' | 'sent' | 'failed'>()
        .notNull()
        .default('pending'),
      sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
      lastError: text('last_error'),
      updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    });
    ```

- [ ] **Step 1: Escreva o teste unitário do job (red)**

Crie `apps/api/src/modules/emails/jobs/order-confirmation.spec.ts` (pt-BR) com fakes de `OrderRepository`, `EventsRepository`, `OrderConfirmationRepository` e `EmailSender`. Casos (um por Review Focus):

1. pedido `paid` com e-mail do comprador ⇒ `emailSender.send` chamado uma vez com `{ to, subject, text }` e `confirmations.markSent` chamado com o `orderId` e o `now` injetado;
2. `confirmations.find` devolve `status: 'sent'` ⇒ **nenhum** e-mail enviado e nenhum `markSent`;
3. pedido com `status !== 'paid'` ⇒ nenhum e-mail e `markFailed` com `error: 'order_not_paid'`;
4. pedido sem `buyerEmail` ⇒ nenhum e-mail e `markFailed` com `error: 'missing_buyer_email'`;
5. `emailSender.send` rejeita ⇒ `markFailed` com a mensagem do erro **e** o erro é relançado (para o BullMQ reprocessar);
6. pedido inexistente ⇒ nenhum e-mail e `markFailed` com `error: 'order_not_found'`;
7. evento inexistente ⇒ nenhum e-mail e `markFailed` com `error: 'event_not_found'`.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/emails/jobs`
Expected: FAIL — o módulo do job não existe.

- [ ] **Step 3: A tabela e a migração**

Em `apps/api/src/db/schema.ts`, acrescente a tabela `order_confirmation_emails` (bloco acima), importando `orders` do próprio schema. Depois:

Run: `pnpm --filter @ticketvibe/api db:generate`
Expected: cria a migração `00XX_*.sql` com `CREATE TABLE order_confirmation_emails` (PK `order_id`, FK para `orders(id)` com `ON DELETE CASCADE`).

- [ ] **Step 4: O repositório do estado de envio**

- `domain/order-confirmation-repository.ts`: as interfaces do bloco acima.
- `infra/drizzle-order-confirmation-repository.ts`: implementa `find` (select da linha por `order_id`), `markSent` (upsert: `status = 'sent'`, `sent_at = now`, `last_error = null`) e `markFailed` (upsert: `status = 'failed'`, `last_error = error`, `updated_at = now`) — o upsert usa `onConflictDoUpdate` sobre `order_id` ✓ (a primeira tentativa cria a linha como `pending`).

- [ ] **Step 5: O job**

Em `apps/api/src/modules/emails/jobs/order-confirmation.ts`, implemente `createOrderConfirmationJob` com esta ordem exata de decisões:

1. `const state = await deps.confirmations.find(data.orderId)` — se `state?.status === 'sent'`, **retorne sem enviar** (idempotência);
2. `const order = await deps.orders.findById(data.orderId)` — se `null`: `markFailed({ orderId, error: 'order_not_found', now: now() })` e retorne;
3. se `order.status !== 'paid'`: `markFailed({ orderId, error: 'order_not_paid', now: now() })` e retorne;
4. se `order.buyerEmail` for `null`/vazio: `markFailed({ orderId, error: 'missing_buyer_email', now: now() })` e retorne;
5. `const event = await deps.events.findBySlug(order.eventSlug)` — se `null`: `markFailed({ orderId, error: 'event_not_found', now: now() })` e retorne;
6. monte a mensagem com `buildOrderConfirmationEmail({ orderId: order.id, buyerEmail: order.buyerEmail, eventTitle: event.title, eventStartsAt: event.startsAt, venueName: event.venueName, venueCity: event.venueCity, venueState: event.venueState, items: order.items, subtotalCents: order.subtotalCents, serviceFeeCents: order.serviceFeeCents, totalCents: order.totalCents })` — os itens do pedido já têm `sectorSlug`/`sectorName`/`rowLabel`/`seatLabel`/`ticketType`/`priceCents` ✓;
7. `await deps.emailSender.send(message)` — no sucesso, `markSent({ orderId, now: now() })`; na falha, `markFailed({ orderId, error: <mensagem do erro>, now: now() })` **e relance** o erro.

O `now` é `deps.now ?? (() => new Date())`.

- [ ] **Step 6: O worker**

Em `apps/api/src/modules/emails/create-emails-worker.ts`, espelhe `apps/api/src/modules/payments/create-payments-worker.ts`: `new Queue<OrderConfirmationJobData>(EMAILS_QUEUE_NAME, { connection, defaultJobOptions: EMAIL_JOB_OPTIONS })`, um `new Worker<OrderConfirmationJobData, unknown>(EMAILS_QUEUE_NAME, async (job) => createOrderConfirmationJob(deps)(job.data), { connection })` com os listeners `completed`/`failed` (o `failed` loga `[worker] email job failed`), e as dependências montadas com `DrizzleOrderRepository`, `DrizzleEventsRepository`, `DrizzleOrderConfirmationRepository` e `createSmtpEmailSender()`.

- [ ] **Step 7: Registre o worker nos dois processos**

- `apps/api/src/worker.ts`: após o bloco de pagamentos, crie o worker de e-mails com a **mesma** `connection` já existente no arquivo e inclua `queue`/`worker` no `shutdown()`.
- `apps/api/src/index.ts`: crie o worker de e-mails com a **mesma** `connection` já usada pelo worker de pagamentos (ela já está com `maxRetriesPerRequest = null`) e inclua `queue`/`worker` no `shutdown()` já existente — é o que permite o E2E (que não sobe o processo `worker.ts`) receber o e-mail.

- [ ] **Step 8: O teste de integração com fila real**

Crie `apps/api/src/modules/emails/jobs/order-confirmation.integration.spec.ts` (Postgres + Redis reais, com `resetDatabase`/`flushTestRedis` no `beforeEach`, como em `apps/api/src/modules/orders/use-cases/confirm-order-payment.integration.spec.ts`): enfileire o job numa fila BullMQ real, espere o worker consumir e afirme que (a) a linha em `order_confirmation_emails` ficou `sent` com `sent_at` preenchido e (b) o e-mail foi capturado pelo `EmailSender` fake com o `to` e o `subject` do pedido. Depois rode o **mesmo** job de novo (reentrega) e afirme que o `EmailSender` **não** foi chamado de novo e a linha continua `sent`.

- [ ] **Step 9: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/emails`
Expected: PASS (unitário + integração).

- [ ] **Step 10: Verifique e commit**

Run: `pnpm --filter @ticketvibe/api test` (suíte completa — reporte o total), `pnpm --filter @ticketvibe/api exec tsc --noEmit`, `pnpm --filter @ticketvibe/api exec biome check src` e `pnpm --filter @ticketvibe/api db:migrate`
Expected: tudo limpo.

```bash
git add apps/api/src/db apps/api/drizzle apps/api/src/modules/emails apps/api/src/worker.ts apps/api/src/index.ts
git commit -m "feat(api): send the order confirmation email from a worker job"
```

---

### Task 5: O e-mail é enfileirado na confirmação do pagamento

O job de pagamento é quem sabe que o pedido ficou pago. Ele enfileira o e-mail e não se importa com o resultado do envio (o e-mail é outro job, outro worker).

**Files:**
- Modify: `apps/api/src/modules/orders/use-cases/confirm-order-payment.use-case.ts`
- Modify: `apps/api/src/modules/orders/use-cases/confirm-order-payment.use-case.spec.ts`
- Modify: `apps/api/src/modules/payments/jobs/process-payment-event.ts`
- Modify: `apps/api/src/modules/payments/jobs/process-payment-event.spec.ts`
- Modify: `apps/api/src/modules/payments/create-payments-worker.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `OrderConfirmationQueue` (`enqueue({ orderId })`).
- Produces:
  - `ConfirmOrderPaymentUseCase.execute` devolve `{ kind: 'paid'; orderId: string }` e `{ kind: 'already'; status: OrderStatus; orderId: string }` (os demais kinds seguem sem `orderId`).
  - `createProcessPaymentEventJob({ confirmOrderPayment, failOrder, orderConfirmationQueue })`.

- [ ] **Step 1: Escreva os testes que falham**

- Em `process-payment-event.spec.ts` (pt-BR): com um `orderConfirmationQueue` fake, um evento `succeeded` cujo `confirmOrderPayment` devolve `{ kind: 'paid', orderId: 'pedido-1' }` ⇒ `orderConfirmationQueue.enqueue` foi chamado **uma** vez com `{ orderId: 'pedido-1' }`; o mesmo evento cujo `confirmOrderPayment` devolve `{ kind: 'already', status: 'paid', orderId: 'pedido-1' }` ⇒ também enfileira (é o caminho do retry depois de uma queda entre a captura e o enfileiramento); um evento `failed`/`expired`/`ignored` ⇒ **não** enfileira.
- Em `confirm-order-payment.use-case.spec.ts`: ajuste os casos existentes de `paid`/`already` para o novo shape com `orderId`.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/payments/jobs src/modules/orders/use-cases/confirm-order-payment.use-case.spec.ts`
Expected: FAIL — o `orderId` não é devolvido e o enqueue não existe.

- [ ] **Step 3: O use-case devolve o `orderId`**

Em `confirm-order-payment.use-case.ts`, o resultado `paid` passa a ser `{ kind: 'paid', orderId: order.id }` e o `already` passa a ser `{ kind: 'already', status, orderId: order.id }` — o `orderId` é o do pedido encontrado (nos dois pontos em que `already` é devolvido: a checagem inicial e o retorno do gateway) ✓.

- [ ] **Step 4: O job de pagamento enfileira o e-mail**

Em `process-payment-event.ts`, `createProcessPaymentEventJob` recebe `orderConfirmationQueue: OrderConfirmationQueue` e, no ramo `succeeded`, guarda o resultado:

```ts
const result = await deps.confirmOrderPayment.execute({ providerRef, amountCents: data.amountCents });
if (result.kind === 'paid' || (result.kind === 'already' && result.status === 'paid')) {
  await deps.orderConfirmationQueue.enqueue({ orderId: result.orderId });
}
```

- [ ] **Step 5: O worker de pagamentos monta a fila de e-mails**

Em `create-payments-worker.ts`, crie a fila de e-mails (`createBullMqOrderConfirmationQueue({ connection: input.connection })`) e passe-a ao `createProcessPaymentEventJob` ✓. Devolva-a também no objeto de retorno (`emailQueue`), e em `worker.ts` e `index.ts` inclua `emailQueue.close()` nos `shutdown()` correspondentes. O worker de e-mails em si é o da Task 4 (não duplique a factory).

- [ ] **Step 6: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/api exec vitest run src/modules/payments src/modules/orders`
Expected: PASS.

- [ ] **Step 7: Verifique e commit**

Run: `pnpm --filter @ticketvibe/api test` (suíte completa — reporte o total), `pnpm --filter @ticketvibe/api exec tsc --noEmit` e `pnpm --filter @ticketvibe/api exec biome check src`
Expected: tudo limpo.

```bash
git add apps/api/src/modules/payments apps/api/src/modules/orders
git commit -m "feat(api): enqueue the confirmation email when the payment is captured"
```

---

### Task 6: E2E — comprar e ver o e-mail no Mailpit

**Files:**
- Create: `apps/web/tests/e2e/helpers/checkout.ts`
- Create: `apps/web/tests/e2e/checkout-email.spec.ts`
- Modify: `apps/web/tests/e2e/checkout.spec.ts` (usa o helper extraído, sem mudar as asserções)
- Modify: `apps/web/tests/e2e/helpers/mailpit.ts`

**Interfaces:**
- Consumes: `registerVerifiedBuyer`/`WEB` (`helpers/auth.ts`), `signStripeWebhook` (`helpers/stripe.ts`), a API do Mailpit (`http://127.0.0.1:8025/api/v1`).
- Produces:
  - `helpers/mailpit.ts`: `waitForEmail(request, to, subjectFragment): Promise<{ subject: string; text: string }>` (mesma mecânica de `waitForEmailLink`, mas devolvendo assunto e texto).
  - `helpers/checkout.ts`: `approvePayment(request, order: { providerRef: string; totalCents: number }): Promise<string>` (a função hoje local de `checkout.spec.ts`, extraída sem alteração de comportamento). `readLatestOrder` **permanece** em `helpers/orders.ts` — não a mova.

- [ ] **Step 1: Escreva o teste que falha (red)**

Crie `apps/web/tests/e2e/checkout-email.spec.ts` (título em pt-BR): `compra dispara o e-mail de confirmação para o comprador`. Sequência: `registerVerifiedBuyer` → escolher `Cadeira 6, fila A` na página de ingressos → "Finalizar compra" → "Pagar" → ler o pedido mais recente (`readLatestOrder`, de `helpers/orders.ts`) → `approvePayment` (webhook assinado) → `waitForEmail(request, email, 'Compra confirmada')` → o texto do e-mail contém `Total: R$ 132,00` e `Plateia · Fila A · Cadeira 6`.

O spec precisa da mesma higiene do `checkout.spec.ts`: `test.setTimeout(60_000)`, um `afterEach` que chama `restoreSeat('6')`, `deleteOrdersByBuyer([...buyerEmails])` e `deletePaymentEvents([...providerEventIds])` (e limpa os sets), e a coleta do `eventId` devolvido por `approvePayment` em `providerEventIds`. Se a compra exigir login (o checkout redireciona para a conta), siga a mesma sequência do teste existente: sair, escolher o assento, finalizar, entrar, voltar ao checkout.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @ticketvibe/web exec playwright test tests/e2e/checkout-email.spec.ts`
Expected: FAIL — o e-mail não chega (o worker/job ainda não existem ou o helper `waitForEmail` não existe).

- [ ] **Step 3: O helper do Mailpit**

Em `apps/web/tests/e2e/helpers/mailpit.ts`, acrescente `waitForEmail(request, to, subjectFragment)`: lista as mensagens (`GET /api/v1/messages?limit=20`), acha a que tem o assunto e o destinatário, busca o corpo (`GET /api/v1/message/{id}`) e devolve `{ subject: <assunto>, text: <Text> }`; se não chegar em 20 s, lança um erro em pt-BR com o mesmo formato de `waitForEmailLink` ✓.

- [ ] **Step 4: Extraia o helper do checkout**

Mova `approvePayment` para `apps/web/tests/e2e/helpers/checkout.ts` e faça `checkout.spec.ts` importar de lá — **sem alterar as asserções** dos dois testes existentes e sem mover nenhum outro helper.

- [ ] **Step 5: Rode e veja passar**

Run: `pnpm --filter @ticketvibe/web exec playwright test tests/e2e/checkout-email.spec.ts tests/e2e/checkout.spec.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Verifique a suíte E2E inteira**

Run: `pnpm --filter @ticketvibe/web exec playwright test`
Expected: PASS (os 30 anteriores + 1 novo = 31). Rode `tests/e2e/checkout-email.spec.ts` **duas vezes seguidas** e reporte os dois resultados — o e-mail não pode vazar de um teste para o outro (cada teste usa um e-mail de comprador diferente ✓).

- [ ] **Step 7: Verifique e commit**

Run: `pnpm --filter @ticketvibe/web exec tsc --noEmit` e `pnpm --filter @ticketvibe/web exec biome check tests`
Expected: limpos.

```bash
git add apps/web/tests/e2e
git commit -m "test(web): cover the order confirmation email end to end"
```

---

### Task 7: Gates finais e fechamento da issue 14

**Files:**
- Modify: `.scratch/ticketvibe/issues/14-email-de-confirmacao-de-compra.md`

- [ ] **Step 1: Rode os gates**

Run, em sequência: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @ticketvibe/web exec playwright test`, `pnpm build`, `pnpm --filter @ticketvibe/api exec drizzle-kit check`.
Expected: lint 0 erros (1 info pré-existente em `db/test-helpers.ts`), typecheck 5/5, suíte completa verde, E2E verde, build ok, drizzle limpo. **Reporte os números reais** (total de testes por workspace e o total do E2E).

- [ ] **Step 2: Feche a issue**

Em `.scratch/ticketvibe/issues/14-email-de-confirmacao-de-compra.md`: `Status: ready-for-agent` → `Status: done`; marque os 5 critérios com `[x]`; acrescente as seções **Implementação** (tabela Task|Commit|Escopo com os SHAs reais) e **Gates finais** (com os números do Step 1); acrescente **Deferrals**:
- o e-mail é **texto puro** (sem HTML) e não traz o QR Code — o ingresso digital com QR é o ticket 15;
- a política de reenvio (o que o comprador recebe quando o e-mail se perde) fica com o ticket 21 (regras de reembolso/cancelamento);
- não há "varredura" (sweeper) de pedidos pagos sem e-mail enviado: a garantia vem do retry do job de pagamento (que reenfileira o e-mail ao ver o pedido `paid`) — um reconciliador dedicado fica para um ticket posterior;
- a proteção contra `__proto__`/prototype poisoning do parser JSON e a paridade total do `secure-json-parse` seguem pendentes (já registradas na issue 13);
- o e-mail vai para o endereço cadastrado no momento da compra (`orders.buyer_email`), sem verificação de `email_verified` no momento do envio.

- [ ] **Step 3: Commit**

```bash
git add .scratch/ticketvibe/issues/14-email-de-confirmacao-de-compra.md
git commit -m "docs(agents): close ticket 14 with implementation notes"
```

Expected: working tree limpa e a sequência de commits do ticket 14 no topo da `main`.
