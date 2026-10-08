# Ticket 03 — Design system: tema e cores do TICKETVIBE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tokens de cor/tipografia/raio/sombra extraídos dos mockups vivem como variáveis Tailwind/Shadcn no `apps/web`, o tema escuro é o padrão da aplicação, e os primitivos (botão, badge, chip, input de busca, card de evento, cabeçalho) estão no Storybook com stories que renderizam sem dado externo, executável pelo comando documentado no README.

**Architecture:** Shadcn/ui inicializado no `apps/web` (CLI `init` + `add`) fornece `components.json`, o util `cn`, as dependências (cva, radix-ui, lucide-react, tw-animate-css) e a casca dos componentes gerados — que são customizados para a paleta dos mockups. O pipeline CSS é unificado em `@tailwindcss/postcss` (mesmo caminho para Next e Storybook). `globals.css` é reescrito com os tokens amostrados de `docs/layout/home.png` e `docs/layout/home-2.png`; fontes Poppins (display) + Inter (body) via `next/font` num módulo compartilhado entre `layout.tsx` e o `preview.tsx` do Storybook.

**Tech Stack:** Next.js 16 (Turbopack + PostCSS), Tailwind CSS v4, Shadcn/ui CLI 4.x (style `radix-nova`), Storybook 10 (`@storybook/nextjs-vite`, builder Vite), next/font/google, Biome 2, Lefthook, Turborepo/pnpm workspaces.

**Testing strategy (spec-driven):** testes visuais automatizados estão fora do escopo (spec `:117`/`:131`) e RTL+MSW chegam no ticket 04 (spec `:115`); portanto **este ticket não cria unit tests de componente**. A verificação por task é: `pnpm lint` (Biome), `pnpm --filter @ticketvibe/web typecheck`, `pnpm build` (quando o pipeline CSS muda) e smoke do Storybook (dev curl + `build-storybook` na verificação final).

**Environment facts (verified 2026-10-08, sandbox `/tmp/opencode/shadcn-test`):**
- HEAD `edeb7ba`, árvore limpa, branch `main`. Convenção do repo: executar direto na branch `main` (T01/T02 fizeram assim) — não usar worktree.
- `turbo.json` só define `build`/`typecheck`/`test`/`dev` — scripts novos `storybook`/`build-storybook` do `apps/web` **não** vazam nos pipelines raiz (`pnpm build` = `turbo build` = só `next build`).
- `shadcn@latest` = **4.21.4**, style `radix-nova`. `init` REQUER `-p` (prompt de preset bloqueia sem TTY); sem `next.config.*` falha "could not detect framework" (o repo tem `next.config.ts` ✓). `init` REESCREVE `src/app/layout.tsx` (fonte Geist) → restaurar com `git checkout`. Deps instaladas: `class-variance-authority`, `cn`, `lucide-react@1.53`, `radix-ui`, `shadcn`, `tw-animate-css`. `add button badge input` cria os 3 arquivos em `src/components/ui/`. Imports dos gerados: `import { cn } from "cn"`, `import { Slot } from "radix-ui"`.
- `create-storybook@latest` = **10.6.1**, flag `--type nextjs` detecta → framework **`@storybook/nextjs-vite`** + `storybook`/`@storybook/addon-docs`/`vite` em devDeps, scripts `"storybook": "storybook dev -p 6006"` e `"build-storybook": "storybook build"`. Cria `src/stories/` (template a apagar) e `debug-storybook.log` (a apagar). NÃO mexe em `tsconfig.json` nem `.gitignore`.
- `tsc --noEmit` NÃO inclui `.storybook/` automaticamente (dot-dir fora do glob `**/*.ts`) → incluir explicitamente no tsconfig.
- **Story pattern que compila (testado):** `const meta: Meta<typeof C> = {...}` (anotação explícita) + `type Story = StoryObj<typeof meta>`; com `satisfies Meta<typeof C>` o SB10 exige `args` completo até em story só-com-`render` (TS2322). Types vêm de `@storybook/nextjs-vite` (não `@storybook/react`, que não é dep direto).
- `postcss.config.mjs` com `@tailwindcss/postcss` funciona no `storybook build` (sem mudar nada no side do Next ainda) e `@import "shadcn/tailwind.css"`/`tw-animate-css` resolvem. `next/font/google` importado no `preview.tsx` compila no build do Storybook (fontes caem em URLs gstatic no bundle do iframe; offline cai no fallback `ui-sans-serif` — aceitável; no app Next as fontes são self-hosted).
- Alias `@/*` resolve no Storybook (nextjs-vite) — testado com `@/lib/utils`. `import Image from 'next/image'` compila no Storybook — testado (o story não passa `imageSrc`, então `Image` nunca renderiza).
- Ícones lucide-react 1.53 conferidos: `Music, Drama, LayoutGrid, Mic, PartyPopper, Baby, Ticket, Search, MapPin, ChevronDown, ChevronLeft, ChevronRight, Heart, User, CalendarDays, Zap, Sparkles, Music2, Star` — todos existem.
- Componentes gerados pelo shadcn trazem classes `dark:*` que valem porque `<html class="dark">` fica fixo; para sobrescrever um `dark:*` no `className`, repetir o prefixo `dark:` (o `cn`/twMerge mantém o último do mesmo grupo).

