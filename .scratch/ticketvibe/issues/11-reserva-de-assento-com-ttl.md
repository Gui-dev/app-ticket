# 11: Reserva de assento com TTL

**What to build:** Assim que o comprador seleciona um assento, ele fica reservado no nome da sessão com contagem regressiva de ~10 minutos; mais ninguém consegue comprar aquele assento durante a reserva; ao expirar (ou o comprador desistir), o assento volta a ficar livre — e dois compradores disputando o mesmo assento ao mesmo tempo nunca ambos vencem.

**Blocked by:** 10 (Mapa de assentos)

**Status:** done

- [x] Reserva em Redis com TTL (~10 min) atrelada à sessão do comprador
- [x] Contagem regressiva visível na UI de assento, com avisos de renovação/desistência
- [x] Job do worker expira reservas e devolve os assentos ao mapa
- [x] Assento reservado aparece como ocupado para os demais compradores (polling da F2)
- [x] Teste de corrida obrigatório: dois compradores, mesmo assento, exatamente um vence (integração, Postgres real + Redis)

## Implementação

Plano: `docs/superpowers/plans/2026-10-16-ticket-11-reserva-de-assentos-ttl.md` (commit `47d38b5`), executado via subagent-driven development (implementador + spec review + code quality review por task).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `8d32892` + `8efa0f9` | Redis client (`createRedis`, guards de teste db 1) |
| 2 | `1da26f3` | Contratos shared (`SEAT_HOLD_TTL_SECONDS=600`, `SEAT_HOLD_RENEW_AFTER_SECONDS=120`, schemas hold/release/seatmap) |
| 3 | `e97948c` + `7a53ea3` | Colunas `hold_user_id`/`hold_expires_at`, migração 0006, sessão anônima (better-auth `anonymous`), migração de holds no link para conta |
| 4 | `8e3faa8` + `3520db1` | Domínio hold, InMemory repos, lookup por coordenadas, `'reserved'` no Drizzle |
| 5 | `8bb9012` + `2e42bb7` | RedisHoldRepository (claim/renew atômicos via Lua), mirror Drizzle, `expireExpiredHolds` |
| 6 | `c49e21e` + `9e31889` | Use cases hold/release/seatmap-user-scoped (+fix: rollback do claim quando o mirror PG rejeita; renew boolean honrado) |
| 7 | `9ed913d` | Rotas `POST /events/:slug/holds` e `/holds/release` (401/400/404/409/201/200), wiring sessão + Redis lazy, mapper `reserved→occupied` |
| 8 | `d92cd90` | Proxies web holds/release + cookie forward no seatmap |
| 9 | `93dc695` + `d90a83b` | Componente SeatMap: hold no clique, countdown, auto-renew ≤120s, desistir, polling 10s, restauração (+fix: release do hold anterior ao reselecionar; floor no countdown; poll falho não apaga o mapa) |
| 10 | `923b101` | E2E: fluxo anônimo real, desistir libera, dois compradores (contextos separados), restauração pós-reload |
| 11 | `5509fff` | Worker BullMQ (`seat-hold-expiry`, scheduler 5s) chamando `expireExpiredHolds` |

### Gates finais (16/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test` | API 170, web 174, shared 58 — todos pass |
| Playwright (E2E) | 24/24 |
| `pnpm build` | web build ok |
| `drizzle-kit check` | limpo |

Corrida (critério 5): `holds.routes.integration.spec.ts` — dois `app.inject` concorrentes, exatamente `[201, 409]`; E2E UI com dois `browser.newContext()` confirma visibilidade (ocupado para o outro comprador, liberado após desistir).

Smoke do worker: hold com `hold_expires_at` backdatado via psql → `[worker] expired 1 hold(s)` em ~10s, linha volta a `available`.

## Deferrals do ticket 11

- Checkout atômico (SELECT FOR UPDATE) fica para o ticket 13.
- Carrinho/TTL espelhado fica para o ticket 12 (depende deste).
- Hold idempotente por coordenada (um usuário, um assento) sem fila de prioridade — hoje o POST é idempotente por claim renew, mas um usuário pode segurar vários assentos simultâneos (UI libera o anterior).
- Renew via endpoint próprio (hoje o mesmo POST de claim faz renew).
- Polling de 10s fixo (sem backoff nem focus-aware).
- Falha do Redis degrada para erro 500/503 no hold (seatmap continua servindo do Postgres).
- Worker single-instance (sem lock distribuído além do scheduler do BullMQ).
