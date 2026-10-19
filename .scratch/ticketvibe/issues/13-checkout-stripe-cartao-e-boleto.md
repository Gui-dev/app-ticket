# 13: Checkout Stripe (cartão/boleto)

**What to build:** O comprador logado vê o resumo do pedido com preço, taxa de serviço e total, paga com cartão ou boleto no Stripe (sandbox) e, na confirmação do pagamento, recebe seu pedido confirmado com os assentos definitivamente seus — operação atômica: ou o pagamento confirma e o assento é fixado, ou tudo volta ao estado anterior.

**Blocked by:** 12 (Carrinho de evento único), 08 (Conta: e-mail e senha)

**Status:** done

- [x] Resumo de checkout exibindo preço, taxa de serviço (cobrada do comprador) e total
- [x] Camada de pagamento abstraída por interface com implementação Stripe (sandbox: cartão e boleto)
- [x] Webhook Stripe processado de forma idempotente via worker (reentregas não duplicam pedido)
- [x] Transação de banco que confirma o pedido e fixa os assentos somente com pagamento aprovado; falha/expiração libera tudo
- [x] Pedido criado na conta do comprador com valores e status
- [x] Testes: integração da corrida pagamento×expiração, unitários do cálculo de taxa, E2E de compra completa simulando o webhook

## Implementação

Plano: `docs/superpowers/plans/2026-10-18-ticket-13-checkout-stripe-cartao-e-boleto.md` (commits `002248f` e `3c066c9`), executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com rodadas de fix).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `d195841` | Contratos shared: `orderTotals`/`serviceFeeCents` (taxa de 10% do subtotal, `SERVICE_FEE_BPS = 1000`), schemas de pedido (`orderSchema`, `createOrderRequestSchema`, `createOrderResponseSchema`, `orderResponseSchema`) |
| 2 | `c23db02` | Tabelas `orders`, `order_items`, `payment_events` + migração `0007_large_outlaw_kid.sql`; índice único parcial que garante **um** pedido `pending` por (comprador, evento) |
| 3 | `4f37b38` + `7ab5310` | Domínio de pedidos: `OrderRepository` (Drizzle), `PaymentEventRepository` e `SeatCaptureGateway` — captura atômica (`FOR UPDATE` em pedidos+assentos) com decisão pura `decideOrderCapture`; liberação de assentos de pedidos não pagos e guarda de transições terminais |
| 4 | `addb674` + `cec4188` | `PaymentProvider` + implementações Stripe (sandbox, cartão/boleto) e fake; verificação de assinatura HMAC (`t=…,v1=…`) e mapeamento de evento Stripe compartilhados pelos dois providers |
| 5 | `8b25169` + `d2c73c7` + `76a0c17` | `CreateOrderUseCase`: resumo do carrinho, taxa, `PaymentIntent`, renovação dos holds, reuso idempotente do pedido pendente e `seat_unavailable` (nunca subcobra o comprador) |
| 6 | `6a59e3c` + `2441ec6` | `ConfirmOrderPaymentUseCase`, `FailOrderUseCase` e `ExpirePendingOrdersUseCase`, `CartRepository.clear`, job `process-payment-event` e registro do worker da fila `payments` (com expiração de pedidos pendentes) |
| 7 | `e282931` + `44221f3` | Rota `POST /webhooks/stripe` (rawBody, assinatura no provider, dedupe por `payment_events`, enfileiramento sempre), fila BullMQ com `jobId`, worker in-process na API e wiring no `worker.ts` |
| 8 | `4069884` + `29b80eb` | `POST /events/:slug/orders` (201/400/401/404/409/502) e `GET /orders/:id` (200/404, escopado ao comprador) + wiring; limpeza de banco entre specs de ordem |
| 9 | `862529b` | Migração dos dados anônimos no link de conta (`onLinkAccount`): holds e carrinho no Redis (preservando TTL) |
| 10 | `33f18b7` + `2a205a7` | Proxies web `POST /api/events/[slug]/orders` e `GET /api/orders/[id]` (validação nos contratos, passthrough do erro do upstream) |
| 11 | `34847ef` + `f11ac44` + `015c5c1` | UI de checkout: resumo com taxa e total, cartão/boleto, Payment Element do Stripe, painel de pagamento simulado, polling do pedido e confirmação; botões bloqueados até o Stripe.js carregar |
| 12 | `6c573a6` + `f47ce47` + `b6ca2cc` | E2E do checkout: compra completa com webhook assinado e pagamento aprovado sem assento (pedido `failed` + assento liberado) |
| 13 | este commit | Gates finais e fechamento da issue |