**Scope notes:**
- Fora de escopo: páginas/composição de página, testes visuais, RTL/MSW (ticket 04), Playwright (ticket 05), push (o usuário pusha), qualquer mudança em `apps/api`, `apps/worker`, `packages/shared` ou infra.
- O `page.tsx` placeholder não muda (a home real é ticket 04+); só o visual muda pelos tokens.
- Decisões de design: gradiente `135deg, #00ff87 → #05d983` (classe `.bg-brand-gradient`); texto sobre verde = `#050807`; botões/chips/badges/inputs pill (`rounded-full`); card de evento `rounded-xl` (≈16px, como o mockup); cursor pointer nos botões (flag `--pointer` do init).

---

## Design tokens (amostrados dos mockups — fonte única desta tabela)

| Token (CSS `:root`) | Valor | Onde aparece no mockup |
|---|---|---|
| `--background` | `#0a0716` | fundo da página |
| `--foreground` | `#f8f8fa` | texto principal |
| `--header` | `#0c0a19` | barra do cabeçalho |
| `--card` / `--card-foreground` | `#1c1335` / `#f8f8fa` | cards de evento |
| `--popover` / `--popover-foreground` | `#130f25` / `#f8f8fa` | superfícies elevadas |
| `--primary` / `--primary-foreground` | `#00ff87` / `#050807` | badges neon, preço, CTAs |
| `--primary-hover` / `--primary-active` | `#05d983` / `#03c475` | estados do verde de ação (derivados do gradiente) |
| `--secondary` / `--secondary-foreground` | `#130f25` / `#f8f8fa` | busca, chips, pill de localização |
| `--muted` / `--muted-foreground` | `#130f25` / `#9ca3ab` | textos de apoio |
| `--accent` / `--accent-foreground` | `#1c1335` / `#f8f8fa` | hover de superfícies |
| `--border` / `--input` | `#2e2054` | bordas de cards/pills |
| `--ring` | `#00ff87` | foco |
| `--radius` | `1rem` | cards/pills |
| `--destructive` / `--destructive-foreground` | `#ff5a5f` / `#f8f8fa` | token shadcn padrão (fora dos mockups) |

