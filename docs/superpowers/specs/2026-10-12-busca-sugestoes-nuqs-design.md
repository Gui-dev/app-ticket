# Design: Busca com Nuqs + modal de sugestões (evento e local)

**Data:** 2026-10-12
**Status:** aprovado pelo usuário no brainstorming
**Próximo passo:** writing-plans → implementação

## Contexto

O ticket 05 (busca e filtros, concluído) já fez da **URL a fonte da verdade**: `useSearchParams` + `router.replace` manual em dois componentes client (`header-search.tsx`, `category-chips.tsx`) com camada de tradução em `lib/search-params.ts` (parse/serialize + validação Zod compartilhada). Resultados são server-rendered em `page.tsx`, que lê `searchParams` e chama `fetchEvents` (`server-only`); com filtro ativo renderiza `SearchResults`, senão a home default (hero + destaque + em alta).

Este design cobre as três melhorias acordadas com o usuário:

1. **Substituir a camada manual por Nuqs** (parsers tipados declarativos no lugar de `buildSearchPath`/`router.replace`).
2. **Feedback instantâneo nos filtros** — skeleton imediato na região de resultados durante a navegação (sem reload de documento).
3. **Modal de sugestões abaixo do input** enquanto o usuário digita (eventos + locais).

A URL já é compartilhável hoje; a mudança é formalizar/declarativizar o mecanismo, não introduzir URL state do zero.

## Escopo

### Dentro

- `nuqs` v2 em `apps/web`; `NuqsAdapter` no `layout.tsx`; `useQueryStates` em `header-search.tsx` e `category-chips.tsx`.
- `SearchTransitionProvider` (transição React) + wrapper `ResultsRegion` (skeleton quando `isPending`).
- `GET /events/suggest` na Fastify: top-5 eventos (FTS por relevância) + top-5 locais (venues com evento).
- Route handler Next `GET /api/suggest` (proxy same-origin, sem CORS).
- Combobox acessível no input de busca existente (debounce 250 ms, mínimo 2 caracteres).
- Contrato `suggestResponseSchema` no pacote `shared` (contrato primeiro).

### Fora (YAGNI / deferidos)

- **Entidade artista** — não existe no banco (verificado: schema/GLOSSARY sem menções); é território do issue 07. "Artista" cai implicitamente na busca por título (ex.: "Neon Lights" acha o show).
- **UI de filtros de data/local** — os params `state`/`from`/`to` permanecem URL-only (quem digita/compartilha já funciona; schema e API suportam).
- **`push` no histórico de filtros** — mantém `replace` (decisão explícita do usuário: back não desfaz busca/filtro).
- **Debounce/instantaneidade na página de resultados** — texto continua buscando só no Enter; instantâneo vale para os chips de categoria.
- **`view` (featured/hot) na URL** — composição server-side da home, mantida.
- **Parâmetro `city` dedicado na API** — só se o teste de FTS com "São Paulo" reprovar (ver Riscos).

## Rastro de decisões (brainstorming)

| Pergunta | Decisão |
|---|---|
| Escopo do "melhorar" | Nuqs + filtros data/local + resultados instantâneos; depois: filtros data/local reduzidos a URL-only |
| Quando resultados atualizam | Instantâneo só nos filtros (chips); texto no Enter |
| Inputs novos | Proibidos — apenas o input de busca existente |
| UI de data/local | Nenhuma (URL only) |
| Escopo do artista no modal | Só evento + local; entidade artista fica para o issue 07 |
| Seleção de sugestão | Evento → página direta (push); local → `/?q={city}` (replace); Enter sem seleção → `/?q=` |
| Transporte das sugestões | Route handler Next (opção A): GET same-origin, sem CORS |
| Arquitetura de instantaneidade | Abordagem A: servidor + pending states (fetch continua `server-only`, um único caminho de dados) |

## Arquitetura

### 1. URL state com Nuqs

