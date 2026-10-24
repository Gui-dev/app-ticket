# 18: CRUD de eventos, locais, setores e lotes de preço no backoffice

**What to build:** O organizador cadastra e edita pelo backoffice seus eventos, locais, setores (com filas e cadeiras) e lotes de preço — e esses dados alimentam diretamente a descoberta pública e o mapa de assentos do comprador.

**Blocked by:** 17 (Papel organizador), 10 (Mapa de assentos)

**Status:** done

- [x] CRUD de eventos restrito ao organizador dono (e aos dados da plataforma conforme seed)
- [x] CRUD de locais com setores, filas e cadeiras
- [x] CRUD de lotes de preço por setor e período, com vigência
- [x] Dados criados no backoffice aparecem na busca/página do evento e no mapa de assentos
- [x] Testes: integração de autorização e regras de lote, componentes com MSW, E2E de criar evento → ver na home

## Implementação

Plano: `docs/superpowers/plans/2026-10-23-ticket-18-crud-backoffice.md`, executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com revisão final do branch inteiro).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `c0b651c` | Migração `0013_tiresome_cloak.sql` (drizzle-kit): `events.organizer_id` (text nullable, FK → `user`; null = evento da plataforma) e tabela `price_lots` (uuid, sector FK cascade, name, price_cents, vigência timestamptz, índice `(sector_id, starts_at)`); schemas Zod compartilhados do backoffice (`organizerEvent*`, `organizerVenue*`, `organizerSector*`, `organizerRow*`, `organizerLot*`) e tipos `Organizer*Dto/Create`, com spec EN (exceção da casa) |
| 2 | `c225c85` | CRUD de eventos no backoffice: port `OrganizerRepository` + `slugify` + repos in-memory/drizzle + 5 use-cases + 5 rotas guard-first; listagem inclui próprios + plataforma; escrita de plataforma/alheio → 403; slug único com sufixo, imutável; delete com pedidos → 409 `event_has_orders` (sem pedidos remove setores/filas/cadeiras/lotes) |
| 3 | `42afac8` (+`96a33fb`) | Locais (catálogo compartilhado, sem ownership) e setores/filas/cadeiras: criação transacional de setor + filas + `'1'..'N'` cadeiras, `seatsTotal`; deletes FK-safe com 409 `row_has_orders`/`sector_has_orders`; detalhe do evento monta setores; `recalculateEventPriceFrom` após escrita de setor. Fix de revisão: asserção de preço preservado quando o evento perde o último setor |
| 4 | `3656858` | Lotes com vigência: CRUD por setor, `invalid_period` 400 (use-case) vs `lot_overlaps` 409 (SQL `overlaps` em transação); preço efetivo do comprador = `coalesce(lote ativo agora, sectors.price_from_cents)` nas 4 consultas buyer-side (seatmap, seat by coords, holds/carrinho, detalhe do evento) com identificadores qualificados + orderBy coerente; recalc lot-aware |
| 5 | `1a922a6` | Web: proxy `/api/organizer/[...all]` (status/body do upstream preservados, 502 `upstream_error`) + `lib/organizer-api.ts` tipado nos schemas compartilhados com mapa pt-BR dos 19 códigos de erro; páginas `/organizador/eventos` (cards + chip "Da plataforma") e `/organizador/eventos/novo` (categorias/locais); link "Meus eventos" |
| 6 | `9ed3800` (+`040b673`) | Editor `/organizador/eventos/[id]`: dados do evento (PATCH com corpo completo) + setores/filas/lotes (criar/deletar; lotes criar/deletar com vigência), mutations void + re-fetch do detalhe; erros 409 em pt-BR na tela; link "Locais" fora do escopo. Fix de revisão: prefill de datetime UTC→local (`America/Sao_Paulo`) com round-trip sem perda |
| 7 | `8f66cd4` | Página `/organizador/locais`: listar/criar/editar inline (slug preservado), empty state, link "Locais" no painel |
| 8 | `1999460` (+`6fdd072`) | E2E `backoffice.spec.ts`: organizador cria local → evento → setor com fila; evento aparece na home (categoria) e na página pública em contexto anônimo (título, setor, lugares e preço). Fix de revisão: nomes fixados do roteiro restaurados (seed limpa eventos/locais a cada execução) |
| 9 | (docs) | Gates finais, revisão final do branch e fechamento da issue |

Correções da revisão final do branch:

| Commit | Escopo |
|---|---|
| `869cf4f` | `search_vector` derivado no create/update de evento (mesmos pesos do seed: título A, descrição B, local/cidade C) — eventos do backoffice passam a aparecer na busca/sugestões; conflito de nome de setor ganha discriminante próprio |
| `6a758e5` | Web: card de evento próprio vira link para o editor (plataforma continua texto, leitura); `sector_conflict` → "Já existe um setor com esse nome neste evento." |
| `3ca42de` | E2E reabre o evento pela lista e reafirma o editor |
| `7cec2b2` | `CreateRowResult` estreitado (typecheck: union do setor vazava para criação de fila) |