Tipografia: Inter (`--font-inter`, body) + Poppins 600/700 (`--font-poppins`, display via utilitário `font-heading`). Sombras: `--shadow-card`, `--shadow-primary`, `--shadow-glow` (namespace `--shadow-*` → utils `shadow-card|primary|glow`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/postcss.config.mjs` | Create | pipeline único `@tailwindcss/postcss` (Next + Storybook) |
| `apps/web/next.config.ts` | Modify | remover bloco `turbopack.rules` (passa a usar o PostCSS config) |
| `apps/web/package.json` | Modify | dep `@tailwindcss/postcss`; deps shadcn (init) + scripts Storybook (init) |
| `apps/web/components.json` | Create (init) | config shadcn (style `radix-nova`, alias `@/*`) |
| `apps/web/src/lib/utils.ts` | Create (init) | re-export de `cn` |
| `apps/web/src/app/globals.css` | Rewrite | tokens + `@theme inline` + base shadcn + `.bg-brand-gradient` |
| `apps/web/src/app/fonts.ts` | Create | next/font Inter + Poppins (compartilhado app↔storybook) |
| `apps/web/src/app/layout.tsx` | Rewrite | fontes vars, `class="dark"`, metadata (restaura a reescrita do init) |
| `apps/web/.storybook/main.ts` | Create (init) | config SB (`@storybook/nextjs-vite`, globs `../src/**`) |
| `apps/web/.storybook/preview.tsx` | Rewrite | importa globals+fonts, decorator dark, background `ticketvibe` |
| `apps/web/tsconfig.json` | Modify | incluir `.storybook/**/*.ts(x)` no typecheck |
| `apps/web/.gitignore` | Modify | `.storybook-static`, `debug-storybook.log` |
| `apps/web/src/components/ui/button.tsx` | Customize | variantes primário/secundário/ghost/outline, pill, escala mockup |
| `apps/web/src/components/ui/badge.tsx` | Customize | pill neon uppercase + secondary com borda |
| `apps/web/src/components/ui/input.tsx` | Keep (add) | input base do shadcn, sem mudança |
| `apps/web/src/components/ui/chip.tsx` | Create | chip de categoria selecionado/não selecionado |
| `apps/web/src/components/ui/search-input.tsx` | Create | input de busca com ícone, pill |
| `apps/web/src/components/event-card.tsx` | Create | card de evento (fallback de imagem, badge, favorito, preço, CTA) |
| `apps/web/src/components/header.tsx` | Create | logo, busca, localização, ações |
| `apps/web/src/components/{button,badge,chip,search-input}.ui.*` — stories co-localizados | Create | `*.stories.tsx` ao lado de cada componente (`ui/` e raiz de `components/`) |
| `README.md` | Modify | comando + porta 6006 do Storybook |
| `.scratch/ticketvibe/issues/03-design-system-tema-e-cores.md` | Mark | 5 checkboxes `[x]` + `Status: done` |

---

### Task 1: Unificar pipeline CSS com PostCSS

**Files:**
- Create: `apps/web/postcss.config.mjs`
- Modify: `apps/web/next.config.ts`, `apps/web/package.json` (via pnpm), `pnpm-lock.yaml`

- [x] **Step 1: Criar o PostCSS config**

Escreva `apps/web/postcss.config.mjs`:

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

- [x] **Step 2: Remover a regra Turbopack do Next config**

Substitua `apps/web/next.config.ts` inteiro por:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
```

- [x] **Step 3: Trocar a dependência**

```bash
pnpm --filter @ticketvibe/web remove @tailwindcss/turbopack
pnpm --filter @ticketvibe/web add -D @tailwindcss/postcss
```

Esperado: ambas saem com `Done`; `apps/web/package.json` tem `@tailwindcss/postcss` em devDependencies e **não** tem mais `@tailwindcss/turbopack`.

- [x] **Step 4: Confirmar que nada mais referencia o loader antigo**

Run: `rg "@tailwindcss/turbopack" apps/web`
Expected: EXIT=1 (zero ocorrências)

- [x] **Step 5: Build do Next prova o pipeline novo**

Run: `pnpm build`
Expected: exit 0 (Next 16 + Turbopack consome o `postcss.config.mjs`)

- [x] **Step 6: Provar que o Tailwind expandiu no CSS gerado**

Run: `grep -c "::file-selector-button" apps/web/.next/static/chunks/*.css`
Expected: número ≥ 1 em pelo menos um arquivo (preflight do Tailwind v4 presente ⇒ `@import "tailwindcss"` processado pelo PostCSS; se 0, o PostCSS não rodou — não siga antes de resolver)

- [x] **Step 7: Lint e commit**

```bash
pnpm exec biome check --write apps/web/postcss.config.mjs apps/web/next.config.ts
pnpm lint
git add apps/web/postcss.config.mjs apps/web/next.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): unify tailwind pipeline with postcss"
```

---

### Task 2: Scaffold do Shadcn/ui

**Files:**
- Create: `apps/web/components.json`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/{button,badge,input}.tsx`
- Modify: `apps/web/src/app/globals.css` (edição provisória do init — reescrita na Task 3), `apps/web/package.json`, `pnpm-lock.yaml`
- Restore: `apps/web/src/app/layout.tsx` (o init o reescreve — desfazer)

- [x] **Step 1: Rodar o init (flags verificadas em sandbox)**

Workdir `apps/web`:

```bash
pnpm dlx shadcn@latest init -b radix -p nova -y --pointer --css-variables --no-monorepo --no-rtl
```

Expected (trechos-chave da saída):
```
✔ Preflight checks.
✔ Verifying framework. Found Next.js.
✔ Validating Tailwind CSS. Found v4.
✔ Validating import alias.
✔ Writing components.json.
✔ Installing dependencies.
✔ Created 1 file:
  - src/lib/utils.ts
✔ Updating src/app/globals.css
Project initialization completed.
```
Obs.: sem `-p nova` o CLI trava num prompt de preset (falha em ambiente sem TTY). A saída real pode trazer versões diferentes de 4.21.4 — ok.

- [x] **Step 2: Restaurar o layout que o init reescreveu**

```bash
git checkout -- apps/web/src/app/layout.tsx
```

(O `init` grava um layout Geist próprio; o layout final é da Task 3.)

- [x] **Step 3: Adicionar os componentes da base (registry funciona ponta a ponta)**

Workdir `apps/web`:

```bash
pnpm dlx shadcn@latest add button badge input -y
```

Expected:
```
✔ Checking registry.
✔ Created 3 files:
  - src/components/ui/button.tsx
  - src/components/ui/badge.tsx
  - src/components/ui/input.tsx
```

- [x] **Step 4: Verificar o resultado do scaffold**

```bash
test -f apps/web/components.json && test -f apps/web/src/lib/utils.ts && echo OK
rg '"(class-variance-authority|cn|lucide-react|radix-ui|shadcn|tw-animate-css)"' apps/web/package.json
rg 'shadcn/tailwind.css' apps/web/src/app/globals.css
test ! -f apps/web/package-lock.json && echo "sem npm lockfile"
git status --short
```

Expected: `OK`; as 6 deps presentes; o `@import "shadcn/tailwind.css"` no globals; `sem npm lockfile` (se existir `package-lock.json` — o init usou npm por engano — `rm apps/web/package-lock.json && pnpm install` antes de seguir); `git status --short` lista apenas `apps/web/package.json`, `apps/web/src/app/globals.css`, `pnpm-lock.yaml` (M) e `apps/web/components.json`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/` (??) — **`layout.tsx` não pode aparecer**.

- [x] **Step 5: Formatar o que o CLI escreveu e passar o gate**

```bash
pnpm exec biome check --write apps/web/src apps/web/components.json apps/web/package.json
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: todos exit 0. (Os arquivos do CLI saem com aspas duplas/indent 4 — o `--write` normaliza para o estilo do repo.)

- [x] **Step 6: Commit**

```bash
git add apps/web/components.json apps/web/src/lib/utils.ts apps/web/src/components/ui apps/web/src/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): scaffold shadcn ui with radix base"
```

---

### Task 3: Tokens do mockup + tema escuro + fontes

**Files:**
- Rewrite: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/fonts.ts`
- Rewrite: `apps/web/src/app/layout.tsx`