- **Dependência:** `nuqs` v2 apenas em `apps/web` (peer: Next 16.4 ✓, React 19.3 ✓).
- **Adapter:** `NuqsAdapter` de `nuqs/adapters/next/app` envolve a árvore em `src/app/layout.tsx` — precisa ser no layout porque o `Header` (com a busca) é renderizado no `page.tsx`, não no layout, e ambos compartilham a mesma instância.
- **Parsers tipados** em `lib/search-params.ts` (já é a camada de tradução URL⇄filtros — lugar natural):

  | param | parser | regra |
  |---|---|---|
  | `q` | string | trim, 1–120 |
  | `category` | string | 1–60 |
  | `state` | string | 2 letras → uppercase |
  | `from` | ISO date | `z.iso.date()` |
  | `to` | ISO date | `z.iso.date()` |

- **Servidor continua fonte da verdade:** `page.tsx` segue com `parseSearchFilters(await searchParams)` (Zod compartilhado). Valores inválidos caem silenciosamente (comportamento atual preservado). Nuqs só lê/serializa no client.
- **`buildSearchPath`/`router.replace` manuais somem** dos dois componentes client, substituídos por `useQueryStates`.
- **Contrato de URL inalterado:** `/?q=&category=&state=&from=&to=` com ordem estável; vazio → `/`. **Os 5 E2Es do ticket 05 continuam válidos sem reescrita.**
- História: `replace` (Nuqs default) — sem entrada no histórico para busca/filtros.

### 2. Feedback de pending (instantâneo nos filtros)

- **`SearchTransitionProvider`** (client, no `layout.tsx` junto do adapter): expõe `useTransition` do React + helper `runSearch(update)` que executa o setter Nuqs **dentro** da transição.
- `header-search.tsx` (submit) e `category-chips.tsx` (toggle) chamam `runSearch(...)` em vez de `router.replace`.
- **`ResultsRegion`** (wrapper client da região de resultados no `page.tsx`): lê `isPending` do contexto; `true` → renderiza `PageSkeleton` (reutiliza o skeleton existente); `false` → renderiza os children server-rendered.
- **Resultado:** clique no chip → URL muda na hora → skeleton imediato → RSC chega → resultados. Sem reload de documento; feedback visual honesto, igual ao first-load sob `Suspense`.
- Cliques rápidos em sequência: transições enfileiram, vence a última URL.
- Erro de fetch continua no servidor → `SearchResults` error alert (como hoje); transição não engole erro.
- Header: draft de digitação permanece `useState` local — só o valor submetido vai para a URL.

### 3. Backend: `GET /events/suggest`

Novo endpoint Fastify, validado com Zod (`q`: min 2, max 120 — o modal só dispara a partir de 2 caracteres):

```json
{
  "events": [
    { "slug": "...", "title": "...", "startsAt": "...", "venueName": "...",
      "venueCity": "...", "venueState": "...", "priceFromCents": 12000 }
  ],
  "locations": [ { "city": "São Paulo", "state": "SP" } ]
}
```

- **Events:** reusa a FTS do `searchVector` (migração 0001: `title` peso A, `description` B, `venue name+city` C) com `websearch_to_tsquery('portuguese', unaccent(q))`; **limit 5**; ordenação por relevância (`ts_rank`) com `startsAt` asc como desempate — autocomplete precisa de relevância, não da ordenação por data da home.
- **Locations:** `SELECT DISTINCT city, state FROM venues INNER JOIN events` (venues **com pelo menos um evento** — clique nunca leva a página vazia); match por `unaccent(city)`/`unaccent(state)` com `ILIKE '%q%'`; limit 5. Sem FTS nova em venues (YAGNI — 5 venues no seed).
- **Clique numa location → `/?q={city}`** — a FTS do 05 já cobre `venue city` (peso C), zero mudança de API. Ver risco de tokenização em Riscos.

### 4. Proxy Next: `GET /api/suggest`