Correções transversais (saíram das revisões por task):

| Commit | Escopo |
|---|---|
| `3652234` | O reuso do pedido pendente devolve o `clientSecret` do PaymentIntent existente (`PaymentProvider.retrieveClientSecret`) — sem isso o comprador que recarrega a página ficava numa tela de pagamento sem Element e sem forma de pagar, e o duplo clique deixava de ser "um PaymentIntent" |
| `e1bf654` | Sessão anônima não cria pedido (401): o pedido precisa pertencer a uma conta real (a migração do ticket 9 cobre holds e carrinho, não pedidos) |
| `33f88c9` | Pagamento aprovado que chega a um pedido já `failed`/`expired` é **reembolsado** (o boleto pago depois do TTL e o retry de cartão não podem cobrar sem devolver); reembolso idempotente por chave estável no provider Stripe |
| `82061a1` | O reuso do pedido pendente só acontece quando o pedido ainda bate com o carrinho; se o comprador mudou o carrinho, o pedido antigo é aposentado e um novo é criado — assim o valor cobrado é sempre o valor exibido |
| `d917d2b` | Job de pagamento com `attempts`/backoff (um reembolso que falhou agora se recupera no retry); POST duplicado concorrente responde reaproveitando o pedido vencedor (503 `order_in_progress` enquanto o PI não existe) em vez de 500; reserva perdida durante a criação do pedido vira `seat_unavailable` (409) em vez de cobrança |
| `799010e` | O parser JSON customizado (exigido pelo rawBody do webhook) volta a devolver **400** com os códigos do Fastify para corpo vazio, JSON inválido ou com `__proto__` no topo — antes devolvia 500 em todas as rotas |
| `8a5b7ed` | Boleto confirma com `redirect: 'always'` (voucher hospedado do Stripe) e o checkout trata o 503 `order_in_progress` com mensagem própria |
| `ffd9b9a` | Parser JSON recusa `__proto__` no nível principal (paridade com o `secure-json-parse` padrão do Fastify) |
| `b81c3ee` | Pagamento aprovado que chega a um pedido terminal **dentro da transação de captura** também é reembolsado (a janela entre a leitura e o `FOR UPDATE`) |
| `b671724` | A recuperação de pedido concorrente só reaproveita quando o pedido **bate com o carrinho**; divergência propaga o erro em vez de devolver um pedido com outro valor |
| `3f58276` | `PaymentProvider.cancelPayment` (best-effort) cancela o PaymentIntent do pedido aposentado, para que o pagamento do intent antigo não derrube os assentos do pedido novo |
| `e31404b` | Job de pagamento com 6 tentativas, backoff de 5 s e `removeOnFail` (um job falho não bloqueia a reexecução de uma reentrega real) |
| `b76e13c` | A resposta `503 order_in_progress` volta a ser alcançável (pedido concorrente ainda sem PaymentIntent): o comprador tenta de novo |
| `b81c3ee` | Pagamento que chega a um pedido já terminal **dentro** da transação de captura (`{ kind: 'already', status: 'failed' \| 'expired' }`) é **reembolsado** — o comprador pagou, os assentos foram liberados e o dinheiro tinha de voltar; o caminho terminal e o caminho `already` compartilham um único `refundAndReleaseSeats` |
| `b671724` | A recuperação do POST duplicado concorrente só reaproveita o pedido pendente que **bate com o carrinho**; quando não bate, o erro original é repassado e nenhum pedido é devolvido — assim o valor cobrado é sempre o valor exibido |
| `b76e13c` | O `503 order_in_progress` volta a ser alcançável: na recuperação concorrente o pedido pendente que bate com o carrinho é reusado mesmo sem `providerRef` (requisição viva que ainda não criou o `PaymentIntent`); a regra do `providerRef` continua valendo só na primeira leitura, onde o pedido sem `providerRef` é uma tentativa morta e é aposentado |
| `3f58276` | Aposentar um pedido pendente **cancela** o `PaymentIntent` dele (`PaymentProvider.cancelPayment`, best effort) — sem isso o comprador ficava com duas intenções vivas e, ao pagar a velha, o reembolso liberava o assento que o pedido novo segurava |
| `e31404b` | Job de pagamento com orçamento de retentativa maior (6 tentativas, base exponencial de 5 s) e `removeOnFail: true` — sem remover o job falhado o hash sobrevivia e uma reentrega legítima do Stripe não conseguia mais rodar o job |

