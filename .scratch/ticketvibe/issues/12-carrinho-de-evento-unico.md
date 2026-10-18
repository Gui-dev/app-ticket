# 12: Carrinho de evento único

**What to build:** O comprador monta o pedido do evento com a quantidade e os tipos de ingresso (inteira, meia, VIP) escolhidos, vê o contador de expiração sincronizado com a reserva dos assentos, e o carrinho se comporta como um só evento — ao adicionar de outro evento, o fluxo recomeça em vez de misturar.

**Blocked by:** 11 (Reserva de assento com TTL)

**Status:** done

- [x] Carrinho atrelado a um único evento, com TTL espelhando a reserva de assentos
- [x] Seleção de quantidade e tipo de ingresso (inteira, meia por honra, VIP) com preços corretos
- [x] UI de carrinho com contagem regressiva e resumo dos itens
- [x] Ao expirar, o carrinho some e os assentos são liberados junto com a reserva
- [x] Testes: unitários de totais/tipos, componente com MSW, E2E de adicionar → expirar → ver assento liberado

## Implementação

Plano: `docs/superpowers/plans/2026-10-16-ticket-12-carrinho-de-evento-unico.md` (commit `7f25b2e`), executado via subagent-driven development (implementador + spec review + code quality review por task).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `8a1ec45` | Contratos shared: `TicketType`/`ticketTypeSchema`, `ticketPriceCents` (×1/×0,5/×2), schemas de cart e `CART_MAX_ITEMS=8` |
| 2 | `cd2f849` | Domínio `CartRepository`/`cartItemKey` + `InMemoryCartRepository`; `HoldRepository.owns` (in-memory + Redis) |
| 3 | `7acc906` + `c41878b` | `SeatHoldRecord.priceFromCents` (Drizzle select/map + in-memory) + assert do preço do setor |
| 4 | `0768bb8` + `7e0503d` | `RedisCartRepository` (hash com TTL); escrita atômica via `multi()` e semântica de TTL fixada em testes |
| 5 | `f61dae1` + `0621364` | `GetCartUseCase` (holds × tipos × preços, `expireHolds`); ordenação determinística |
| 6 | `670ee02` + `3ab9834` | `SetCartItemUseCase` + `cart_limit` (409) no `HoldSeatUseCase`; `refreshTtl` no renew |
| 7 | `7d54915` + `4299e9e` | Rotas `GET /events/:slug/cart` e `PUT /events/:slug/cart/items` + wiring `app.ts`; integração hermética (Redis real) |
| 8 | `d16ffae` + `6eec1ca` | Proxies web `GET /cart` e `PUT /cart/items` (+ cobertura de 401/502) |
| 9 | `5ec7570` + `0b1c143` | `CartPanel` (itens, total, countdown, tipo por item, desistir) + a11y (labels por setor, live region só no aviso) |
| 10 | `3df0131` + `fd344d8` | `SeatMap` multi-seleção + integração do `CartPanel`; hardening de lifecycle (give-up pendente, fetchTypes retry, erros stale, cancelamento de hold, reset por `key={slug}`) |
| 11 | `8820cdb` + `fb2f6b8` | E2E `cart.spec` (4) + textos de carrinho no `seatmap.spec` (6); dedupe de sessão anônima concorrente |

### Gates finais (17/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test` | API 216, web 201, shared 68 — todos pass |
| Playwright (E2E) | 28/28 (seatmap 6 + cart 4 + demais) |
| `pnpm build` | web build ok |
| `drizzle-kit check` | limpo |

Contagem de carrinho (critério 2): preços por tipo cobertos em `shared` (`ticketPriceCents`) + `get-cart`/`set-cart-item` specs + E2E `cart.spec` (meia R$ 60,00, VIP R$ 240,00). Expiração (critério 4): `cart.spec` backdata o hold via psql → recarga limpa o carrinho e libera o assento (`expireHolds` lazy no `GET /seatmap`).

Bug encontrado pelo E2E e corrigido no fechamento (`fb2f6b8`): cliques rápidos em dois assentos disparavam dois `signIn.anonymous()` concorrentes, criando sessões anônimas distintas e holds órfãos. Correção: `ensureAnonymousSession()` single-flight em `apps/web/src/lib/auth-client.ts` (teste de regressão em `seat-map.spec.tsx`).

## Deferrals do ticket 12

- Carrinho cross-event (agregado multi-evento): a UI/contrato são sempre por evento (D4); agregação fica para a story de checkout (ticket 13).
- Multiplicadores de tipo (inteira/meia/VIP = ×1/×0,5/×2) são hardcoded (D2); lotes/preço por organizador reabrem nos tickets 18/39.
- Release automático de holds de outros eventos ao adicionar item novo: deliberadamente não implementado (D4) — TTL de 10 min limita o squatting e "desistir" é explícito.
- Carrinho por hash Redis com TTL e default `'inteira'` para campo ausente (D1); tipo alterado em outra aba só sincroniza no mount (`fetchTypes` roda uma vez).
- `cart_limit` é um soft cap (checagem check-then-act no `HoldSeatUseCase`); o hard cap atômico concorrente fica adiado (não há corrida explorável no fluxo atual de um único comprador).