- `apps/web/src/app/api/suggest/route.ts` (route handler GET): valida `q` com o schema compartilhado → chama Fastify `GET /events/suggest?q=` → `cache: 'no-store'` → repassa o JSON.
- Erro upstream → `502`. O modal degrada fechando o painel silenciosamente; Enter (submit) segue funcionando — a página de resultados nunca depende do modal.
- Motivo da opção A (escolhida): sem CORS, API não é exposta ao browser, GET é a semântica certa (cacheável, testável com curl), e o endpoint novo na Fastify seria necessário em qualquer alternativa.

### 5. Modal de sugestões (combobox)

Componentes: `header-search.tsx` (input + draft + submit Nuqs + orquestração) e **`search-suggestions.tsx`** (painel — arquivo próprio, uma responsabilidade).

**Comportamento:**

- Debounce **250 ms** após **mínimo 2 caracteres** → `GET /api/suggest?q=` → painel abre abaixo do input (absoluto, mesma largura, `shadow-card`, cantos `rounded-xl` — tokens existentes).
- Abaixo de 2 chars ou `Esc`/clique fora → painel fecha, sem chamada.
- **Estados:** loading (2–3 linhas skeleton `animate-pulse`), resultados agrupados (**Eventos** — título + data + local; **Locais** — "Cidade, UF"), vazio ("Nenhum resultado"), erro (fecha o painel silenciosamente).

**Interação:**

| Ação | Resultado |
|---|---|
| ↑ / ↓ | move destaque entre itens (cruzando grupos) |
| Enter com destaque | evento → `router.push('/events/{slug}')` (push: navegação de página); local → navega para `/?q={city}` (replace, igual o submit de hoje) |
| Enter sem destaque | submit normal → `/?q=` (comportamento atual preservado) |
| Esc / clique fora | fecha o painel (input mantém o texto) |
| Mouse click no item | igual ao Enter com destaque |
| Digitando | **não altera a URL** — só submeter/selecionar muda a URL (URL limpa e shareable sempre) |

**Acessibilidade (padrão ARIA combobox):**

