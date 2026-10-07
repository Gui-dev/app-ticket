# 05: Busca e filtros de eventos

**What to build:** O visitante busca por artista, nome do evento, local ou cidade e filtra os resultados por categoria, data e localização, vendo a lista de eventos que atendem aos critérios — sem recarregar a página para combinar busca e filtros.

**Blocked by:** 04 (Seed de eventos + home)

**Status:** ready-for-agent

- [ ] Full-text search no Postgres (tsvector/pg_trgm) cobrindo artista, evento, local e cidade
- [ ] Endpoint REST de busca com parâmetros de filtro (categoria, data, localização), schema Zod compartilhado
- [ ] UI de busca no cabeçalho e chips de categoria com estado selecionado (visual dos mockups)
- [ ] Combinação busca + filtros aplicada sobre os mesmos resultados
- [ ] Testes: integração das consultas de busca, unitários dos filtros, componente com MSW, E2E de busca+filtro
