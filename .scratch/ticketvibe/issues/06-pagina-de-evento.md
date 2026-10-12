# 06: Página de evento

**What to build:** O visitante abre um evento e encontra tudo o que precisa para decidir a compra: descrição, data, local (com cidade), categorias e a faixa de preço por setor, além do caminho para escolher ingressos.

**Blocked by:** 04 (Seed de eventos + home)

**Status:** done

- [x] Endpoint REST de detalhe do evento com setores e preços por setor, schema Zod compartilhado
- [x] Página de evento no web: descrição, data, local, categorias, preços "a partir de" por setor
- [x] CTA que leva à escolha de ingressos (pode apontar para a próxima fase até lá existir)
- [x] Estados de carregamento e de evento inexistente tratados
- [x] Testes: integração da rota, componente com MSW, E2E de navegação home → evento

## Deferrals do ticket 05 (registrados no fechamento do 05)

- **Busca fuzzy `pg_trgm`** — `q=standup` não acha `stand-up` (lexemas diferem); hoje só substring/stemming (`q=stand` acha). Habilita proximidade/typo. UI de **data** (`from`/`to`) e **localização** (`state`) no header — a API já aceita, os mockups não mostram; UI fica para 06/07.
- **Carrossel do hero (dots/controles)** — herdado do 04; segue para 06/07.
- **`Header` no `layout.tsx`** — segue só na home; `not-found.tsx` claro ainda aberto.
- **Provider Zod/OpenAPI do Fastify** — F-transversal.
- **Coverage tooling** — não instalado; política em docs/TESTING.md.
- **Sign-off do contraste `--border: #2e2054`** — herdado do 03, sem decisão de design.
- **Trigger do `search_vector`** — hoje é mantido apenas pelo seed; um trigger de banco (ou escrita no write path) será necessário quando eventos passarem a ser criados/editados (tickets 17+).
- **Entidade artista** — a busca cobre título/descrição/local/cidade; "artista" como campo próprio não existe no modelo (fica para quando os eventos tiverem lineup).

## Deferrals do ticket 06 (registrados no fechamento do 06)

- **Disponibilidade/lotes/assentos por setor** — setor hoje só tem `slug`, `name`, `priceFromCents`; o mapa de assentos e a reserva chegam na F2 (tickets 10/11).
- **Lotes de preço por período** — backoffice de preços fica para a F4 (tickets 17+).
- **Imagem do evento na página** — `imageUrl` continua null no seed; assets de imagem são deferral herdados do 04/05.
- **`Header` no `layout.tsx`** — segue duplicado (home + página de evento); consolidação no layout ainda aberta.
- **Página de ingressos placeholder** — rota `app/events/[slug]/ingressos` é estática e será substituída pelo mapa de assentos na F2.
- **Validação Zod do slug do path param** — deliberadamente ausente (lookup → 404); reconsiderar quando existir regra de formato de slug.
- **Proxy de 404 em produção** — a rota bloqueante devolve 404 real só no dev; em `next start` slug ausente responde 200 + UI streamada (e o body do 404 não é server-rendered). Follow-up: check de existência no `proxy.ts` antes do render; o mesmo ticket habilita o `loading.tsx` (skeleton da página de evento) e exige revisar a asserção `response.status() === 404` do E2E se o Playwright passar a rodar contra build de produção.
