# 04: Seed de eventos + home (destaque + eventos em alta)

**What to build:** O visitante abre a home e vê um evento em destaque (hero com badge, data, local, descrição, preço a partir de, CTA "Garantir Ingressos") e o carrossel "Eventos em Alta" com cards de evento (categoria, data, local, preço, ação) — tudo vindo da API a partir de fixtures seedadas, com o visual do design system.

**Blocked by:** 01 (Base do monorepo + ambiente local), 03 (Design system: tema e cores do TICKETVIBE)

**Status:** done

- [x] Schema do banco para eventos, categorias e locais, com migrações
- [x] Fixtures seed versionadas no repo (venues, categorias, eventos de exemplo com preços)
- [x] Rota REST de listagem de eventos com destaque, validada por Zod do `packages/shared`
- [x] Home consumindo a API: hero em destaque + carrossel "Eventos em Alta"
- [x] Testes: integração da rota (Postgres real), unitários do caso de uso, componente da home com MSW

## Deferrals do ticket 03 (registrados no code review final do 03)

Pendências adiadas deliberadamente — decidir/trabalhar aqui antes de avançar:

- **Sign-off de design do contraste `--border`/`--input: #2e2054`** — medido: borda vs fundo 1,38:1, fill vs fundo 1,06:1 (WCAG 1.4.11 pede 3:1 para limites de UI). Token é derivado do mockup (critério do 03 = "conforme mockup"), texto passa (foreground 18,77:1, muted 7,81:1, primary 14,84:1). Precisa de **sign-off de design**: manter mockup ou ajustar. Não "consertar" no código sem decisão.
- **Header location pill duplica o `Chip` unselected** (idêntico em `header.tsx:36` vs `chip.tsx:25,28`) — no rework do Header do 04: estender `Chip` com ícone trailing/truncate opcional e consumi-lo no pill.
- **Header: wiring fechado** — `searchProps`/handlers, location/menu, `aria-haspopup` quando houver picker, `<a href="/">` → `next/link`.
- **`page.tsx` placeholder usa `bg-black`/`text-emerald-400`** (não-token) — substituir pelos tokens do tema na home do 04.
- **`/_not-found` renderiza claro** — pré-existente; criar `not-found.tsx` com tokens escuros no 04+.
- **EventCard minors (junto do trabalho de imagem do 04/06):** `sizes` superestima 369–768px; gradiente fallback com hexes hardcoded (`#2e2054`, `#1c1335`, `#0a2a1e` — o último nem é token); `alt=""` precisa virar prop quando houver imagem real; colisão badge/favorito >250px.
- **`.bg-brand-gradient` em `globals.css:86-88`** hardcoded `#00ff87`/`#05d983` em vez de `var(--primary)`/`var(--primary-hover)`.
- **`dark:bg-secondary` no SearchInput** → `bg-secondary` (dark-only, semântica limpa).
- **Higiene:** linha morta `.storybook-static` no `.gitignore` do web; ordem de import plan vs biome (drift cosmético).