- [x] **Step 1: Criar o módulo de fontes**

Escreva `apps/web/src/app/fonts.ts`:

```ts
import { Inter, Poppins } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});
```

- [x] **Step 2: Reescrever `globals.css` com os tokens**

Apague `apps/web/src/app/globals.css` e escreva exatamente isto (estrutura igual à que o init gerou — imports/base mantidos; valores substituídos pelos da tabela de tokens):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: var(--font-inter, ui-sans-serif, system-ui, sans-serif);
  --font-heading: var(--font-poppins, ui-sans-serif, system-ui, sans-serif);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-header: var(--header);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-primary-active: var(--primary-active);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --shadow-card: 0 12px 32px -16px rgb(0 0 0 / 0.6);
  --shadow-primary: 0 4px 16px -4px rgb(0 255 135 / 0.35);
  --shadow-glow: 0 0 28px -6px rgb(0 255 135 / 0.45);
}

:root {
  color-scheme: dark;
  --background: #0a0716;
  --foreground: #f8f8fa;
  --header: #0c0a19;
  --card: #1c1335;
  --card-foreground: #f8f8fa;
  --popover: #130f25;
  --popover-foreground: #f8f8fa;
  --primary: #00ff87;
  --primary-foreground: #050807;
  --primary-hover: #05d983;
  --primary-active: #03c475;
  --secondary: #130f25;
  --secondary-foreground: #f8f8fa;
  --muted: #130f25;
  --muted-foreground: #9ca3ab;
  --accent: #1c1335;
  --accent-foreground: #f8f8fa;
  --destructive: #ff5a5f;
  --destructive-foreground: #f8f8fa;
  --border: #2e2054;
  --input: #2e2054;
  --ring: #00ff87;
  --radius: 1rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
  html {
    @apply font-sans;
  }
}