- Input: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` (item ativo).
- Painel: `role="listbox"`; itens: `role="option"` + `aria-selected`; grupos: `role="group"` + `aria-labelledby` (verificado contra a regra do biome `a11y/useSemanticElements` no momento da implementação).
- Contagem de resultados anunciada discretamente (`aria-live`) se viável; verificação no plano.
- Sem `biome-ignore`.

**Estado local apenas:** texto (draft), timer de debounce, `open`, destaque, dados — nada disso vira URL.

## Contrato de dados

`suggestResponseSchema` (+ `suggestEventItem`, `suggestLocationItem`) em `packages/shared/src/index.ts`, com specs no `index.spec.ts` — contrato primeiro, como no ticket 06:

- API escreve e valida a resposta; web consome via proxy; um schema só.
- O route handler valida a resposta do Fastify antes de repassar (defesa contra payload errado upstream).

## Fluxos de dados

**Load direto de URL compartilhada** (inalterado):
URL → `page.tsx` lê `searchParams` (Zod) → `fetchEvents` server → `SearchResults`/home → HTML server-rendered.

**Filtro/chip:**
clique → `runSearch(setter Nuqs)` → URL `replace` → RSC re-render com novos `searchParams` → `fetchEvents` → `ResultsRegion` (skeleton durante a transição) → resultados novos.

**Modal:**
digita (≥2 chars) → debounce 250 ms → `GET /api/suggest` (proxy → Fastify → FTS/venues) → painel → seleção → navegação (`push` evento / `replace` local).

## Tratamento de erros

| Falha | Comportamento |
|---|---|
| API de suggest fora/500 | proxy → 502 → modal fecha o painel silenciosamente; Enter → página de resultados continua funcionando (fetch server-side com error alert como hoje) |
| Payload inválido do Fastify | Zod do proxy rejeita → mesmo caminho do item acima |
| `fetchEvents` falha na página | inalterado: `{ok:false}` → `SearchResults` error alert |
| URL com valor inválido | parse Zod do servidor descarta o campo silenciosamente (comportamento atual) |
| Nenhum resultado no modal | estado "Nenhum resultado" dentro do painel |

## Testes

**Shared:** specs do `suggestResponseSchema` (payload válido/inválido, campos obrigatórios).

**API (integração — sempre no único arquivo `events.routes.integration.spec.ts`, regra do repo):**

- `q="fanta"` (ou equivalente do seed) → events top-5 com relevância + locations corretas
- limit 5 respeitado em events e locations
- locations só de venues com evento
- **caso de risco:** `q="São Paulo"` → FTS encontra events por city (se reprovar, fallback `city` param — ver Riscos)
- `q` com 1 char → 400; sem `q` → 400

**Web unit:**

- **Nuqs:** reescrever `header-search.spec.tsx` e `category-chips.spec.tsx` (hoje mockam `router.replace` de `next/navigation`) com o testing adapter do Nuqs — `withNuqsTestingAdapter`/`NuqsTestingAdapter` de `nuqs/adapters/testing`, capturando `onUrlUpdate` (`UrlUpdateEvent` com `queryString`, `searchParams`, `options.history`) para assertar a URL resultante **e** o `history: 'replace'`; `search-params.spec.tsx` mantém os helpers de servidor e ganha specs dos parsers (descarte de inválido, ordem de serialização estável).
- **Modal (`search-suggestions` spec):** MSW em `/api/suggest` + timers falsos — debounce 250 ms, mínimo 2 chars, ↑↓/Enter/Esc, estados vazio/erro/loading, navegação na seleção (push evento / replace local).
- **Pending:** spec do `ResultsRegion` (skeleton quando `isPending`, children quando não).

**E2E (Playwright, dev server):**

- **Os 5 existentes do ticket 05 continuam verdes sem mudança** (contrato de URL intacto).
- Novos: digita → painel abre → clica no primeiro evento → `/events/o-fantasma-da-opera`; digita + Enter sem seleção → `/?q=` resultados; seleção de local → `/?q={city}`; `Esc` fecha o painel.

## Riscos conhecidos

1. **FTS `portuguese` + nomes de cidade** — stopwords ("São"?) podem enfraquecer/zerar o tsquery para "São Paulo". Mitigação: teste de integração dedicado; fallback documentado: parâmetro `city` dedicado na API (escopo extra, decidido só se o teste reprovar).
2. **Testing adapter do Nuqs** — export confirmado na documentação oficial (`nuqs/adapters/testing`): `withNuqsTestingAdapter` (wrapper de `render`/`renderHook`) ou `NuqsTestingAdapter` (componente), com `onUrlUpdate` capturando `UrlUpdateEvent` (`queryString`, `searchParams`, `options.history`) — usado para assertar URL + `history: 'replace'` nos specs reescritos.
3. **Regras a11y do biome** (`useSemanticElements`, `useAriaPropsSupportedByRole`) já bloquearam implementações anteriores — escolha dos roles verificada na implementação, sem `biome-ignore`.
4. **Next 16 `cacheComponents`/Activity** — client components ficam montados/ocultos entre navegações; Nuqs e o provider precisam tolerar isso (adapter oficial suporta; verificar no build/E2E).
5. **`header-search.tsx` cresce** — por isso o painel vive em `search-suggestions.tsx` separado.

## Critérios de aceite

1. `/?q=&category=&state=&from=&to=` permanece o contrato (E2Es do 05 verdes sem reescrita).
2. Nenhum `router.replace`/`buildSearchPath` manual nos componentes client — tudo via Nuqs.
3. Clique em chip mostra skeleton imediato na região de resultados e troca sem reload de documento.
4. Digitar ≥2 chars no header abre o modal com sugestões (eventos + locais) após debounce; selecionar evento leva à página do evento; Enter leva à página de resultados.
5. URL não muda enquanto o usuário digita (só no submit/seleção).
6. Gates do repo verdes: lint · typecheck · shared/api/web unit · E2E · `next build` · sem drift de schema (migração nova só se fallback `city` disparar).
7. Sem novos inputs além do input de busca existente; sem `biome-ignore`.
