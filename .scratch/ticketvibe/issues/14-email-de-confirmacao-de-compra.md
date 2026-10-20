# 14: E-mail de confirmação de compra

**What to build:** Logo após o pagamento confirmado, o comprador recebe um e-mail com a confirmação do pedido e seus ingressos, visualizando a mensagem no Mailpit durante o desenvolvimento — sem o e-mail atrasar ou perder a compra.

**Blocked by:** 13 (Checkout Stripe)

**Status:** done

- [x] Job BullMQ no worker enviado após confirmação do pagamento (desacoplado do checkout)
- [x] E-mail de confirmação com resumo do pedido e ingressos, entregue no Mailpit em dev
- [x] Reentrega do job (retry) não envia e-mail duplicado para o mesmo pedido
- [x] Falha de envio é observável e reprocessável, sem travar a compra
- [x] Testes: unitários do template/dados do e-mail, integração do job (fila real), E2E de comprar → e-mail aparece na API do Mailpit

## Implementação

Plano: `docs/superpowers/plans/2026-10-20-ticket-14-email-de-confirmacao-de-compra.md` (commits `8144966`, `2291d23`, `3d7d3da`, `2e52901` e `4ccf44d`), executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com rodadas de fix).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `1be8c9f` | `formatBRL`/`formatDatePtBR`/`TICKET_TYPE_LABELS` no `packages/shared` (o web passa a reexportar em vez de duplicar), port `EmailSender` e template puro `buildOrderConfirmationEmail` (`{ to, subject, text }`) com pedido, evento, data, local, ingressos, subtotal, taxa e total |
| 2 | `80b3d7e` | `orders.buyer_email` e `order_items.sector_name` (nullable) + migração `0008_nervous_beast.sql`: o pedido guarda o e-mail do comprador e o nome do setor no momento da compra |
| 3 | `882995d` | Módulo de e-mails: `createSmtpTransport`/`createSmtpEmailSender` (o módulo de auth passa a reusar o mesmo transporte) e o port/impl da fila `emails` (`OrderConfirmationQueue` com `jobId` determinístico `order-confirmation-<orderId>`) |
| 4 | `0e9f10d` + `d531a21` + `d96d67b` | Job `order-confirmation` (decide sozinho se há e-mail a enviar), repositório do estado de envio, tabela `order_confirmation_emails` + migração `0009_groovy_dagger.sql`, worker `createEmailsWorker` registrado nos dois processos (`src/worker.ts` e `src/index.ts`, consumidor in-process) e teste de integração com fila real (Postgres + Redis) |
| 5 | `5f061c5` | `ConfirmOrderPaymentUseCase` devolve o `orderId`; o job de pagamento enfileira o e-mail quando o pedido fica `paid` — e também no caminho `already`/`paid`, que é o retry depois de uma queda entre a captura e o enfileiramento |
| 6 | `72a7910` | E2E de comprar → e-mail no Mailpit (`checkout-email.spec.ts`), helper `approvePayment` extraído para `helpers/checkout.ts` e `waitForEmail` no helper do Mailpit |
| 7 | este commit | Gates finais e fechamento da issue |

Correções transversais (saíram das revisões por task):

| Commit | Escopo |
|---|---|
| `d531a21` | Pedido inexistente: o job registra `[worker] email job skipped: order not found` e sai **sem** `markFailed` — a FK `order_confirmation_emails.order_id → orders.id` tornaria o `upsert` inválido e o job falharia sem necessidade |
| `d96d67b` | As opções do job (`attempts: 6`, backoff exponencial de 5 s, `removeOnFail: true`) foram movidas para o contrato da fila (`domain/order-confirmation-queue.ts`) e aplicadas no `add` do produtor e no `defaultJobOptions` do worker — sem isso o job nascia com `attempts: 1` e uma falha de SMTP não era reprocessada |

### Gates finais (20/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test` | API 385, web 254, shared 76 — todos pass |
| Playwright (E2E) | 31/31 (e-mail de confirmação 1 + checkout 2 + demais 28) |
| `pnpm build` | web build ok |
| `drizzle-kit check` | limpo |

Cobertura dos critérios: job BullMQ no worker enviado após a confirmação do pagamento (o job `order-confirmation` na fila `emails`, enfileirado pelo job de pagamento quando o pedido fica `paid`, com o worker registrado no processo do worker e no processo da API); e-mail com resumo do pedido e ingressos entregue no Mailpit em dev (template puro `buildOrderConfirmationEmail` + transporte SMTP apontando para o Mailpit); reentrega sem e-mail duplicado (marcador `sent` em `order_confirmation_emails` + `jobId` determinístico — coberto pelo teste de integração com fila real, que roda o mesmo job duas vezes); falha de envio observável e reprocessável sem travar a compra (`markFailed` com `last_error` + log do worker + erro relançado para o retry do BullMQ); testes de unitários do template/dados do e-mail, de integração do job com fila real e o E2E de comprar → e-mail na API do Mailpit.

### Configuração

O ticket 14 não exigiu nenhuma variável nova: o e-mail usa o mesmo `SMTP_HOST`/`SMTP_PORT` do e-mail de confirmação de conta (padrão `127.0.0.1:1025`, o Mailpit em dev) e a fila `emails` usa o mesmo Redis do resto da API.

## Deferrals do ticket 14

- O e-mail é **texto puro** (sem HTML) e não traz o QR Code: o ingresso digital com QR é o ticket 15.
- A política de reenvio (o que o comprador recebe quando o e-mail se perde) fica com o ticket 21 (regras de reembolso/cancelamento).
- Não há "varredura" (sweeper) de pedidos pagos sem e-mail enviado: a garantia vem do retry do job de pagamento (que reenfileira o e-mail ao ver o pedido `paid`) — um reconciliador dedicado fica para um ticket posterior.
- A proteção contra `__proto__`/prototype poisoning do parser JSON e a paridade total do `secure-json-parse` seguem pendentes (já registradas na issue 13).
- O e-mail vai para o endereço cadastrado no momento da compra (`orders.buyer_email`), sem verificação de `email_verified` no momento do envio.
- A garantia de envio é **at-least-once**: uma queda do processo entre o retorno do SMTP e a gravação do marcador (`order_confirmation_emails.status = 'sent'`) pode produzir um **segundo** e-mail "Compra confirmada" para o mesmo pedido. Exatamente uma vez exigiria um marcador "em andamento" gravado **antes** do envio, com uma história de recuperação própria para os pedidos que travam nesse estado — follow-up, fora do escopo deste ticket.
- A fila `payments` (ticket 13) também mantém os jobs concluídos (não usa `removeOnComplete`), então ela cresce ao longo do tempo junto com o volume de pagamentos — follow-up, fora do escopo deste ticket.
- O worker de pagamentos não tem listener de `error`: um erro fatal do worker fica visível apenas no log genérico do processo, sem o log estruturado que o worker de e-mails faz — follow-up, fora do escopo deste ticket.
