# 10: Mapa de assentos (setor → fila → cadeira)

**What to build:** Na página do evento, o comprador vê a estrutura real do local — setores com preço e disponibilidade, filas e cadeiras dentro do setor escolhido — e seleciona seu assento, ou usa "melhor lugar disponível" para deixar o sistema escolher por ele.

**Blocked by:** 06 (Página de evento)

**Status:** done

- [x] Schema de locais com setores, filas e cadeiras, com fixtures seedadas coerentes com os eventos
- [x] Endpoint REST de disponibilidade e preço por assento (estado por cadeira), schema Zod compartilhado
- [x] UI de seleção em hierarquia setor → fila → cadeira, com estados por assento (livre/ocupado/indisponível)
- [x] "Melhor lugar disponível": escolhe o melhor assento livre do setor preferido em um clique
- [x] Testes: integração da rota de disponibilidade, unitários da regra de melhor lugar, componente com MSW, E2E de escolher assento

**Implementação:** `39ae900` (plano), `d14f9c4` (schema + migração 0005 + fixtures 69/800), `106173a` (contratos shared), `3a5573a` (domínio seatmap + repo in-memory), `6143c46` (regra do melhor lugar), `8ac4768` (repos Drizzle + rotas + DI), `fe7b06e` (seatsAvailable por setor), `db48ac9` (cards do detalhe), `307fe04` + `afa0e26` (proxies Next + guard de body 404 não-JSON), `1cd3f8d` (componente SeatMap), `c077554` (E2E), `cb3b317` + `e3b3c31` (polish: ordenação row+position, teste fully-booked, `encodeURIComponent`, parse via schema, 500→502). Plano: `docs/superpowers/plans/2026-10-15-ticket-10-mapa-de-assentos.md`. Gates finais: lint 0, typecheck 5/5, test 43/125/150/52, playwright 21, build ok, drizzle limpo. Review final: **Ready to merge — Yes** (0 crítico, 2 importantes não-bloqueantes).

## Deferrals do ticket 10 (registrados no fechamento)

1. **UX dos 404 do best-seat no componente** (review final, importante) — `SeatMap` mapeia *todos* os 404 de `/best-seat` para "Não há assentos livres neste setor", mascarando `event_not_found`/`sector_not_found`; o body já distingue os três (prescrição do plano, linha ~2513). Mesmo arquivo: 404 do `/seatmap` pós-render cai no estado vazio em vez de erro, e o branch 404 não tem teste de componente. Follow-up: mapear `no_available_seat` vs resto + teste do 404.
2. **Invariante de ordenação na interface** (review final, importante) — `pickBestSeat` usa índice como posição física; só `DrizzleSeatmapRepository` garante `orderBy(rowId, position)`. Documentar em `SeatmapRepository.findSeatmap` para o repo Redis do ticket 11 não redescobrir em silêncio.
3. **`unique(row_id, position)`** — unicidade de posição é só convenção de seed; migração 0006 quando o ticket 11 tocar no schema.
4. **`bestSeatQuerySchema` sem `.max(120)`** — assimetria com `suggestQuerySchema`, que limita o tamanho do sector.
5. **Genéricos Fastify nos params das rotas seatmap** — `request.params as { slug }` onde `events.routes.ts` usa `app.get<{ Params: … }>` (prescrito pelo plano).
6. **Guards de seed/teste** — `String.fromCharCode(65 + index)` estoura para `rows > 26` sem bound check; helper `seatStatus` do spec dereferencia sem guard (erro opaco se cadeira faltar).
7. **`bestError` stale** — clicar numa cadeira manual não limpa o alerta do "melhor lugar" (relacionado à deferral de plano: melhor-lugar obsoleto ao trocar de setor).
8. **Ordem de deploy** — `sectorSchema.seatsAvailable` é chave required: web novo antes do api novo quebra o parse do detalhe (irrelevante em deploy lockstep do monorepo; anotar em release notes quando houver deploy separado).
9. **Cobertura residual** — componente sem teste de loading/404; E2E com `getByText` amplo (copy britável); teste in-memory com seed vazio; asserção de `issues[0]` no 400 deixa `issues` genérico; `seatsAvailable` singular (1) sem asserção de texto.

Fora de escopo do plano (não regressões): reserva/hold Redis (11), status em tempo real (16), seleção como fluxo de compra (11/12), paginação de setores, Storybook, envs novas.
