# 05: Busca e filtros de eventos

**What to build:** O visitante busca por artista, nome do evento, local ou cidade e filtra os resultados por categoria, data e localização, vendo a lista de eventos que atendem aos critérios — sem recarregar a página para combinar busca e filtros.

**Blocked by:** 04 (Seed de eventos + home)

**Status:** ready-for-agent

- [ ] Full-text search no Postgres (tsvector/pg_trgm) cobrindo artista, evento, local e cidade
- [ ] Endpoint REST de busca com parâmetros de filtro (categoria, data, localização), schema Zod compartilhado
- [ ] UI de busca no cabeçalho e chips de categoria com estado selecionado (visual dos mockups)
- [ ] Combinação busca + filtros aplicada sobre os mesmos resultados
- [ ] Testes: integração das consultas de busca, unitários dos filtros, componente com MSW, E2E de busca+filtro

## Deferrals do ticket 04 (registrados no fechamento do 04)

- **Chips de categoria da home** (mockup home.png) — UI nova sobre o mesmo seed; entra com a busca/filtros do 05.
- **Carrossel do hero (dots/controles)** — API já retorna lista de featured (`array`); controles ficam para polish posterior (06 ou 07).
- **Assets de imagem** — `imageUrl` é `nullable` no contrato e `null` em todas as fixtures; hero/cards usam o gradiente. Trabalho de imagem = 06/07.
- **`Header` no `layout.tsx`** — segue só na home (o `/_not-found` claro continua aberto; `not-found.tsx` com tokens = 04+).
- **Provider Zod/OpenAPI do Fastify** — F-transversal, fora do escopo de rota do 04.
- **Coverage tooling** — decisão registrada no 04: não instalar; política vive em docs/TESTING.md.
- **Sign-off do contraste `--border: #2e2054`** — pendência herdada do 03, ainda sem decisão de design.
- **Tokenizar o gradiente `.bg-event-gradient`** (globals.css) — os hexes hardcoded (`#2e2054`=`--border`, `#1c1335`=`--card`, `#0a2a1e` sem token) repetem o padrão que o deferral do 03 pediu para eliminar; virar tokens `--gradient-event-*` com `var()` no primeiro toque do 05.
- **fetch failure vs. lista vazia são indistinguíveis** — `fetchEvents` colapsa todo erro em `[]` (log no console); com a API fora do ar a home renderiza empty state silenciosamente. Registrar a decisão consciente (ex.: resultado discriminado ou estado visual distinto) quando a busca/filtros do 05 tocarem o client.
