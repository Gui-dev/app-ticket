# Unit & E2E Testing Guidelines — Frontend (React / Next.js) — TICKETVIBE

A portable convention for unit-testing React components and hooks with Vitest, React Testing Library, and MSW v2, plus E2E testing with Playwright. Copy this file into any React/Next.js application and adapt the sections marked TICKETVIBE (the tooling banner and Project Overrides) to that project.

> **Tooling status (TICKETVIBE):** Vitest is installed (in `packages/shared` and `apps/api` — `apps/web` gets it with its test script). React Testing Library, MSW and Playwright are **not installed yet** — they arrive with the first component/E2E tickets (component tests: ticket 04+, E2E: ticket 05+; see [`docs/TESTING.md`](../TESTING.md)). Sections below describe the conventions to follow when that tooling lands; only the `## Commands (this project)` section lists project commands runnable today.

## Tech Stack

- **Unit/Component framework:** Vitest (works with Jest — swap `vitest` imports for `jest`).
- **Component rendering:** React Testing Library (`@testing-library/react`). *(not installed yet)*
- **User interactions:** `@testing-library/user-event` (preferred over `fireEvent`). *(not installed yet)*
- **Network mocking:** MSW v2 (Mock Service Worker) — intercepts `fetch` at the network boundary. *(not installed yet)*
- **E2E framework:** Playwright (`@playwright/test`). *(not installed yet)*
- **Matchers:** `@testing-library/jest-dom` (DOM assertions like `toBeInTheDocument`). *(not installed yet)*

## Principles

1. **Test user behavior, not implementation.** Assert what the user sees and does — never internal state, private methods, or component structure.
2. **Accessible queries first.** Prefer `getByRole`, `getByLabelText`, `getByText`. Use `getByTestId` only as a last resort.
3. **Mock at the network boundary.** MSW intercepts HTTP requests — components make real `fetch` calls, and tests control the responses. No `vi.mock('fetch')` or manual fetch mocking.
4. **Co-locate tests with source.** Every `.spec.tsx` / `.spec.ts` lives next to the file it tests. E2E tests are the exception — they stay centralized.
5. **Deterministic.** Same input → same output. No real networks, no real timers, no flaky waits.

## Test File Placement

### Unit/Component tests — co-located with source

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

Why co-location: test-to-source mapping is obvious; refactors move both files together; no guessing where tests live.

### E2E tests — centralized

Playwright tests stay in `tests/e2e/` because they are cross-cutting (full pages, multiple modules, real browser):

```
tests/e2e/
├── browse-events.spec.ts
├── seat-selection.spec.ts
└── helpers/
    └── mailpit.ts
```

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Component test file | `<component-name>.spec.tsx` co-located | `event-card.spec.tsx` |
| Hook test file | `<hook-name>.spec.ts` co-located | `use-events.spec.ts` |
| Lib test file | `<lib-name>.spec.ts` co-located | `api-client.spec.ts` |
| E2E test file | `<feature>.spec.ts` in `tests/e2e/` | `browse-events.spec.ts` |
| Component suite | `describe('<ComponentName />')` | `describe('<EventCard />')` |
| Hook suite | `describe('<useHookName>')` | `describe('<useEvents>')` |
| Test title | `it('should [observable behavior]')` | `it('should render the event name')` |

## Writing Component Tests

Standard pattern — render, interact, assert:

```tsx
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
```

Guidance:

- **Render once per test.** Each `it` gets a fresh `render()` call — no shared state between tests.
- **User interactions:** use `userEvent` (not `fireEvent`) for realistic behavior:

```tsx
const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: 'Submit' }))
await user.type(screen.getByLabelText('Name'), 'Show do Alpha')
```

- **Async operations:** use `waitFor` or `screen.findBy*` (async query) — never fixed timeouts:

```tsx
// Preferred — waits for the element to appear
expect(await screen.findByText('Show do Alpha')).toBeInTheDocument()

// Also valid — explicit wait
await waitFor(() => {
  expect(screen.getByText('Show do Alpha')).toBeInTheDocument()
})
```

- **Mocking children:** only when a child is expensive or has side effects. Prefer rendering the real component.

## Writing Hook Tests

Use `renderHook` from `@testing-library/react`:

```tsx
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
```

## Mocking with MSW v2

MSW intercepts HTTP requests at the network boundary. Components make real `fetch` calls; MSW returns controlled responses.

### Setup

```bash
pnpm add -D msw
npx msw init public/ --save   # creates service-worker.js in public/
```

### Handlers

Define handlers per feature (or a shared file for global handlers):

```ts
// src/mocks/handlers/events.ts
import { http, HttpResponse } from 'msw'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const eventsHandlers = [
	http.get(`${API_URL}/events`, () => {
		return HttpResponse.json([
			{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: 120 },
			{ id: '2', name: 'Peça Gama', venue: 'Teatro Delta', startsAt: '2026-12-05T19:30:00-03:00', priceFrom: 90 },
		])
	}),

	http.get(`${API_URL}/events/:id`, ({ params }) => {
		const event = { id: params.id, name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: 120 }
		return HttpResponse.json(event)
	}),

	http.get(`${API_URL}/events/:id/availability`, ({ params }) => {
		return HttpResponse.json({ eventId: params.id, seats: [] })
	}),
]
```

Handlers will validate payloads against the Zod schemas in `packages/shared` once those event schemas exist (contract seam — see `docs/TESTING.md`).

### Server setup per test file

```ts
// src/components/event-grid.spec.tsx
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const server = setupServer(
	http.get(`${API_URL}/events`, () => {
		return HttpResponse.json([
			{ id: '1', name: 'Show do Alpha', venue: 'Auditório Beta', startsAt: '2026-11-01T20:00:00-03:00', priceFrom: 120 },
		])
	}),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Key MSW v2 API:

| v2 API | Purpose |
|---|---|
| `http.get(url, resolver)` | Intercept GET requests |
| `http.post(url, resolver)` | Intercept POST requests |
| `HttpResponse.json(data, init)` | Return JSON response |
| `request.json()` | Parse request body |
| `server.use(handler)` | Override handler per test (error responses, edge cases) |
| `server.resetHandlers()` | Restore original handlers after each test |

### Testing error states

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

## Accessibility Assertions

Always prefer accessible queries and assertions:

```tsx
// Good — queries by role (accessible)
screen.getByRole('button', { name: 'Submit' })
screen.getByRole('heading', { name: 'Eventos' })
screen.getByRole('link', { name: /Alpha/ })

// Good — queries by label (accessible)
screen.getByLabelText('Name')

// Acceptable — queries by text
screen.getByText('Nenhum evento encontrado')

// Last resort — testId (not accessible, avoid)
screen.getByTestId('event-card')
```

Assert ARIA attributes and roles:

```tsx
expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
expect(screen.getByRole('alert')).toHaveTextContent('Error occurred')
```

## Recommended Case Checklist

### Components

1. **Renders correctly** with default/required props.
2. **Handles user interactions** — click, type, submit, keyboard navigation.
3. **Shows all states** — loading, empty, error, success.
4. **Calls API correctly** — verified via MSW request handlers.
5. **Accessible** — queries by role/label, ARIA attributes correct.
6. **Edge cases** — empty lists, missing optional props, long text truncation.

### Hooks

1. **Returns expected initial state.**
2. **Updates state on action** (mutate, refetch, etc.).
3. **Handles async operations** — loading → success/error transitions.
4. **Cleans up on unmount** (abort controllers, subscriptions).

### E2E (Playwright)

1. **Critical user journeys** — sign in, create resource, complete workflow.
2. **Cross-browser** (optional) — Chromium, Firefox, WebKit.
3. **Isolated** — each test creates its own data (unique emails, etc.).
4. **No flaky waits** — use `waitForURL`, `toBeVisible`, `toHaveURL` instead of `setTimeout`.

## Anti-Patterns (do not do this)

- ❌ Testing implementation details — internal state, function names, private props.
- ❌ Mocking component children instead of rendering them (unless they are truly expensive).
- ❌ Using `getByTestId` when `getByRole` or `getByLabelText` works.
- ❌ `waitFor` with fixed timeouts — use DOM-based detection.
- ❌ Testing framework/library internals.
- ❌ Shared mutable state between tests — every test stands alone.
- ❌ `fireEvent` — use `userEvent` for realistic interactions.
- ❌ Mocking `fetch` globally — use MSW at the network boundary.
- ❌ Asserting on CSS class names — assert on visible behavior.

## E2E Testing (Playwright)

### Configuration

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 60_000,
	forbidOnly: true,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
})
```