@layer components {
  .bg-brand-gradient {
    background-image: linear-gradient(135deg, #00ff87 0%, #05d983 100%);
  }
}
```

Notas: paleta dark vive só no `:root` (produto é dark-only, sem bloco `.dark` e sem `@media (prefers-color-scheme)`); o `@custom-variant dark` fica porque os componentes gerados usam utilitários `dark:*` com `<html class="dark">` fixo. Os três `@import` do topo são os mesmos que o init gravou (Task 2) — se algum não estiver no arquivo que o init gerou/instalou, remova essa linha em vez de adicioná-la (só são resolvíveis se as deps correspondentes existirem no `package.json`).

- [x] **Step 3: Reescrever o layout (aplica dark + fontes)**

Apague `apps/web/src/app/layout.tsx` e escreva:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { inter, poppins } from './fonts';

export const metadata: Metadata = {
  title: 'TICKETVIBE',
  description: 'Marketplace de ingressos para eventos',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${poppins.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [x] **Step 4: Build + asserções de tokens e fontes**

```bash
pnpm build
grep -c "#0a0716" apps/web/.next/static/chunks/*.css
find apps/web/.next/static -name "*.woff2" | head -3
pnpm --filter @ticketvibe/web typecheck
```

Expected: build exit 0; grep ≥ 1 (token no bundle CSS); ao menos 1 `.woff2` (next/font self-hostado no app); typecheck exit 0.
Se o build falhar resolvendo `shadcn/tailwind.css` ou `tw-animate-css`: confirme que as deps existem em `apps/web/package.json` (`pnpm list --filter @ticketvibe/web shadcn tw-animate-css`) e que o passo 2 manteve só os imports suportados.

- [x] **Step 5: Lint e commit**

```bash
pnpm exec biome check --write apps/web/src/app
pnpm lint
git add apps/web/src/app/globals.css apps/web/src/app/fonts.ts apps/web/src/app/layout.tsx
git commit -m "feat(web): apply ticketvibe dark theme tokens and fonts"
```

---

### Task 4: Storybook instalado e com preview dark

**Files:**
- Create: `apps/web/.storybook/main.ts` (init), `apps/web/.storybook/preview.tsx` (reescrito)
- Modify: `apps/web/tsconfig.json`, `apps/web/.gitignore`
- Delete: `apps/web/src/stories/` (template), `apps/web/debug-storybook.log` (se existir)

- [x] **Step 1: Instalar (flags verificadas em sandbox)**

Workdir `apps/web`:

```bash
pnpm dlx create-storybook@latest --yes --type nextjs --features docs --package-manager pnpm --no-dev --disable-telemetry
```

Expected (trechos-chave):
```
Dependencies installed
Addons configured successfully
✅ @storybook/addon-docs
Storybook was successfully installed in your project!
To run Storybook, run pnpm run storybook.
```

- [x] **Step 2: Conferir o framework detectado (condiciona os imports abaixo)**

Run: `cat apps/web/.storybook/main.ts`
Expected: `framework: "@storybook/nextjs-vite"` e `import type { StorybookConfig } from '@storybook/nextjs-vite'` (esperado para Next 16). **Se o init escolher outro pacote** (ex.: `@storybook/nextjs`), troque o nome do pacote em TODOS os `import type { ... } from '@storybook/...'` deste plano (preview e stories) para o pacote indicado no `main.ts` — é a única substituição permitida.

- [x] **Step 3: Apagar o template e o log**

```bash
rm -rf apps/web/src/stories
rm -f apps/web/debug-storybook.log
```

- [x] **Step 4: Typecheck passar a cobrir `.storybook/`**

Em `apps/web/tsconfig.json`, substitua o array `include` por:

```json
"include": [
  "next-env.d.ts",
  "**/*.ts",
  "**/*.tsx",
  ".next/types/**/*.ts",
  ".next/dev/types/**/*.ts",
  "**/*.mts",
  ".storybook/**/*.ts",
  ".storybook/**/*.tsx"
]
```

- [x] **Step 5: Reescrever o preview**

Apague `apps/web/.storybook/preview.tsx` e escreva:

```tsx
import type { Preview } from '@storybook/nextjs-vite';
import { inter, poppins } from '../src/app/fonts';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'ticketvibe',
      values: [{ name: 'ticketvibe', value: '#0a0716' }],
    },
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div
        className={`${inter.variable} ${poppins.variable} dark min-h-screen bg-background font-sans text-foreground`}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

(Se o Step 2 mostrou outro framework, ajuste o `import type { Preview }` conforme a regra de lá.)

- [x] **Step 6: Scripts e gitignore**

Confira que o init gravou em `apps/web/package.json`:

```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

(Estão iguais às esperadas — se divergirem, ajuste para estas.) Garanta as linhas do `apps/web/.gitignore` (idempotente):

```bash
grep -q '^.storybook-static$' apps/web/.gitignore || echo '.storybook-static' >> apps/web/.gitignore
grep -q '^debug-storybook.log$' apps/web/.gitignore || echo 'debug-storybook.log' >> apps/web/.gitignore
```

- [x] **Step 7: Formatar, typecheck e build do Storybook**

```bash
pnpm exec biome check --write apps/web/.storybook apps/web/tsconfig.json apps/web/package.json apps/web/.gitignore
pnpm lint
pnpm --filter @ticketvibe/web typecheck
pnpm --filter @ticketvibe/web build-storybook
```

Expected: tudo exit 0; o build termina com `Storybook build completed successfully` (sem stories ainda — valida o pipeline: PostCSS + globals + fonts no preview). `apps/web/.storybook-static/` fica coberto pelo gitignore novo.

- [x] **Step 8: Commit**

```bash
git add apps/web/.storybook apps/web/tsconfig.json apps/web/.gitignore apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add storybook with dark preview"
```

---

### Task 5: Button (primário/secundário/ghost) + story

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx` (customizar o gerado na Task 2)
- Create: `apps/web/src/components/ui/button.stories.tsx`

- [x] **Step 1: Substituir `button.tsx` pelo conteúdo customizado**

Apague e escreva `apps/web/src/components/ui/button.tsx`:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-brand-gradient text-primary-foreground shadow-primary hover:brightness-105 hover:shadow-glow active:brightness-95',
        outline: 'border-border bg-transparent text-foreground hover:bg-accent',
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 gap-1.5 px-4 text-sm',
        default: 'h-11 gap-2 px-5 text-sm',
        lg: 'h-12 gap-2.5 px-7 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

- [x] **Step 2: Criar o story**

Escreva `apps/web/src/components/ui/button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'],
    },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon'] },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { children: 'Garantir Ingressos' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Ver detalhes' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Cancelar' },
};
```

- [x] **Step 3: Verificar**

