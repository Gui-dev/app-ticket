# 04: Seed de eventos + home (destaque + eventos em alta)

**What to build:** O visitante abre a home e vê um evento em destaque (hero com badge, data, local, descrição, preço a partir de, CTA "Garantir Ingressos") e o carrossel "Eventos em Alta" com cards de evento (categoria, data, local, preço, ação) — tudo vindo da API a partir de fixtures seedadas, com o visual do design system.

**Blocked by:** 01 (Base do monorepo + ambiente local), 03 (Design system: tema e cores do TICKETVIBE)

**Status:** ready-for-agent

- [ ] Schema do banco para eventos, categorias e locais, com migrações
- [ ] Fixtures seed versionadas no repo (venues, categorias, eventos de exemplo com preços)
- [ ] Rota REST de listagem de eventos com destaque, validada por Zod do `packages/shared`
- [ ] Home consumindo a API: hero em destaque + carrossel "Eventos em Alta"
- [ ] Testes: integração da rota (Postgres real), unitários do caso de uso, componente da home com MSW