## Gates finais (23/10/2026, HEAD `7cec2b2`)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `apps/api/src/db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test --force` | API 534 (85 arquivos), web 340 (56 arquivos), shared 118 (1 arquivo) — todos pass, execução fresca, 0 cached |
| Playwright (E2E) | 35/35 (inclui `backoffice.spec.ts` com o fluxo local → evento → setor → home → página pública → reabrir no editor) |
| `pnpm build` | ok (`◐ /organizador/eventos/novo` emite warning de prerender sem API no build; a rota re-renderiza por request em runtime) |

Cobertura dos critérios: eventos têm dono (`organizer_id`); o dono lê e escreve, dados da plataforma são leitura para todos e escrita 403, evento alheio é 403 em todas as rotas (guard de papel primeiro: 401/403); locais/setores/filas/cadeiras/lotes têm CRUD completo na API e no backoffice (setor gera cadeiras `1..N`, `seatsTotal`; deletes com pedidos → 409); lotes têm vigência com `invalid_period` 400 vs `lot_overlaps` 409 e alimentam o preço efetivo do comprador nas 4 consultas do fluxo de compra; os dados criados aparecem na home, na busca/sugestões (search vector), na página do evento e no mapa de assentos; testes cobrem integração de autorização e regras de lote, componentes MSW (proxy, listagem, novo, editor, locais) e o E2E da jornada.

## Deferrals do ticket 18

- **Status `published/draft`:** o backoffice publica imediatamente (sem fila de revisão); `featured`/`isHot`/`badgeLabel`/`imageUrl` continuam sendo região do seed administrativo.
- **Slug imutável:** slug de evento/local/setor é fixado na criação (URL estável para o comprador); renomear slug não é suportado.
- **Owner de local:** catálogo de locais é compartilhado entre organizadores (qualquer organizador lê/cria/edita qualquer local); permissionamento por local é decisão futura.
- **Edição de lote na UI:** a API expõe `PATCH /organizer/lots/:id` (testada); a UI do editor cobre criar/deletar lotes.
- **Preço efetivo não revalida pedidos:** preço é capturado no hold/set-cart como hoje; lotes que começam/expiram não alteram pedidos já criados.
- **`events.price_from_cents` é snapshot de escrita:** recalculado após cada escrita de setor/lote; entre a expiração de um lote e a próxima escrita, o "a partir de" de cards/detalhe pode ficar defasado (o carrinho usa o preço efetivo ao vivo). Evento recém-criado sem setor mostra `R$ 0,00` até o primeiro setor. Mínimo ao vivo nas queries de listagem/detalhe fica para um ticket de preço/descoberta.
- **Sem delete de evento/setor na UI:** as rotas `DELETE` existem e são testadas; o editor cobre deletar fila e lote. Remover evento/setor pela UI (com confirmação) fica para a passada de gestão do backoffice.
- **Rename de local não reindexa eventos:** `events.search_vector` é derivado no create/update do evento (com o nome/cidade do local); renomear o local não atualiza vetores de eventos existentes (gap pré-existente ao fechamento; incluir no mesmo ticket de busca acima).
- **Expressão do search vector duplicada:** seed e repositório do organizador repetem os pesos A/B/C — um writer novo precisa manter os dois em sincronia (extrair helper compartilhado quando aparecer o terceiro).
- **Semântica de datetime dividida:** o editor fixa `America/Sao_Paulo` (helpers em `lib/format.ts`); criação de evento e de lote ainda interpretam `datetime-local` como browser-local. Idêntico para organizador no Brasil; migrar os três aos helpers.
- **Proxy do organizer não re-apenda `set-cookie` do upstream:** inofensivo hoje (rotas do organizador não setam cookie); alinhar ao proxy de auth se surgir necessidade.
- **Corridas aceitas:** overlap de lote e unicidade de slug/posição são check-then-insert (sem `FOR UPDATE`/constraint extra); janela de corrida já presente no padrão da casa.
- **`sector_has_orders` mapeado no web sem gatilho de UI:** o editor não deleta setor; a mensagem fica pronta para o consumidor futuro.
- **E2E sem cleanup:** os dados criados ficam no banco até o seed da execução seguinte; asserção de preço usa `.first()` (header "A partir de" vs linha do setor).
- **Info de lint pré-existente:** `apps/api/src/db/test-helpers.ts:17` (`useTemplate`), fora do escopo deste ticket.