```bash
pnpm exec biome check --write apps/web/src/components/ui
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 nos três.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/button.tsx apps/web/src/components/ui/button.stories.tsx
git commit -m "feat(web): restyle button primitive and add story"
```

---

### Task 6: Badge (neon/secundário/outline) + story

**Files:**
- Modify: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/badge.stories.tsx`

- [x] **Step 1: Substituir `badge.tsx` pelo conteúdo customizado**

Apague e escreva `apps/web/src/components/ui/badge.tsx`:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const badgeVariants = cva(
  'group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-3 py-0.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default:
          'bg-primary font-bold uppercase tracking-wide text-primary-foreground [a]:hover:bg-primary-hover',
        secondary:
          'border-border bg-secondary text-secondary-foreground [a]:hover:bg-accent',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

- [x] **Step 2: Criar o story**

Escreva `apps/web/src/components/ui/badge.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Em destaque' },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 bg-background p-4">
      <Badge>Em destaque</Badge>
      <Badge variant="secondary">Espetáculo Internacional</Badge>
      <Badge variant="outline">Novo</Badge>
    </div>
  ),
};
```

- [x] **Step 3: Verificar**

```bash
pnpm exec biome check --write apps/web/src/components/ui
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 nos três.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/badge.tsx apps/web/src/components/ui/badge.stories.tsx
git commit -m "feat(web): restyle badge primitive and add story"
```

---

### Task 7: Chip de categoria (selecionado/não selecionado) + story

**Files:**
- Create: `apps/web/src/components/ui/chip.tsx`, `apps/web/src/components/ui/chip.stories.tsx`

- [x] **Step 1: Criar o componente**

Escreva `apps/web/src/components/ui/chip.tsx`:

```tsx
import type * as React from 'react';
import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';

type ChipProps = Omit<React.ComponentProps<'button'>, 'children'> & {
  icon?: LucideIcon;
  label: string;
  selected?: boolean;
};

function Chip({
  icon: Icon,
  label,
  selected = false,
  className,
  ...props
}: ChipProps) {
  return (
    <button
      data-slot="chip"
      {...props}
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected
          ? 'border-transparent bg-primary font-semibold text-primary-foreground hover:bg-primary-hover'
          : 'border-border bg-secondary text-foreground hover:bg-accent',
        className,
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}

export { Chip };
```

- [x] **Step 2: Criar o story (linha com os dois estados)**

Escreva `apps/web/src/components/ui/chip.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LayoutGrid, Music, Drama, Mic } from 'lucide-react';
import { Chip } from './chip';

const meta: Meta<typeof Chip> = {
  title: 'Components/Chip',
  component: Chip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    label: { control: 'text' },
    selected: { control: 'boolean' },
    icon: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  args: { label: 'Shows', selected: true },
};

export const Unselected: Story = {
  args: { label: 'Teatro' },
};

export const CategoryRow: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 bg-background p-4">
      <Chip icon={LayoutGrid} label="Todos" selected />
      <Chip icon={Music} label="Shows" />
      <Chip icon={Drama} label="Teatro" />
      <Chip icon={Mic} label="Stand-up" />
    </div>
  ),
};
```

- [x] **Step 3: Verificar**

```bash
pnpm exec biome check --write apps/web/src/components/ui
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 nos três.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/chip.tsx apps/web/src/components/ui/chip.stories.tsx
git commit -m "feat(web): add category chip primitive and story"
```

---

### Task 8: SearchInput (input de busca) + story

**Files:**
- Create: `apps/web/src/components/ui/search-input.tsx`, `apps/web/src/components/ui/search-input.stories.tsx`
- Keep: `apps/web/src/components/ui/input.tsx` (gerado na Task 2, sem edição)

- [x] **Step 1: Criar o componente (envolve o `Input` do shadcn)**

Escreva `apps/web/src/components/ui/search-input.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { cn } from 'cn';
import { Input } from './input';

type SearchInputProps = ComponentProps<typeof Input> & {
  wrapperClassName?: string;
};

function SearchInput({ className, wrapperClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className={cn('h-11 rounded-full border-border pl-11 pr-4 dark:bg-secondary', className)}
        {...props}
      />
    </div>
  );
}

export { SearchInput };
```

Notas: `dark:bg-secondary` é necessário porque o `Input` gerado define `dark:bg-input/30` e, com `<html class="dark">` fixo, esse utilitário vence o `bg-*` simples — o `cn` mantém o último `dark:*` do mesmo grupo. `pl-11 pr-4` substitui o `px-2.5` base via twMerge.

- [x] **Step 2: Criar o story**

Escreva `apps/web/src/components/ui/search-input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SearchInput } from './search-input';

