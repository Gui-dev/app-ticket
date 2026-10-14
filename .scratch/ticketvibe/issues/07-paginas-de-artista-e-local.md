# 07: Páginas de artista e local

**What to build:** O visitante abre a página de um artista e vê todos os eventos dele; abre a página de um local (casa de show/teatro) e vê todos os eventos daquele espaço — descobrindo datas que a busca sozinha não mostra.

**Blocked by:** 04 (Seed de eventos + home)

**Status:** done

- [x] Entidade artista no schema, relacionada a eventos, com fixtures seedadas
- [x] Endpoints REST de detalhe de artista e de local com seus eventos, schema Zod compartilhado
- [x] Páginas de artista e de local listando eventos no padrão visual dos cards existentes
- [x] Links da página de evento (artista/local citados) navegando para essas páginas
- [x] Testes: integração das rotas, componentes com MSW, E2E de navegação evento → artista

## Deferrals do ticket 07 (registrados no fechamento do 07)

- **Skeletons exportados sem uso** — `ProfileEventsSkeleton` e `EventDetailSkeleton` existem mas nenhuma rota os referencia (`loading.tsx` da artista/local ainda não os usa).
- **Log do seed omite artistas** — o resumo do `db:seed` conta eventos/locais/categorias, mas não os artistas criados.
- **Árvore stale do Next após navegação client-side (pré-existente, confirmado no 08)** — com `cacheComponents`, o `router.push` mantém a árvore anterior montada com `display: none` (2 `<header>`/`<main>` coexistem no DOM; um oculto). Não é regressão deste ticket — existe sem código de auth. O E2E do ticket 08 usa `getByRole('banner')` como workaround; merece ticket próprio para diagnóstico/fix no framework ou no padrão de navegação.
