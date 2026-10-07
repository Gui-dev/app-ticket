# 07: Páginas de artista e local

**What to build:** O visitante abre a página de um artista e vê todos os eventos dele; abre a página de um local (casa de show/teatro) e vê todos os eventos daquele espaço — descobrindo datas que a busca sozinha não mostra.

**Blocked by:** 04 (Seed de eventos + home)

**Status:** ready-for-agent

- [ ] Entidade artista no schema, relacionada a eventos, com fixtures seedadas
- [ ] Endpoints REST de detalhe de artista e de local com seus eventos, schema Zod compartilhado
- [ ] Páginas de artista e de local listando eventos no padrão visual dos cards existentes
- [ ] Links da página de evento (artista/local citados) navegando para essas páginas
- [ ] Testes: integração das rotas, componentes com MSW, E2E de navegação evento → artista