const meta: Meta<typeof SearchInput> = {
  title: 'Components/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Buscar shows, teatro, comédia, cidade.',
    wrapperClassName: 'w-96',
  },
};
```

- [x] **Step 3: Verificar**

```bash
pnpm exec biome check --write apps/web/src/components/ui
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 nos três.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/search-input.tsx apps/web/src/components/ui/search-input.stories.tsx
git commit -m "feat(web): add search input primitive and story"
```

---

### Task 9: EventCard (card de evento) + story

**Files:**
- Create: `apps/web/src/components/event-card.tsx`, `apps/web/src/components/event-card.stories.tsx`

- [x] **Step 1: Criar o componente**

Escreva `apps/web/src/components/event-card.tsx`:

```tsx
import Image from 'next/image';
import { CalendarDays, Heart, MapPin, Ticket } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

type EventCardProps = {
  category: string;
  title: string;
  date: string;
  venue: string;
  price: string;
  badgeLabel?: string;
  imageSrc?: string;
  className?: string;
};

function EventCard({
  category,
  title,
  date,
  venue,
  price,
  badgeLabel,
  imageSrc,
  className,
}: EventCardProps) {
  return (
    <article
      className={cn(
        'w-full max-w-80 overflow-hidden rounded-xl border border-border bg-card shadow-card',
        className,
      )}
    >
      <div className="relative aspect-[16/10] w-full">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#2e2054_0%,#1c1335_55%,#0a2a1e_100%)]">
            <Ticket className="size-10 text-primary/70" aria-hidden="true" />
          </div>
        )}
        {badgeLabel ? <Badge className="absolute left-3 top-3">{badgeLabel}</Badge> : null}
        <Button
          variant="outline"
          size="icon"
          aria-label={`Favoritar ${title}`}
          className="absolute right-3 top-3 bg-background/70 backdrop-blur-sm"
        >
          <Heart className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{category}</p>
        <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {date}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {venue}
        </p>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">A partir de</p>
            <p className="text-xl font-bold text-primary">{price}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          >
            Ver Ingressos
          </Button>
        </div>
      </div>
    </article>
  );
}

export { EventCard };
```

Notas: sem `imageSrc` o card usa o fallback gradient (o story nunca passa imagem — stories renderizam sem dado externo); `next/image` só é renderizado quando `imageSrc` existe (o import compila no Storybook — verificado em sandbox).

- [x] **Step 2: Criar o story (dados estáticos do mockup)**

Escreva `apps/web/src/components/event-card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EventCard } from './event-card';

const meta: Meta<typeof EventCard> = {
  title: 'Components/EventCard',
  component: EventCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    category: 'Teatro',
    title: 'O Fantasma da Ópera',
    date: '22 de Outubro, 2026',
    venue: 'Teatro Renault',
    price: 'R$ 120,00',
    badgeLabel: 'Clássico',
  },
};
```

- [x] **Step 3: Verificar**

```bash
pnpm exec biome check --write apps/web/src/components
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 nos três.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/event-card.tsx apps/web/src/components/event-card.stories.tsx
git commit -m "feat(web): add event card component and story"
```

---

### Task 10: Header (logo, busca, localização, ações) + story

**Files:**
- Create: `apps/web/src/components/header.tsx`, `apps/web/src/components/header.stories.tsx`

- [x] **Step 1: Criar o componente**

Escreva `apps/web/src/components/header.tsx`:

```tsx
import { ChevronDown, Heart, MapPin, Ticket, User } from 'lucide-react';
import { Button } from './ui/button';
import { SearchInput } from './ui/search-input';

type HeaderProps = {
  location?: string;
  searchPlaceholder?: string;
};

function Header({
  location = 'São Paulo, SP',
  searchPlaceholder = 'Buscar shows, teatro, comédia, cidade.',
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-header">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center gap-2 px-4 sm:gap-4 lg:gap-6 lg:px-8">
        <a href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-gradient">
            <Ticket className="size-6 text-primary-foreground" aria-hidden="true" />
          </span>
          <span className="hidden min-[360px]:inline font-heading text-xl font-bold tracking-tight">
            <span className="text-foreground">TICKET</span>
            <span className="text-primary">VIBE</span>
          </span>
        </a>
        <SearchInput
          wrapperClassName="hidden max-w-md flex-1 md:flex"
          placeholder={searchPlaceholder}
        />
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className="hidden h-10 min-w-0 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline-flex"
          >
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 truncate">{location}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          <Button variant="outline" size="icon" aria-label="Favoritos">
            <Heart className="size-5" />
          </Button>
          <Button variant="default">
            <User className="size-4" aria-hidden="true" />
            Entrar
          </Button>
        </div>
      </div>
    </header>
  );
}

export { Header };
```

Notas: o link do logo é `<a href="/">` simples (navegação client-side com `next/link` fica para o ticket 04, quando houver rotas); `bg-header` vem do token `--color-header` (Task 3); busca some abaixo de `md` (responsivo do mockup).

- [x] **Step 2: Criar o story (layout full-screen)**

Escreva `apps/web/src/components/header.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Header } from './header';