### Writing E2E Tests

```ts
import { expect, test } from '@playwright/test'

test('buyer can open an event page from the home', async ({ page }) => {
	await page.goto('/')

	await page.getByRole('link', { name: /Show do Alpha/i }).click()

	await expect(page).toHaveURL(/\/event\//)
	await expect(page.getByRole('heading', { name: 'Show do Alpha' })).toBeVisible()
})
```

### E2E Best Practices

- **Locators:** `getByRole` > `getByText` > `getByLabel` > CSS selectors.
- **Assertions:** `expect(locator).toBeVisible()`, `toHaveURL()`, `toHaveText()`.
- **Navigation:** `page.waitForURL('**/path')` after actions that navigate.
- **Unique data:** generate unique emails/Names with `Date.now()` + random suffix.
- **Helpers:** extract reusable logic (email polling, auth setup) into `tests/e2e/helpers/`.

## Coverage Gate

Coverage tooling is not installed yet (it starts with the first component tests, ticket 04+). When it lands, enforce minimum coverage on component and hook paths:

```
thresholds:
  lines: 80
  functions: 80
  statements: 80
  branches: 80
  paths:
    - src/components/**
    - src/hooks/**
    - src/lib/**
```

E2E tests cover critical journeys but are not measured by coverage tools — they complement unit coverage.

## Definition of Done (for a component)

- [ ] Component test co-located with the source file.
- [ ] Tests cover: render, interactions, loading/error/success states, API calls (via MSW).
- [ ] Accessible queries used (getByRole, getByLabelText).
- [ ] No implementation details tested.
- [ ] All previously passing tests still pass.
- [ ] Coverage gate passes on component/hook/lib paths.

## Commands (this project)

```bash
pnpm test                 # unit suite today = shared + api (apps/web has no test script yet)
pnpm typecheck            # all packages (turbo; builds web first to generate .next/types)
pnpm lint                 # biome (covers apps/web via its nested config)
```

There are no `test:watch`, `test:coverage` or `test:e2e` scripts in this repository — do not document or run them until they are added.

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

## Project Overrides — TICKETVIBE

- **Test suffix:** `.spec.ts` / `.spec.tsx`, co-located with the source; E2E centralized in `tests/e2e/`.
- **Commands:** root `pnpm test`, `pnpm typecheck`, `pnpm lint`. `apps/web` has **no `test` script** until RTL + MSW land — never document `test:watch` / `test:coverage` / `test:e2e` before those scripts exist.
- **Tooling status:** Vitest ✅ (installed) · RTL + MSW ⏳ first component test (ticket 04+) · Playwright ⏳ first E2E (ticket 05+).
- **Routes in examples are illustrative** (`/event/1`); real routes arrive with their tickets (event page: ticket 06, seat map: ticket 10, backoffice: tickets 17+).
- **Auth/session mocking** (organizer guards, etc.) is deferred until tickets 08–09 define the session source; backoffice guard guidance is added by ticket 17.
- **MSW handlers** will validate payloads against the Zod schemas in `packages/shared` — that is the web↔api contract seam.
