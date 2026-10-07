# Ticket 02 — Adaptar docs legados ao novo projeto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/` descreve o TICKETVIBE (comandos, pacotes, caminhos, exemplos), sem nenhum resquício do projeto anterior (`kronostore`), e todo comando documentado foi executado e funciona como escrito — mais um `README.md` de onboarding na raiz.

**Architecture:** Documentação pura (markdown) — nenhum código de aplicação muda. A reescrita de `docs/TESTING.md` espelha o estado real pós-ticket-01 e as decisões de teste da spec; as duas guidelines de teste ficam portáteis mas com exemplos/comandos do domínio e pacotes deste projeto; `COMMIT_GUIDELINE.md` é revisado e nomeado por projeto; um sweep final com `rg` prova ausência de referências antigas. Verificação = executar cada comando documentado + greps de asserção.

**Tech Stack:** markdown; Biome não processa `.md` (bloco `vcs`/`ignoreUnknown` já cobre); gates existentes (Lefthook pre-commit biome em staged, pre-push typecheck+test) continuam valendo nos commits deste ticket.

**Environment facts (verified 2026-10-07):** HEAD `2c57e68`, árvore limpa, branch `main`. `kronostore` ocorre: `docs/TESTING.md` (11), `docs/skills/TESTING_API_GUIDELINE.md` (5), `docs/skills/TESTING_FRONTEND_GUIDELINE.md` (5). Não existe `README.md`. `docs/agents/issue-tracker.md:10` cita `triage-labels.md` inexistente. `docs/layout/*.png` são mockups citados pela spec (linha 136) — NÃO são legado, manter. Scripts de pacote: `@ticketvibe/web` tem `dev/build/start/typecheck` (sem `test`); `@ticketvibe/worker` tem `dev/typecheck` (sem `test`); só `shared` e `api` têm `test`.

**Scope notes:**
- Tarefa 5 (README) é o follow-up #1 do review final do ticket 01 ("dobra no ticket 02"). Se preferir descartar, marque-a cancelled — os critérios do ticket continuam cobertos pelas Tasks 1–4 e 6–7.
- Fora de escopo: criar `GLOSSARY.md`/`docs/adr/` (domain skill cria preguiçosamente), Storybook (ticket 03), qualquer código de aplicação, push.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs/TESTING.md` | Rewrite | Mapa de testes do TICKETVIBE: princípios da spec, estado atual (pacotes/comandos reais), três níveis (o que existe × o que vem com qual ticket), layout hexagonal planejado, cobertura, gates |
| `docs/skills/TESTING_API_GUIDELINE.md` | Adapt | Diretriz portátil de teste de API (hexagonal) com banner de status, correção de contradição, comandos reais, Project Overrides do TICKETVIBE |
| `docs/skills/TESTING_FRONTEND_GUIDELINE.md` | Adapt | Diretriz portátil frontend com banner de status de tooling, exemplos no domínio de eventos, sem seção Admin do projeto antigo, comandos reais, Project Overrides |
| `docs/skills/COMMIT_GUIDELINE.md` | Light edit | Convenção de commits (conteúdo já correto) — H1 nomeado por projeto |
| `README.md` | Create | Runbook de onboarding: requisitos, quickstart, scripts, portas, env vars, estrutura, índice da documentação |
| `docs/agents/issue-tracker.md` | Fix line 10 | Remover referência morta a `triage-labels.md` |
| `.scratch/ticketvibe/spec.md` | Edit line 135 | Fechar a pendência de docs legados |
| `.scratch/ticketvibe/issues/02-adaptar-docs-legados-ao-novo-projeto.md` | Mark | Checkboxes + status `done` |

---

### Task 1: Rewrite `docs/TESTING.md`

**Files:**
- Rewrite: `docs/TESTING.md`

- [ ] **Step 1: Substituir o arquivo inteiro pelo conteúdo novo**

Apague `docs/TESTING.md` e escreva exatamente isto:

````markdown
# Testing — TICKETVIBE

How testing works in this repository. Project-specific deviations from the generic skills:

- API: [`docs/skills/TESTING_API_GUIDELINE.md`](./skills/TESTING_API_GUIDELINE.md)
- Frontend: [`docs/skills/TESTING_FRONTEND_GUIDELINE.md`](./skills/TESTING_FRONTEND_GUIDELINE.md)
- Commits: [`docs/skills/COMMIT_GUIDELINE.md`](./skills/COMMIT_GUIDELINE.md)

## Principles (from the spec)

- Assert only external behavior: HTTP status/body, database effects, rendered state, browser flows — never private calls or internal class structure.
- The Zod contract in `packages/shared` is the single seam between `apps/web` and `apps/api`; other tests hang off it.
- Unit tests are co-located: `<source>.spec.ts` next to `<source>.ts`.
- Unit tests never touch the database, network, filesystem, or a real clock.

## Current state (after ticket 01)

| Package | Runner | Command | Status |
|---|---|---|---|
| `packages/shared` | Vitest | `pnpm --filter @ticketvibe/shared test` | 2 tests (`healthResponseSchema`) |
| `apps/api` | Vitest | `pnpm --filter @ticketvibe/api test` | 1 test (`GET /health` via `app.inject`, validated against the shared contract) |
| `apps/web` | — | no `test` script yet | component tests (RTL + MSW) arrive with the first feature tickets |
| `apps/worker` | — | no `test` script yet | verified live against Redis (see Commands below) |

Existing test layout:

```
packages/shared/src/index.ts         # healthResponseSchema (Zod) — the contract seam
packages/shared/src/index.spec.ts    # contract tests (TDD: test written first)
apps/api/src/app.ts                  # buildApp() — Fastify instance (HTTP test seam)
apps/api/src/app.spec.ts             # GET /health validated against the shared contract
apps/api/src/index.ts                # composition root (listen) — not unit tested
```

## Commands

Run from the repository root:

```bash
pnpm lint                              # biome check . (all packages, incl. apps/web)
pnpm typecheck                         # turbo typecheck (builds web first to generate .next/types)
pnpm test                              # turbo test (shared + api; packages without a test script are skipped)
pnpm build                             # turbo build (web only today)