const meta: Meta<typeof Header> = {
  title: 'Components/Header',
  component: Header,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { location: 'São Paulo, SP' },
};
```

- [x] **Step 3: Verificar**

```bash
pnpm exec biome check --write apps/web/src/components
pnpm lint
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 nos três.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/header.tsx apps/web/src/components/header.stories.tsx
git commit -m "feat(web): add header component and story"
```

---

### Task 11: Documentar o Storybook no README

**Files:**
- Modify: `README.md`

- [x] **Step 1: Adicionar a linha de script**

Na tabela `## Scripts (raiz)` do `README.md`, adicione a linha:

```markdown
| `pnpm --filter @ticketvibe/web storybook` | Storybook do design system (catálogo em http://localhost:6006) |
```

- [x] **Step 2: Adicionar a porta**

Na tabela `## Portas`, adicione a linha:

```markdown
| 6006 | storybook (design system do web) |
```

- [x] **Step 3: Atualizar a linha do web na estrutura**

Em `## Estrutura`, substitua a linha do `apps/web` por:

```markdown
apps/web          Next.js 16 + Tailwind + Shadcn/ui + Storybook :6006 (pt-BR; moeda BRL conforme spec)
```

- [x] **Step 4: Provar que o comando documentado funciona (smoke)**

```bash
pnpm --filter @ticketvibe/web storybook >/tmp/sb.log 2>&1 &
SB_PID=$!
code=000
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6006 || true)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "HTTP=$code"
kill "$SB_PID" 2>/dev/null
pkill -f "storybook dev" 2>/dev/null
true
```

Expected: `HTTP=200`; ao final `pgrep -f "storybook dev"` não encontra processos (se sobrar, mate-os antes de seguir).

- [x] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document storybook command and port"
```

---

### Task 12: Verificação final + fechar o ticket

**Files:**
- Modify: `.scratch/ticketvibe/issues/03-design-system-tema-e-cores.md`

- [x] **Step 1: Gates completos**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: todos exit 0 (`typecheck` roda o build do web via turbo antes — é a checagem de tipos do `.storybook` e dos stories também).

- [x] **Step 2: Build estático do Storybook**

```bash
pnpm --filter @ticketvibe/web build-storybook
```

Expected: exit 0, `Storybook build completed successfully`.

- [x] **Step 3: Smoke do dev server web**

```bash
pnpm --filter @ticketvibe/web dev >/tmp/web-dev.log 2>&1 &
WEB_PID=$!
code=000
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 || true)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "HTTP=$code"
kill "$WEB_PID" 2>/dev/null
pkill -f "next dev" 2>/dev/null
true
```

Expected: `HTTP=200`; sem processos `next dev` restantes depois (`pgrep -f "next dev"` vazio).

- [x] **Step 4: Asserções dos critérios**

```bash
rg -c "#0a0716" apps/web/.next/static/chunks/*.css
rg "fetch\(|axios|useSWR|useQuery" apps/web/src --glob "*.stories.tsx"
git check-ignore apps/web/storybook-static && echo IGNORED
rg "storybook" README.md
```

Expected: token presente (≥1); o `rg` de rede EXIT=1 (nenhuma story busca dado externo); `IGNORED` impresso (build artifacts ignorados); `storybook` documentado no README.
Se algum utilitário esperado faltar no CSS (ex.: `bg-primary-hover`), o mapping correspondente no `@theme inline` do `globals.css` não entrou — corrija antes de fechar.

- [x] **Step 5: Marcar o ticket como done**

Em `.scratch/ticketvibe/issues/03-design-system-tema-e-cores.md`: troque `**Status:** ready-for-agent` por `**Status:** done` e marque os 5 checkboxes:

```markdown
- [x] Tokens de cor extraídos dos mockups (fundo, superfícies, verde de ação, roxo, bordas, estados hover/focus) definidos como variáveis Tailwind/Shadcn
- [x] Tipografia, raios de borda e sombras definidos como tokens coerentes com os mockups
- [x] Primitivos documentados no Storybook com stories: botão (primário/secundário/ghost), badge, chip de categoria selecionado/não selecionado, card de evento, input de busca, cabeçalho (logo, busca, localização, ações)
- [x] Tema escuro aplicado como padrão do `apps/web`
- [x] Storybook renderiza sem dado externo e é executável por comando documentado
```

- [x] **Step 6: Commit final**

```bash
git add .scratch/ticketvibe/issues/03-design-system-tema-e-cores.md
git commit -m "docs: mark ticket 03 as done"
```

- [x] **Step 7: Sweep de higiene**

```bash
git status --short
pgrep -f "storybook dev" || echo "storybook limpo"
pgrep -f "next dev" || echo "web limpo"
```

Expected: árvore limpa (exceto artefatos ignorados) e ambos `limpo`. A infra `ticketvibe-{postgres,redis,mailpit}` não foi tocada — deixe-a como está; não rode `pnpm infra:down`.
