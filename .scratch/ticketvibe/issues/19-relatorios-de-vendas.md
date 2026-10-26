# 19: Relatórios de vendas

**What to build:** O organizador vê, por evento e por período, quantos ingressos vendeu e quanto faturou (já separando a taxa da plataforma), respondendo "como foram minhas vendas?" sem consultar o banco.

**Blocked by:** 18 (CRUD de eventos, locais, setores e lotes), 13 (Checkout Stripe)

**Status:** done

- [x] Endpoint de agregação de vendas por evento/período (ingressos, receita, plataforma fee), restrito ao dono
- [x] Página de relatórios no backoffice com filtros de período e por evento
- [x] Valores batem com os pedidos confirmados do checkout (fonte única: pedidos)
- [x] Testes: integração das agregações com pedidos seedados, componente com MSW, E2E de vender → ver no relatório

## Implementação

Plano: `docs/superpowers/plans/2026-10-24-ticket-19-relatorios-de-vendas.md`, executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com revisão final do branch inteiro).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `38a99e5` | Contratos compartilhados: `organizerSalesReportSchema` (DTO com invariante refineada `net = gross − fee` e `from < to`), `organizerSalesReportResponseSchema` (`{ report }`), `organizerSalesReportQuerySchema` (`from`/`to` ISO opcionais) e tipos `OrganizerSalesReportDto`/`OrganizerSalesReportQuery`/`OrganizerSalesReportResponse`; spec EN (exceção da casa) |
| 2 | `8b0e30b` | Endpoint: port `salesReportForOrganizer` (+ `OrganizerSalesReportRecord`/`SalesReportForOrganizerResult`) no `OrganizerRepository` com implementações in-memory e drizzle em paridade (drizzle: 2 queries — itens agregados com `count(distinct orders.id)` e fees sobre `orders` sem join, taxa nunca dobra por item); use-case pass-through; rota `GET /organizer/events/:id/report?from=&to=` guard-first (401/403 de papel), 404 `event_not_found`, 403 `event_forbidden` (evento próprio estrito: plataforma e alheio bloqueados), 400 `invalid_query` (`from >= to` e datetime inválido); janela por `paid_at` com `>= from` inclusivo e `< to` exclusivo; zero vendas → 200 com zeros; seed in-memory de pedidos estende `InMemoryOrganizerOrderSeed` (status/`paidAt`/fee/itens opcionais com defaults, `has_orders` intocado) |
| 3 | `d405f63` | Web: `fetchOrganizerSalesReport` (+ `invalid_query: 'Período inválido.'` no mapa de erros); página `/organizador/relatorios` com select de eventos próprios (`!platform`, copy `Nenhum evento do organizador ainda.`), período `De`/`Até` via `datetime-local` + helpers SP (`fromDateTimeLocalValue`, vazios omitem o parâmetro), botão `Aplicar`, KPIs `Ingressos vendidos`/`Pedidos pagos`/`Faturamento bruto`/`Taxa da plataforma`/`Líquido do evento` via `formatBRL`, estado `Nenhuma venda no período.`; nav ganha `Relatórios` e painel ganha o atalho |
| 4 | `daced34` | E2E `reports.spec.ts`: organizador cria local + evento + setor (plateia, fila A, 10 lugares, R$ 50) → comprador compra `Cadeira 1, fila A` → checkout (R$ 55,00 com taxa) → `approvePayment` → `Pedido confirmado` → relatório mostra 1 ingresso, 1 pedido pago, `R$ 50,00` / `R$ 5,00` / `R$ 45,00`; período do último dia mantém os números; janela que termina 1h antes da venda → `Nenhuma venda no período.` |
| 5 | (docs) | Gates finais, revisão final do branch e fechamento da issue |

## Gates finais (26/10/2026, HEAD `daced34`)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `apps/api/src/db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test --force` | API 554 (87 arquivos), web 349 (57 arquivos), shared 127 (1 arquivo) — todos pass, execução fresca |
| Playwright (E2E) | 36/36 (inclui `reports.spec.ts` com a jornada vender → pagar → ver no relatório) |
| `pnpm build` | ok (rebuild forçado do turbo para descartar cache) |

Cobertura dos critérios: fontes única = `orders.status = 'paid'` com janela por `paid_at` (from inclusivo, to exclusivo) — pendentes/falhados/expirados ficam fora (testado na unidade, integração e rota); fee da plataforma = Σ `orders.service_fee_cents` por pedido (conta uma vez mesmo com múltiplos itens, query separada sem join) e líquido = bruto − fee (invariante refineada no contrato compartilhado); ownership estrito no dono (evento da plataforma/alheio → 403, inexistente → 404), guidado por todos os spec-focus do plano terem teste comportamental real nas três camadas; zero vendas → 200 com zeros e a página mostra a mensagem de período vazio.

## Deferrals do ticket 19

- **Split por método de pagamento:** o relatório não separa card/boleto nem usa split Stripe — fee segue `serviceFeeCents` do pedido atual (ticket 22).
- **Apenas eventos próprios:** evento da plataforma e alheio → 403; painel de receita "da plataforma" fora de escopo (select da página já filtra `!platform`).
- **Sem série temporal:** KPIs do período como número único; divisão por dia/setor/tipo de ingresso é evolução futura (YAGNI do spec).
- **Sem export:** sem CSV/XLSX no ticket.
- **`OrganizerSalesReportQuery` exportada sem consumo:** a página usa um tipo local; nome fica disponível para reuso (remoção possível numa passada de limpeza).
- **Guard `from >= to` na rota, não no schema:** comportamento 400 pinado nas duas camadas; estilo consistente com as validações de rota do módulo (schema-level ficaria mais canônico numa próxima passada).
- **E2E deixa dados criados no banco** (eventos/pedidos pelo cleanup de comprador apenas): padrão já aceito do backoffice — o seed da execução seguinte recria o banco.