### Gates finais (19/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test` | API 365, web 254, shared 73 — todos pass |
| Playwright (E2E) | 30/30 (checkout 2 + demais 28) |
| `pnpm build` | web build ok |
| `drizzle-kit check` | limpo |

Cobertura dos critérios: resumo com preço/taxa/total (`orderTotals` em `shared` + UI de checkout + E2E com `Total: R$ 132,00`); camada de pagamento por interface com Stripe e fake (`PaymentProvider`); webhook idempotente via worker (`payment_events` + `process-payment-event` + BullMQ; a reentrega é coberta pelos specs de API — o E2E envia um webhook por compra); transação de confirmação/liberação (`SeatCaptureGateway.confirmOrderPayment` com `FOR UPDATE`, mais `fail`/`expire`, com a corrida pagamento×expiração em spec de integração real); pedido na conta do comprador (`orders`/`order_items` + `POST /orders` + `GET /orders/:id`); testes de taxa, corrida e E2E de compra completa com webhook simulado.

Bug encontrado pelo E2E e corrigido no fechamento (`6c573a6`): `seedFixtures` não conseguia rodar de novo depois que existiam pedidos (a FK `order_items`→`seats` é `ON DELETE no action`), então a suíte E2E só rodava uma vez por banco semeado. Agora o seed apaga `payment_events` → `order_items` → `orders` antes de reassentar.

### Configuração (pendência de go-live)

| Onde | Variável | Observação |
|---|---|---|
| API | `PAYMENT_PROVIDER=stripe` | Opcional: sem ela o provider **fake** é usado (é o modo dos testes e do E2E) |
| API | `STRIPE_SECRET_KEY` | Obrigatória com `PAYMENT_PROVIDER=stripe` |
| API | `STRIPE_WEBHOOK_SECRET` | Assinatura do webhook; o provider fake usa `whsec_test` |
| Web | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Sem ela o checkout mostra "O pagamento online está indisponível neste momento." |

## Deferrals do ticket 13

- Pix (modo live do Stripe): fora — entra quando o provedor migrar para live.
- Split/Connect e `platform_fee_cents`/`organizer_net_cents` no pedido: ticket 22.
- Política e regras de reembolso ao comprador (hoje só existe o reembolso automático do caminho "aprovado sem assento"): ticket 21. Nota: a ordem dos efeitos é deliberada — marcar o pedido terminal **antes** do reembolso troca "reembolso perdido" por "reembolso duplo"; o retry do reembolso depende de idempotency key no port e entra no ticket 21.
- Auto-renew dos holds na página de checkout: adiado (D12); o TTL de 10 min continua valendo e é renovado na criação do pedido.
- Boleto **real** do Stripe não é exercitado em teste (exige rede): a integração é coberta pelo provider fake com assinatura real; a verificação manual contra o sandbox fica como pendência de go-live.
- Carrinho/checkout multi-evento: não suportado (fora do escopo da spec).
- Rate limiting/antifraude do endpoint de webhook: não implementado (inferência local).
- O DTO do carrinho não tem `sectorName`, então o resumo do checkout mostra o slug do setor ("plateia") enquanto o mapa mostra o nome ("Plateia") — adiado (contrato compartilhado + consulta ao setor).
- A liberação de holds do "Desistir de todos" engole o erro de release (comportamento pré-existente em `seat-map.tsx`): gera flake conhecido no E2E de carrinho, fora do escopo deste ticket.
- O parser JSON do Fastify foi substituído (o webhook precisa do corpo cru) e recusa `__proto__` no nível principal, mas não em nível aninhado nem a chave `constructor`: paridade total exigiria `secure-json-parse` como dependência direta da API, adiada para um ticket à parte.
- `releaseOrderSeats` libera o assento pela reserva do comprador (`status`/`holdUserId`), sem checar a qual pedido a reserva pertence: com a(intent) do pedido antigo cancelada, o gatilho foi removido, mas a guarda em si fica para um ticket próprio (exigiria registrar o pedido dono da reserva).
- Não há rastro durável do reembolso (o pedido fica `failed`/`expired` sem marca de reembolsado): o modelo de reembolso e o suporte ao comprador são do ticket 21, que deve definir esse registro.
