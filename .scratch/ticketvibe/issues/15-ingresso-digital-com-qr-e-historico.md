# 15: Ingresso digital com QR Code + histórico de pedidos

**What to build:** O comprador acessa sua conta e vê todo o histórico de pedidos; abrindo um pedido, encontra seus ingressos digitais com QR Code prontos para a entrada no evento.

**Blocked by:** 14 (E-mail de confirmação de compra)

**Status:** done

- [x] Rota REST de histórico de pedidos do usuário autenticado, schema Zod compartilhado
- [x] Geração de QR Code único por ingresso, vinculado ao pedido e ao assento
- [x] Página de conta com lista de pedidos (status, evento, valores) e detalhe com ingressos renderizando os QR Codes
- [x] Ingresso de pedido expirado/cancelado não é mais válido para entrada
- [x] Testes: integração das rotas de pedido, unitários da geração/desvalidação do QR, componente com MSW, E2E de comprar → ver QR na conta

## Implementação

Plano: `docs/superpowers/plans/2026-10-21-ticket-15-ingresso-digital-qr-historico.md` (commit `1c04ee2`), executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com rodadas de fix).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `46f10ac` | `ticket-entity` (`generateTicketCode` com `randomBytes(16).toString('base64url')` e `ticketStatusFor`, válido só em `paid`) + contrato compartilhado do ingresso e do item (`orderTicketSchema`, `orderItemSchema.ticket`, `orderSummarySchema`, `orderListResponseSchema`) e `sectorName` no item do pedido; `order-confirmation` passa a mostrar o nome do setor |
| 2 | `faf41f6` | Tabela `tickets` (`order_id`, `order_item_id`, `seat_id`, `code`) + migração `0010_slippery_matthew_murdock.sql`, índices únicos `tickets_code_unique` e `tickets_order_item_unique`, `TicketRepository` (Drizzle) e emissão de **um ingresso por item** dentro da transação da captura (`drizzle-seat-capture-gateway`) |
| 3 | `57e20ab` | `GET /orders` (histórico do usuário da sessão, no máximo 50, evento resolvido em lote com degradação para o slug/data do pedido) e `GET /orders/:id` com `ticket: { code, status }` por item (`status` derivado de `ticketStatusFor(order.status)`); `listByUser` no repositório e `findBySlugs` no repositório de eventos |
| 4 | `f1f1236` + `2754b64` | Proxy web `GET /api/orders`, página `/conta`, componente `AccountOrders` (status, evento, data, total e quantidade de ingressos) e link "Minha conta"; testes do proxy e dos estados da página com MSW |
| 5 | `9725d77` + `97261d3` | Dependência `qrcode.react`, `TicketQr` (QR no cliente com o código em texto abaixo), `OrderTickets` (setor, fila, cadeira, tipo, preço, QR e selo de validade) e página `/conta/pedidos/[id]`; o fix `97261d3` acrescenta o resumo do evento ao detalhe (`orderDetailResponseSchema`) e zera o estado da página ao trocar de pedido |
| 6 | `57c6140` | E2E `account.spec.ts`: comprar → confirmar o pagamento pelo webhook assinado → ver o pedido na conta → abrir o detalhe e encontrar "Plateia · Fila A · Cadeira 1", o selo "Válido para entrada" e o `svg` do QR Code |
| 7 | `ed6ad20` | Gates finais e fechamento da issue |
| 8 | `1479113` + `3a12aa5` | Onda única de fixes da revisão final de branch: índice `tickets_order_id_idx` (migração `0011_busy_rhino.sql`) para a única query de ingressos, linha "Pagamento" no detalhe (cartão/boleto) e 401 do detalhe redirecionando para `/entrar` |

Correção transversal (saiu da revisão da Task 5):

| Commit | Escopo |
|---|---|
| `97261d3` | O `OrderDto` carrega só o `eventSlug`, então o detalhe não tinha título nem data do evento na tela; a API passou a responder `orderDetailResponseSchema` (`{ order, event: { slug, title, startsAt } \| null }`) e o web valida por esse schema. O `useEffect` da página também passou a limpar `order`/`event` e voltar para `loading` antes de buscar, para que a troca de pedido não exiba por um instante os dados do pedido anterior |