pnpm --filter @ticketvibe/shared test  # just the contract tests
pnpm --filter @ticketvibe/api test     # just the API tests
```

Worker smoke (requires `pnpm infra:up` first — Redis must be running):

```bash
timeout 10 pnpm --filter @ticketvibe/worker dev
```

Expected: `[worker] listening for heartbeat jobs`, `[worker] job processed: N`, exit code `124` (the `timeout` kills a healthy persistent process).

## Three levels (spec story 48) — what exists vs what's coming

| Level | Tooling | Status |
|---|---|---|
| Unit | Vitest, co-located `.spec.ts` | **live** — `packages/shared`, `apps/api` |
| Integration (routes + real Postgres) | Vitest against a local `ticketvibe_test` database; helpers `resetDatabase` / `seedTestData` | **arrives with ticket 04** (first route over the DB) |
| E2E | Playwright against the real local stack (web :3000, api :3001, Mailpit API :8025) | **arrives with ticket 08** (first E2E acceptance criterion) |

Planned hexagonal layout for API domain modules (from the spec — no module exists yet):

```
apps/api/src/modules/<domain>/
├── domain/      # entity types, DomainError, repository contract (interface)
├── infra/       # drizzle-<entity>-repository.ts + in-memory-<entity>-repository.ts
├── use-cases/   # <verb>-<noun>.use-case.ts + co-located <verb>-<noun>.use-case.spec.ts
├── schemas/     # Zod schemas (reusing packages/shared wherever the contract is shared)
└── routes/      # Fastify routes
```

## Coverage

- Coverage tooling is **not installed yet**; the gate starts with the integration work (ticket 04+).
- Planned policy (per spec): minimum 80% lines/functions/statements/branches on business-logic paths — `apps/api/src/modules/**/{use-cases,domain}/**` and `apps/web/src/{components,hooks,lib}/**`. Infrastructure and framework glue are covered by integration/E2E instead, not by the unit gate.
- E2E tests complement unit coverage and are never measured by it.

## Gates (Lefthook)

- **pre-commit:** `biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched && git update-index --again`
- **pre-push:** `pnpm typecheck` then `pnpm test`
- E2E is not in the hooks (manual now, cloud CI out of scope for this study project).
````

- [ ] **Step 2: Verificar conteúdo**

Run:

```bash
rg -in 'kronostore|kronostore_test|test-helpers|Better Auth|better-auth' docs/TESTING.md; echo "EXIT=$?"
rg -c '@ticketvibe' docs/TESTING.md
```

Expected: first command prints nothing, `EXIT=1` (no match); second prints `5` (uma por linha: tabela shared/api + comandos shared/api/worker).

- [ ] **Step 3: Commit**

```bash
git add docs/TESTING.md
git commit -m "docs: rewrite testing guide for ticketvibe"
```

Expected: commit aceito (pre-commit hook roda biome em staged — `--files-ignore-unknown` ignora `.md`; saída tipo `Checked 1 file ... No fixes applied` ou silenciosa).

---

### Task 2: Adapt `docs/skills/TESTING_API_GUIDELINE.md`

**Files:**
- Modify: `docs/skills/TESTING_API_GUIDELINE.md`

- [ ] **Step 1: Renomear o H1 e adicionar banner de status**

Troque a primeira linha:

```markdown
# Unit Testing Guidelines — API (Hexagonal Architecture)
```

por:

```markdown
# Unit Testing Guidelines — API (Hexagonal Architecture) — TICKETVIBE
```

Logo após o parágrafo introdutório (linha 3, que começa "A portable convention…"), insira uma linha em branco e:

```markdown
> **Status (TICKETVIBE):** unit testing is live for `packages/shared` and `apps/api`; the hexagonal module layout and the Drizzle/integration layer arrive with ticket 04 (see [`docs/TESTING.md`](../../TESTING.md)).
```

- [ ] **Step 2: Corrigir a contradição da tabela de nomes**

Na seção `## Naming Conventions`, substitua esta linha da tabela:

```markdown
| Integration test file | `<feature>.spec.ts` in `tests/integration/` | `task-crud.spec.ts` |
```

por:

```markdown
| Integration test file | `<feature>.integration.spec.ts` co-located with the source | `reserve-seat.use-case.integration.spec.ts` |
```

(Isso passa a concordar com a seção "Integration tests — co-located with source" acima, que já diz que não existe diretório central de integração.)

- [ ] **Step 3: Substituir a seção `## Repository Testing`**

Localize a seção inteira (começa em `## Repository Testing` e vai até antes de `## Writing In-Memory Repository Tests`) e substitua por:

```markdown
## Repository Testing

Each repository contract has two implementations: a production Drizzle implementation and an in-memory test double. Both are tested independently — there is no shared contract suite for repository interfaces. The cross-package seam of this project is the Zod contract in `packages/shared`, not a repository test suite.

- **In-memory tests** exercise the in-memory repository directly (fast, no I/O) — **live pattern** as soon as the first module exists.
- **Drizzle tests** hit the local `ticketvibe_test` database directly (integration, requires `pnpm infra:up`).

*(The Drizzle layer does not exist yet — the first hexagonal module arrives with ticket 04. Until then, only unit tests exist: `packages/shared` contract tests and the `apps/api` health route.)*
```

- [ ] **Step 4: Substituir o bloco `## Commands (adapt to your project)`**

Substitua o heading e o bloco de comandos (que hoje cita `@kronostore`) por:

```markdown
## Commands (this project)

```bash
pnpm --filter @ticketvibe/api test           # unit suite (vitest run)
pnpm --filter @ticketvibe/api typecheck      # type checking (tsc --noEmit)
```

There are no `test:watch` or `test:coverage` scripts in this repository — do not document or run them until they are added.
```

- [ ] **Step 5: Ajustar a introdução da `## Coverage Gate`**

Na seção `## Coverage Gate`, substitua a primeira linha:

```markdown
CI should enforce minimum coverage on business logic paths:
```

por:

```markdown
Coverage tooling is not installed yet (it starts with ticket 04+). When it lands, enforce minimum coverage on business logic paths:
```

(O bloco de thresholds seguinte permanece como está.)

- [ ] **Step 6: Preencher a `## Project Overrides`**

Substitua as duas linhas finais ("Record project-specific deviations here…") por:

````markdown
## Project Overrides — TICKETVIBE

- **Test suffix:** `.spec.ts`, co-located with the source (unit and integration alike — there is no `tests/integration/` directory).
- **Commands:** `pnpm --filter @ticketvibe/api test`, `pnpm --filter @ticketvibe/api typecheck`, root `pnpm test` / `pnpm typecheck`. No `test:watch` / `test:coverage` scripts exist — never document them before they are added.
- **Test database:** integration tests use a local `ticketvibe_test` database (Postgres via `pnpm infra:up`); helpers (`resetDatabase`, `seedTestData`) arrive with ticket 04.
- **HTTP test seam:** `buildApp()` in `apps/api/src/app.ts` — tests use Fastify `inject` (see `apps/api/src/app.spec.ts`).
- **Contract seam:** route tests validate payloads against Zod schemas from `packages/shared` (`healthResponseSchema` is the first one).
- **Module layout:** hexagonal `modules/<domain>/{domain,infra,use-cases,schemas,routes}` per spec; first module arrives with ticket 04. Better Auth persistence (tickets 08–09) stays outside the modules.
````

- [ ] **Step 7: Verificar conteúdo**

Run:

```bash
rg -in 'kronostore' docs/skills/TESTING_API_GUIDELINE.md; echo "EXIT=$?"
rg -n 'ticketvibe_test|@ticketvibe/api|TICKETVIBE' docs/skills/TESTING_API_GUIDELINE.md | head
```

Expected: first `EXIT=1` (no match); second prints matches including the new overrides.

- [ ] **Step 8: Commit**

```bash
git add docs/skills/TESTING_API_GUIDELINE.md
git commit -m "docs: adapt api testing guideline to ticketvibe"
```

Expected: commit aceito.

---

### Task 3: Adapt `docs/skills/TESTING_FRONTEND_GUIDELINE.md`

**Files:**
- Modify: `docs/skills/TESTING_FRONTEND_GUIDELINE.md`

- [ ] **Step 1: Renomear o H1 e adicionar banner de status de tooling**

Troque a primeira linha:

```markdown
# Unit & E2E Testing Guidelines — Frontend (React / Next.js)
```

por:

```markdown
# Unit & E2E Testing Guidelines — Frontend (React / Next.js) — TICKETVIBE
```

Logo após o parágrafo introdutório, insira uma linha em branco e:

```markdown
> **Tooling status (TICKETVIBE):** Vitest is installed. React Testing Library, MSW and Playwright are **not installed yet** — they arrive with the first component/E2E tickets (component tests: ticket 04+, E2E: ticket 08+; see [`docs/TESTING.md`](../../TESTING.md)). Sections below describe the conventions to follow when that tooling lands; only the Commands section at the bottom is runnable today.
```

- [ ] **Step 2: Anotar a `## Tech Stack`**

Na lista `## Tech Stack`, troque as duas linhas:

```markdown
- **Network mocking:** MSW v2 (Mock Service Worker) — intercepts `fetch` at the network boundary.
- **E2E framework:** Playwright (`@playwright/test`).
```

por:

```markdown
- **Network mocking:** MSW v2 (Mock Service Worker) — intercepts `fetch` at the network boundary. *(not installed yet)*
- **E2E framework:** Playwright (`@playwright/test`). *(not installed yet)*
```

- [ ] **Step 3: Trocar a árvore de `### Unit/Component tests` para o domínio de eventos**

Substitua a árvore de exemplo (que cita `project-card`, `create-project-form`, `use-projects`) por:

```
src/
├── components/
│   ├── event-card.tsx
│   ├── event-card.spec.tsx           # co-located
│   ├── seat-map.tsx
│   └── seat-map.spec.tsx             # co-located
├── hooks/
│   ├── use-events.ts
│   └── use-events.spec.ts            # co-located
└── lib/
    ├── api-client.ts
    └── api-client.spec.ts            # co-located
```

- [ ] **Step 4: Trocar a árvore de `### E2E tests`**

Substitua a árvore de exemplo (que cita `auth.spec.ts`, `projects.spec.ts`) por:

```
tests/e2e/
├── browse-events.spec.ts
├── seat-selection.spec.ts
└── helpers/
    └── mailpit.ts
```

- [ ] **Step 5: Atualizar a tabela `## Naming Conventions`**

Substitua as linhas de exemplo da tabela:

```markdown
| Component test file | `<component-name>.spec.tsx` co-located | `project-card.spec.tsx` |
| Hook test file | `<hook-name>.spec.ts` co-located | `use-projects.spec.ts` |
| Lib test file | `<lib-name>.spec.ts` co-located | `api-client.spec.ts` |
| E2E test file | `<feature>.spec.ts` in `tests/e2e/` | `projects.spec.ts` |
| Component suite | `describe('<ComponentName />')` | `describe('<ProjectCard />')` |
| Hook suite | `describe('<useHookName>')` | `describe('<useProjects>')` |
| Test title | `it('should [observable behavior]')` | `it('should render the project name')` |
```

por:

```markdown
| Component test file | `<component-name>.spec.tsx` co-located | `event-card.spec.tsx` |
| Hook test file | `<hook-name>.spec.ts` co-located | `use-events.spec.ts` |
| Lib test file | `<lib-name>.spec.ts` co-located | `api-client.spec.ts` |
| E2E test file | `<feature>.spec.ts` in `tests/e2e/` | `browse-events.spec.ts` |
| Component suite | `describe('<ComponentName />')` | `describe('<EventCard />')` |
| Hook suite | `describe('<useHookName>')` | `describe('<useEvents>')` |
| Test title | `it('should [observable behavior]')` | `it('should render the event name')` |
```

- [ ] **Step 6: Substituir o exemplo `## Writing Component Tests`**

Substitua todo o bloco de código principal dessa seção (o `render`/`getByText` com `ProjectCard`, até antes do sub-bloco "Guidance") por:

````tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventCard } from './event-card'

describe('<EventCard />', () => {
	it('should render the event name and venue', () => {
		render(
			<EventCard
				event={{
					id: '1',
					name: 'Show do Alpha',
					venue: 'Auditório Beta',
					startsAt: '2026-11-01T20:00:00-03:00',
					priceFrom: 120,
				}}
			/>,
		)

		expect(screen.getByText('Show do Alpha')).toBeInTheDocument()
		expect(screen.getByText('Auditório Beta')).toBeInTheDocument()
	})

	it('should link to the event detail page', () => {
		render(
			<EventCard
				event={{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: 120 }}
			/>,
		)

		const link = screen.getByRole('link', { name: /Show do Alpha/i })
		expect(link).toHaveAttribute('href', '/event/1')
	})

	it('should hide the price hint when there is no price yet', () => {
		render(
			<EventCard
				event={{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: null }}
			/>,
		)

		expect(screen.queryByText(/a partir de/i)).not.toBeInTheDocument()
	})
})
````

Route shapes in examples are illustrative — real routes land with their tickets (event page: ticket 06; seat map: ticket 10). Keep the "Guidance" bullets below the block unchanged.

- [ ] **Step 7: Trocar o exemplo `## Writing Hook Tests`**

Substitua o bloco `renderHook` que cita `useProjects`/`projects` por:

````tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useEvents } from './use-events'

describe('<useEvents>', () => {
	it('should return empty list initially', () => {
		const { result } = renderHook(() => useEvents())

		expect(result.current.events).toEqual([])
		expect(result.current.isLoading).toBe(true)
	})

	it('should fetch events on mount', async () => {
		// MSW handler returns mock data — see MSW section below
		const { result } = renderHook(() => useEvents())

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})

		expect(result.current.events).toHaveLength(2)
	})
})
````

- [ ] **Step 8: Trocar os exemplos MSW para o domínio de eventos**

Na seção `### Handlers`, substitua o bloco `projectsHandlers` (URLs `organizations/active/projects`) por:

```ts
// src/mocks/handlers/events.ts
import { http, HttpResponse } from 'msw'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const eventsHandlers = [
	http.get(`${API_URL}/events`, () => {
		return HttpResponse.json([
			{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00' },
			{ id: '2', name: 'Peça Gama', venue: 'Teatro Delta', startsAt: '2026-12-05T19:30:00-03:00' },
		])
	}),

	http.get(`${API_URL}/events/:id`, ({ params }) => {
		const event = { id: params.id, name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00' }
		return HttpResponse.json(event)
	}),

	http.get(`${API_URL}/events/:id/availability`, ({ params }) => {
		return HttpResponse.json({ eventId: params.id, seats: [] })
	}),
]
```

Handlers will validate payloads against the Zod schemas in `packages/shared` once those event schemas exist (contract seam — see `docs/TESTING.md`).

- [ ] **Step 9: Trocar o exemplo de servidor por teste e o de estado de erro**

Substitua o bloco `### Server setup per test file` (que cita `create-project-form` e `organizations/active/projects`) por:

```ts
// src/components/event-grid.spec.tsx
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const server = setupServer(
	http.get(`${API_URL}/events`, () => {
		return HttpResponse.json([
			{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00' },
		])
	}),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Substitua o exemplo `### Testing error states` por:

```tsx
it('should show an error message when the API fails', async () => {
	server.use(
		http.get(`${API_URL}/events`, () => {
			return HttpResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
		}),
	)

	render(<EventGrid />)

	expect(await screen.findByText('Não foi possível carregar os eventos')).toBeInTheDocument()
})
```

- [ ] **Step 10: Atualizar os exemplos de acessibilidade**

Na seção `## Accessibility Assertions`, troque:

```markdown
screen.getByRole('heading', { name: 'Projects' })
```

por:

```markdown
screen.getByRole('heading', { name: 'Eventos' })
```

- [ ] **Step 11: Trocar o exemplo E2E**

Substitua o bloco `test('user can create a project', …)` por:

```ts
import { expect, test } from '@playwright/test'

test('buyer can open an event page from the home', async ({ page }) => {
	await page.goto('/')

	await page.getByRole('link', { name: /Show do Alpha/i }).click()

	await expect(page).toHaveURL(/\/event\//)
	await expect(page.getByRole('heading', { name: 'Show do Alpha' })).toBeVisible()
})
```

- [ ] **Step 12: Remover a seção `## Admin Components`**

Delete a seção inteira `## Admin Components` — do heading até a linha imediatamente anterior a `## Coverage Gate`. Não substitua: o backoffice/organizador deste projeto é os tickets 17+; a orientação de teste de guard de papel entra naquele ticket, quando a fonte de sessão existir (tickets 08–09).

- [ ] **Step 13: Ajustar a introdução da `## Coverage Gate`**

Substitua a primeira linha da seção:

```markdown
CI should enforce minimum coverage on component and hook paths:
```

por:

```markdown
Coverage tooling is not installed yet (it starts with the first component tests, ticket 04+). When it lands, enforce minimum coverage on component and hook paths:
```

- [ ] **Step 14: Substituir o bloco `## Commands (adapt to your project)`**

Substitua heading + bloco (que cita `@kronostore`) por:

```markdown
## Commands (this project)

```bash
pnpm test                 # unit suite today = shared + api (apps/web has no test script yet)
pnpm typecheck            # all packages (turbo; builds web first to generate .next/types)
pnpm lint                 # biome (covers apps/web via its nested config)
```

There are no `test:watch`, `test:coverage` or `test:e2e` scripts in this repository — do not document or run them until they are added.
```

- [ ] **Step 15: Substituir o `## Full Worked Example`**

Substitua as duas seções `Component (components/project-card.tsx)` e `Test (components/project-card.spec.tsx)` (todo o exemplo completo, até antes de `## Project Overrides`) por:

````markdown
## Full Worked Example

Component (`components/event-card.tsx`):

```tsx
import Link from 'next/link'

interface Event {
	id: string
	name: string
	venue: string
	startsAt: string
	priceFrom: number | null
}

export function EventCard({ event }: { event: Event }) {
	return (
		<Link
			href={`/event/${event.id}`}
			className="block rounded-lg border p-4 hover:bg-muted"
		>
			<h3 className="font-medium">{event.name}</h3>
			<p className="mt-1 text-sm text-muted-foreground">{event.venue}</p>
			{event.priceFrom !== null ? (
				<p className="mt-1 text-sm">A partir de R$ {event.priceFrom}</p>
			) : null}
		</Link>
	)
}
```

Test (`components/event-card.spec.tsx` — co-located):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventCard } from './event-card'

describe('<EventCard />', () => {
	it('should render the event name', () => {
		render(
			<EventCard
				event={{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: 120 }}
			/>,
		)
		expect(screen.getByText('Show do Alpha')).toBeInTheDocument()
	})

	it('should link to the event detail page', () => {
		render(
			<EventCard
				event={{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: 120 }}
			/>,
		)
		expect(screen.getByRole('link', { name: /Show do Alpha/ })).toHaveAttribute('href', '/event/1')
	})
})
```
````

- [ ] **Step 16: Preencher a `## Project Overrides`**

Substitua as duas linhas finais ("Record project-specific deviations here…") por:

````markdown
## Project Overrides — TICKETVIBE

- **Test suffix:** `.spec.ts` / `.spec.tsx`, co-located with the source; E2E centralized in `tests/e2e/`.
- **Commands:** root `pnpm test`, `pnpm typecheck`, `pnpm lint`. `apps/web` has **no `test` script** until RTL + MSW land — never document `test:watch` / `test:coverage` / `test:e2e` before those scripts exist.
- **Tooling status:** Vitest ✅ (installed) · RTL + MSW ⏳ first component test (ticket 04+) · Playwright ⏳ first E2E (ticket 08+).
- **Routes in examples are illustrative** (`/event/1`); real routes arrive with their tickets (event page: ticket 06, seat map: ticket 10, backoffice: tickets 17+).
- **Auth/session mocking** (organizer guards, etc.) is deferred until tickets 08–09 define the session source; backoffice guard guidance is added by ticket 17.
- **MSW handlers** will validate payloads against the Zod schemas in `packages/shared` — that is the web↔api contract seam.
````

- [ ] **Step 17: Verificar conteúdo**

Run:

```bash
rg -in 'kronostore|kronostore_test|organizations/active|/app/projects|ProjectCard|use-projects|AdminOrdersPage|auth-store' docs/skills/TESTING_FRONTEND_GUIDELINE.md; echo "EXIT=$?"
rg -c 'EventCard|use-events|event-card' docs/skills/TESTING_FRONTEND_GUIDELINE.md
```

Expected: first `EXIT=1` (nenhuma referência antiga/domínio antigo); second prints a count ≥ 8.

- [ ] **Step 18: Commit**

```bash
git add docs/skills/TESTING_FRONTEND_GUIDELINE.md
git commit -m "docs: adapt frontend testing guideline to ticketvibe"
```

Expected: commit aceito.

---

### Task 4: Review `docs/skills/COMMIT_GUIDELINE.md`

**Files:**
- Modify: `docs/skills/COMMIT_GUIDELINE.md`

- [ ] **Step 1: Renomear o H1 para nomear o projeto**

Troque a primeira linha:

```markdown
# Skill: Professional Git Commits (English)
```

por:

```markdown
# Skill: Professional Git Commits (English) — TICKETVIBE
```

- [ ] **Step 2: Verificar que não há mais nada legado e que o conteúdo é verdadeiro**

Run:

```bash
rg -in 'kronostore|projeto anterior|previous project' docs/skills/COMMIT_GUIDELINE.md; echo "EXIT=$?"
git log --oneline -5 | cat
```

Expected: `EXIT=1` (sem correspondência); os commits exibidos seguem o formato documentado no arquivo (Conventional Commits, inglês, imperativo, sem ponto final).

- [ ] **Step 3: Commit**

```bash
git add docs/skills/COMMIT_GUIDELINE.md
git commit -m "docs: name ticketvibe in commit guideline"
```

Expected: commit aceito.

---

### Task 5: Create root `README.md` (follow-up do review final do ticket 01)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Escrever o README**

Crie `README.md` na raiz exatamente com isto:

````markdown
# TICKETVIBE

Marketplace de ingressos para eventos — projeto de estudo. Tudo roda local; sem deploy de produção.

## Requisitos

- Node `>= 22.12` e pnpm 10 (via `corepack enable`)
- Podman 6+ com provider de compose (`podman compose` funcional)

## Quickstart

```bash
pnpm install
pnpm infra:up     # Postgres, Redis, Mailpit (apenas 127.0.0.1)
pnpm dev          # web :3000 · api :3001 · worker BullMQ
```

Smoke test (com `pnpm dev` rodando):

```bash
curl -s http://127.0.0.1:3001/health                            # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000  # 200
```

Worker (com infra de pé):

```bash
timeout 10 pnpm --filter @ticketvibe/worker dev
```

Esperado: `[worker] listening for heartbeat jobs` e `[worker] job processed: N` (exit `124` do `timeout`).

## Scripts (raiz)

| Script | O que faz |
|---|---|
| `pnpm dev` | turbo dev — web, api e worker em paralelo |
| `pnpm build` | build de produção (web; os demais pacotes não têm `build`) |
| `pnpm typecheck` | tsc de todos os pacotes (builda o web antes para gerar `.next/types`) |
| `pnpm test` | testes unitários (vitest: shared + api) |
| `pnpm lint` / `pnpm format` | biome check / biome check --write |
| `pnpm infra:up` | sobe Postgres, Redis e Mailpit |
| `pnpm infra:down` | derruba os containers **e apaga os volumes** |

## Portas (todas em 127.0.0.1)

| Porta | Serviço |
|---|---|
| 3000 | web (Next.js) |
| 3001 | api (Fastify) |
| 5432 | Postgres 16 |
| 6379 | Redis 7 |
| 1025 / 8025 | Mailpit SMTP / UI |

## Variáveis de ambiente

Nenhuma é obrigatória. Opcionais:

| Var | Padrão | Usada por |
|---|---|---|
| `PORT` | `3001` | api (`apps/api/src/index.ts`) |
| `REDIS_URL` | `redis://localhost:6379` | worker (`apps/worker/src/index.ts`) |

`.env*` é ignorado pelo git; `.env.example` é permitido (exceção no `.gitignore`).

## Estrutura

```
apps/web          Next.js 16 + Tailwind (pt-BR, BRL)
apps/api          Fastify 5 — rota /health valida o contrato do shared
apps/worker       BullMQ (fila heartbeat) contra o Redis local
packages/shared   contrato Zod — fonte única web↔api
compose.yaml      Postgres · Redis · Mailpit
lefthook.yml      pre-commit: biome · pre-push: typecheck + test
```

## Documentação

- [`docs/TESTING.md`](docs/TESTING.md) — como testamos: comandos reais, o que existe hoje e o que vem por ticket
- [`docs/skills/`](docs/skills/) — diretrizes portáteis: API, frontend, commits
- [`docs/agents/`](docs/agents/) — como agents navegam issues e domínio
- [`.scratch/ticketvibe/spec.md`](.scratch/ticketvibe/spec.md) — spec do produto; [`issues/`](.scratch/ticketvibe/issues/) — tickets
````

- [ ] **Step 2: Verificar links e ausência de resquícios**

Run:

```bash
rg -in 'kronostore' README.md; echo "EXIT=$?"
test -f docs/TESTING.md && test -d docs/skills && test -d docs/agents && test -f .scratch/ticketvibe/spec.md && test -d .scratch/ticketvibe/issues && echo "LINKS_OK"
```

Expected: `EXIT=1`; `LINKS_OK`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add repository readme"
```

Expected: commit aceito.

---

### Task 6: Sweep final de referências legadas + link morto

**Files:**
- Modify: `docs/agents/issue-tracker.md:10`

- [ ] **Step 1: Remover a referência morta a `triage-labels.md`**

Na linha 10 de `docs/agents/issue-tracker.md`, troque:

```markdown
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
```

por:

```markdown
- Triage state is recorded as a `Status:` line near the top of each issue file
```

(motivo: o skill `triage` não está instalado neste ambiente — `triage-labels.md` nunca foi criado; o link conduzia agents a um arquivo inexistente.)

- [ ] **Step 2: Sweep de asserção em TODO o material de docs**

Run:

```bash
rg -in 'kronostore|@kronostore|kronostore_test|organizations/active|/app/projects|ProjectCard|AdminOrdersPage|auth-store|triage-labels' docs/ AGENTS.md README.md -g '!docs/superpowers/plans/**'; echo "EXIT=$?"
```

Expected: `EXIT=1` — zero correspondências em `docs/`, `AGENTS.md` e `README.md`. (O glob exclui `docs/superpowers/plans/` porque estes planos citam os padrões de busca por depósito — o próprio ticket 01 e este ticket 02.)

- [ ] **Step 3: Confirmar que o restante de `docs/` é deste projeto**

Run:

```bash
rg -il 'ticketvibe|@ticketvibe' docs/ | sort
```

Expected: ao menos `docs/TESTING.md`, as duas guidelines e `docs/skills/COMMIT_GUIDELINE.md` na lista (os arquivos em `docs/agents/` e `docs/layout/` são genéricos/assets — não precisam citar o nome).

- [ ] **Step 4: Commit**

```bash
git add docs/agents/issue-tracker.md
git commit -m "docs: drop dangling triage-labels reference"
```

Expected: commit aceito.

---

### Task 7: Executar todo comando documentado + marcar aceitação

**Files:**
- Modify: `.scratch/ticketvibe/spec.md:135`
- Modify: `.scratch/ticketvibe/issues/02-adaptar-docs-legados-ao-novo-projeto.md`

- [ ] **Step 1: Matriz de comandos documentados — gates**

Run (raiz):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format
```

Expected: todos exit 0; `pnpm format` → `No fixes applied` (árvore permanece limpa); typecheck/tasks verdes (turbo cache ok).

- [ ] **Step 2: Comandos por pacote documentados**

Run:

```bash
pnpm --filter @ticketvibe/shared test
pnpm --filter @ticketvibe/api test
pnpm --filter @ticketvibe/api typecheck
```

Expected: exit 0; shared `Tests 2 passed`; api `Tests 1 passed`.

- [ ] **Step 3: Worker documentado**

Run:

```bash
timeout 10 pnpm --filter @ticketvibe/worker dev; echo "EXIT=$?"
```

Expected: `[worker] listening for heartbeat jobs` + `[worker] job processed: N`; `EXIT=124`. Depois confirme sem strays: `pgrep -f 'tsx src/index.ts'` → sem processos (matar se houver).

- [ ] **Step 4: Ciclo de infra documentado**

Run:

```bash
pnpm infra:down
pnpm infra:up
podman exec ticketvibe-postgres pg_isready -U ticketvibe
podman exec ticketvibe-redis redis-cli ping
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8025
```

Expected: `accepting connections`; `PONG`; `200`. (O `down` apaga o volume local — dados apenas de heartbeat, descartáveis; o `up` recria.)

- [ ] **Step 5: Quickstart do README (instalar + dev + smoke)**

Run:

```bash
pnpm install
```

Expected: exit 0 (lockfile atual — `Lockfile is up to date`).

```bash
pnpm dev > /tmp/t02-dev.log 2>&1 &
DEV_PID=$!
sleep 10
curl -s http://127.0.0.1:3001/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
kill $DEV_PID 2>/dev/null
sleep 2
pkill -f 'turbo dev' 2>/dev/null
pkill -f 'next dev' 2>/dev/null
pkill -f 'tsx watch' 2>/dev/null
pkill -f 'tsx src/index.ts' 2>/dev/null
sleep 1
ss -tln | grep -E ':(3000|3001)' || echo PORTS_FREE
```

Expected: `{"status":"ok"}` e `200`; depois `PORTS_FREE` (nenhum dev server ou worker sobrando).

- [ ] **Step 6: Árvore limpa antes de marcar**

```bash
git status --porcelain
```

Expected: vazio.

- [ ] **Step 7: Marcar os critérios do ticket**

Em `.scratch/ticketvibe/issues/02-adaptar-docs-legados-ao-novo-projeto.md`:

1. Troque `**Status:** ready-for-agent` por `**Status:** done`.
2. Troque os quatro `- [ ]` por `- [x]` (todos foram verificados: `docs/TESTING.md` reescrito com pacotes/comandos/caminhos reais; guidelines revisadas e nomeadas por projeto; sweep Step 2 do Task 6 sem correspondências; matriz de comandos Steps 1–5 verde).

- [ ] **Step 8: Fechar a pendência na spec**

Na linha 135 de `.scratch/ticketvibe/spec.md`, troque:

```markdown
- **Pendência conhecida**: os documentos legados do projeto anterior em `docs/` (`TESTING.md`, `skills/*`) ainda citam o projeto antigo (`kronostore`) — precisam ser adaptados a este projeto; idealmente vira um dos primeiros tickets.
```

por:

```markdown
- **Pendência encerrada (ticket 02, 2026-10-07)**: `docs/TESTING.md` e `docs/skills/*` foram adaptados ao TICKETVIBE; sweep com `rg` confirma zero referências ao projeto anterior (`kronostore`).
```

- [ ] **Step 9: Commit final**

```bash
git add .scratch/ticketvibe/issues/02-adaptar-docs-legados-ao-novo-projeto.md .scratch/ticketvibe/spec.md
git commit -m "docs: mark ticket 02 acceptance and close spec pendency"
```

Expected: commit aceito; `git status --porcelain` vazio ao final.

---

## Self-Review

**Spec/coverage (critérios do ticket 02):**
- `docs/TESTING.md` atualizado (pacotes, comandos, caminhos, estrutura) → Task 1 (reescrita completa, comandos reais do pós-ticket-01)
- Diretrizes em `docs/skills/` revisadas e renomeadas conforme este projeto → Tasks 2–4 (H1 com `— TICKETVIBE`, conteúdo/comandos/exemplos do domínio e pacotes atuais, Project Overrides preenchidos)
- Nenhuma referência restante ao projeto anterior → Tasks 1–6 (remoção direta + sweep `rg` com asserção `EXIT=1`)
- Comandos documentados executados e funcionando → verificação embutida por task + matriz completa no Task 7 (inclui ciclo `infra:down`→`up` e `pnpm dev` com cleanup de strays)
- Follow-up do review final do ticket 01 (README/runbook) → Task 5 (sinalizada no header; removível)

**Placeholder scan:** nenhum TBD/TODO/"adicionar depois" no plano — todos os passos de edição trazem o conteúdo completo ou o texto exato de substituição; marcadores de roadmap nos docs ("arrives with ticket 04") são referências factuais a tickets existentes, não lacoras do ticket 02.

**Type consistency:** `@ticketvibe/{shared,api,web,worker}` idênticos em todos os blocos; caminhos `apps/api/src/app.ts` (`buildApp`), `apps/worker/src/index.ts`, `packages/shared/src/index.ts` conferem com o repo; portas 3000/3001/5432/6379/1025/8025 conferem com `compose.yaml` e código; comandos `pnpm --filter …` batem com os scripts reais de cada `package.json` (nenhum `test:watch`/`test:e2e` documentado como executável).
