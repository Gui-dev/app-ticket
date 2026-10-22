# 16: WebSocket de disponibilidade de assentos

**What to build:** Enquanto o comprador está escolhendo assento, ele vê lugares sendo ocupados e liberados em tempo real (sem recarregar), porque a API notifica todos os que assistem ao mesmo evento — substituindo o polling da F2.

**Blocked by:** 11 (Reserva de assento com TTL)

**Status:** done

- [x] Endpoint WebSocket na API com rooms por evento
- [x] Eventos publicados a cada mudança de disponibilidade (reserva, expiração, compra)
- [x] Mapa de assentos assina o WebSocket e atualiza os estados sem polling
- [x] Reconexão e fallback: se o WS cair, o comportamento degrada para o polling existente
- [x] Testes: unitários do fan-out por room, integração do handshake/evento, E2E de dois navegadores vendo a mesma ocupação

## Implementação

Plano: `docs/superpowers/plans/2026-10-22-ticket-16-ws-disponibilidade.md`, executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com rodada de fix).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `c6e9bd7` | Contrato compartilhado das mensagens WS: `seatStatusChangeSchema` (visão pública, hold de outrem → `occupied`) e `seatAvailabilityMessageSchema` como união discriminada `{ connected }` / `{ seat_status_changed, changes }`, em `packages/shared` |
| 2 | `444ac67` | Port `SeatAvailabilityBroker` (disparo-e-esqueque) + fake in-memory + broker Redis (`SEAT_AVAILABILITY_CHANNEL`, deltas agrupados por `eventSlug`, `publish([])` inerte) e `SeatAvailabilityFanout` de rooms por evento, com desregistro por socket e spec de integração Redis pub/sub |
| 3 | `6853e21` + `49d8bc8` | Publicação dos deltas nas mudanças de status: `reserveSeat` → `occupied`, `releaseSeat`/sweep de expiração → `available`, `renewSeatHold` nunca publica; capture gateway publica `occupied` por item pago após a transação e `available` em `releaseOrderSeats`; `expireExpiredHolds` reescrito para select com `skipLocked` + update por ids, com identidades completas dos assentos; sites de construção ganham o broker (servidor e worker partilham por Redis pub/sub). O fix `49d8bc8` (revisão) reescreve o sweep para rodar dentro de transação com predicados de atualização por tempo de hold |
| 4 | `ab0e1ba` | Rota `GET /events/:slug/seat-availability` (upgrade WS via `@fastify/websocket@^11`, sem autenticação): seatmap resolvido → `connected` imediato e registro na room; evento inexistente → `close(4004)`; assinante Redis em conexão dedicada fechada no `onClose` do app |
| 5 | `e845649` | Web: hook de assinatura do WS (com reconexão e degradação para o polling existente, recarregando o mapa ao `connected` de volta), aplicação dos deltas no mapa sem recarregar a página |
| 6 | `373d078` | E2E `seat-availability.spec.ts`: dois contextos de navegador isolados; um reserva e libera "Cadeira 1, fila A", o outro vê `toBeDisabled`/`toBeEnabled` ao vivo sem recarregar (`window.noReload` permanece `true`) |
| 7 | (docs) | Gates finais e fechamento da issue |

Correções de revisão:

| Commit | Escopo |
|---|---|
| `49d8bc8` | O sweep de expiração era um `update` direto: um assento novo podia ser reservado entre o UPDATE inicial e a coleta das linhas mexidas, e o delta publicado ficava impreciso; o sweep passou a rodar numa transação com predicados de atualização limitados ao tempo do hold, devolvendo exatamente os assentos que ele próprio liberou |
| `b75c3a6` | O helper `readNoReload` do E2E digitava a página como `Awaited<ReturnType<typeof newPage>>` referenciando um `newPage` sem import, abortando o typecheck do web; o helper passou a receber `Page` (`import type { Page } from '@playwright/test'`) |

## Gates finais (22/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `apps/api/src/db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test --force` | API 424 (66 arquivos), web 292 (47 arquivos), shared 84 (1 arquivo) — todos pass, execução fresca, 0 cached |
| Playwright (E2E) | 33/33 (seat-availability 1 + checkout 2 + checkout-email 1 + demais 29) |
| `pnpm build` | ok (web build, 4 packages em escopo) |

Cobertura dos critérios: rota WebSocket com rooms por evento (`/events/:slug/seat-availability`, `connected` ao abrir, fan-out por evento com desregistro no close e `4004` para slug inexistente); deltas publicados a cada mudança (reserva → `occupied`, liberação/expiração → `available`, captura → `occupied` por item pago, rotas de falha sem publicação) com broker Redis que agrupa por evento e chega ao servidor e ao worker num processo cada; o mapa assina o WS e aplica os deltas ao vivo, sem polling enquanto o socket está saudável; queda do WS degrada para o polling existente e o socket se reconecta (fetch disparado ao `connected`, refrescando o mapa com o estado atual); testes unitários do fan-out por room, integração da rota com clientes WS reais e do pub/sub Redis, e o E2E de dois navegadores vendo a mesma ocupação.

Nenhuma falha apareceu nos gates finais no head `b75c3a6`: o único ajuste foi o fix `b75c3a6` do tipo do helper do E2E, já revalidado por cima (typecheck do web limpo e o E2E-alvo 1/1 antes da varredura completa).

## Deferrals do ticket 16

- **Autenticação na rota WS:** a disponibilidade é pública por design — igual à rota REST do seatmap, ela não informa dados sensíveis; a rota não autentica.
- **Corrida sweep vs nova reserva:** um delta `'available'` pode chegar depois de um `'occupied'` criado na janela entre o select e o update do sweep; o próximo delta/poll e o fetch disparado ao `connected` curam o estado — não há ordenação offline acessível sem replumar o protocolo.
- **E2E de queda do servidor WS (restart da API):** fica no teste de componente do fallback (Task 5); reiniciar a API no meio do E2E seria flaky demais para o ganho.
- O timer do sub-ack do WebSocket (Promise.race de 5s) não faz `.unref()`: fica vivo por até 5s, sem efeito no encerramento do processo.
- Um erro no handle do socket fecha o WS com código 1011 sem log (`logger: false` é o padrão do repo): a falha fica invisível nos logs da API.
- `onerror` do socket fica sem handler no cliente: os navegadores sempre emitem `close` após `error`, que é o caminho tratado.
- `buildApp` instancia o broker Redis mesmo com fakes injetadas (conexão extra, benigna).
- Mapeadores de delta `'available'` duplicados em três lugares (tamanho ok, sem divergência de protocolo).
- Schemas WS colocadas no fim de `packages/shared/src/index.ts` (EOF) em vez de coladas ao bloco de schemas de seat (linhas 104-133) — brief ambíguo ("ao final" vs "junto"); sem impacto funcional.
- Cobertura do spec do shared não testa `min(1)` individuais (`sectorSlug`/`rowLabel`/`seatLabel`) nem `status` inválido — a lista de testes veio verbatim do plano.
- Hook web: `reconnectTimer` reassinado sem clear prévio do timer antigo — latente e inalcançável com um WebSocket conforme (close emite uma vez), mas paridade só implícita.