## Gates finais (21/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `apps/api/src/db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test` | API 410 (63 arquivos), web 277 (46 arquivos), shared 81 (1 arquivo) — todos pass, execução fresca (`--force`) |
| Playwright (E2E) | 32/32 (account 1 + checkout 2 + checkout-email 1 + demais 28) |
| `pnpm build` | web build ok (após a onda de fixes) |
| `drizzle-kit check` | limpo (`Everything's fine`) |

Os números acima foram reconfirmados no HEAD final (`3a12aa5`) pelo controlador, depois da onda de fixes da revisão de branch: lint 0 erros (1 info pré-existente), typecheck 5/5, `pnpm test --force` com API 410 / web 277 / shared 81, Playwright 32/32, build ok e drizzle limpo.

Cobertura dos critérios: histórico REST do usuário autenticado com schema Zod compartilhado (`GET /orders` + `orderListResponseSchema`/`orderSummarySchema`, 401 para sessão ausente ou anônima, pedidos apenas do usuário da sessão); QR único por ingresso vinculado ao pedido e ao assento (`generateTicketCode` de 22 caracteres + índices únicos de `code` e `order_item_id`, ingresso emitido na mesma transação da captura e renderizado no cliente por `qrcode.react`); página de conta com a lista e o detalhe com os QR Codes (`/conta`, `/conta/pedidos/[id]`, `AccountOrders`/`OrderTickets`); ingresso de pedido expirado/cancelado inválido para entrada (validade derivada do status do pedido via `ticketStatusFor`, sem flag guardada — spec de rota cobre pedido `expired` com `ticket.status = 'invalid'` e pedido `pending` com `ticket: null`); testes de integração das rotas e da emissão, unitários do domínio do ingresso, componentes com MSW e o E2E de comprar → ver o QR na conta.

Nenhuma falha apareceu nos gates finais: não foi preciso ajustar produto nem teste no fechamento.

## Deferrals do ticket 15

- O QR Code é renderizado no cliente a partir de um código opaco; o conteúdo do QR é o **código puro** (não uma URL). O link "abrir o ingresso" e a validação na entrada ficam para o ticket 20.
- Não há registro de "check-in" (uso do ingresso): ele nasce com o ticket 20.
- A validade do ingresso é derivada do status do pedido; um reembolso (ticket 21) invalida o ingresso por consequência, sem rotina extra.
- O e-mail de confirmação (ticket 14) continua sem QR — o QR aparece na conta.
- `sectorName` passou a integrar o contrato do item do pedido (o carrinho e a confirmation já usavam o nome), o que fecha o deferral registrado nas issues 13/14.
- O histórico mostra no máximo os **50 pedidos mais recentes**, sem paginação: o limite é fixo na rota (`listByUser({ limit: 50 })`), sem cursor nem página.
- A resposta do detalhe carrega o resumo do evento (`orderDetailResponseSchema = { order, event }`) em vez de estender o `OrderDto`; `OrderDto`/`orderResponseSchema` não mudaram, então checkout e confirmação seguem intactos.
- Os ingressos são casados com os itens do pedido por `seatId`: o registro de item no domínio (`OrderItemRecord`) não carrega o `id`, então `serializeOrder` indexa os ingressos pelo assento; a garantia de um ingresso por item continua no banco (`tickets_order_item_unique`).
- Não há backfill de ingressos para pedidos pagos antes da migração `0010`: esses pedidos abrem o detalhe com `ticket: null` e a tela mostra "Ingresso ainda não emitido".
- O trio de E2E tem **4 testes** (`account` 1, `checkout` 2, `checkout-email` 1) — o plano previa 5; nenhum teste foi perdido (a suíte completa é 32 = 31 anteriores + 1 novo).
- O login não preserva o destino: quem cai em `/entrar` a partir da conta volta para a home, não para `/conta` (falta um `?next=`). A confirmação de compra também não tem um link direto "Ver meus ingressos" — o caminho para o QR depende do "Minha conta" no header.
- A lista mostra a quantidade de **itens** do pedido mesmo quando nenhum ingresso foi emitido (pedidos legados ou expirados), e o detalhe usa "Ingresso ainda não emitido" também para pedidos que nunca terão ingresso; copy por status fica para quando houver reemissão (ticket 21).
