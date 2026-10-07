# Unit & E2E Testing Guidelines — Frontend (React / Next.js)

A portable convention for unit-testing React components and hooks with Vitest, React Testing Library, and MSW v2, plus E2E testing with Playwright. Copy this file into any React/Next.js application and adapt only the "Project Overrides" section at the bottom.

## Tech Stack

- **Unit/Component framework:** Vitest (works with Jest — swap `vitest` imports for `jest`).
- **Component rendering:** React Testing Library (`@testing-library/react`).
- **User interactions:** `@testing-library/user-event` (preferred over `fireEvent`).
- **Network mocking:** MSW v2 (Mock Service Worker) — intercepts `fetch` at the network boundary.
- **E2E framework:** Playwright (`@playwright/test`).
- **Matchers:** `@testing-library/jest-dom` (DOM assertions like `toBeInTheDocument`).

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
│   ├── project-card.tsx
│   ├── project-card.spec.tsx          # co-located
│   ├── create-project-form.tsx
│   └── create-project-form.spec.tsx   # co-located
├── hooks/
│   ├── use-projects.ts
│   └── use-projects.spec.ts           # co-located
└── lib/
    ├── api-client.ts
    └── api-client.spec.ts             # co-located
```

Why co-location: test-to-source mapping is obvious; refactors move both files together; no guessing where tests live.

### E2E tests — centralized

Playwright tests stay in `tests/e2e/` because they are cross-cutting (full pages, multiple modules, real browser):

```
tests/e2e/
├── auth.spec.ts
├── projects.spec.ts
└── helpers/
    └── mailpit.ts
```

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Component test file | `<component-name>.spec.tsx` co-located | `project-card.spec.tsx` |
| Hook test file | `<hook-name>.spec.ts` co-located | `use-projects.spec.ts` |
| Lib test file | `<lib-name>.spec.ts` co-located | `api-client.spec.ts` |
| E2E test file | `<feature>.spec.ts` in `tests/e2e/` | `projects.spec.ts` |
| Component suite | `describe('<ComponentName />')` | `describe('<ProjectCard />')` |
| Hook suite | `describe('<useHookName>')` | `describe('<useProjects>')` |
| Test title | `it('should [observable behavior]')` | `it('should render the project name')` |

## Writing Component Tests

Standard pattern — render, interact, assert:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProjectCard } from './project-card'

describe('<ProjectCard />', () => {
	it('should render the project name and description', () => {
		render(
			<ProjectCard
				project={{
					id: '1',
					name: 'Alpha',
					description: 'First project',
					createdAt: '2026-01-01T00:00:00Z',
				}}
			/>,
		)

		expect(screen.getByText('Alpha')).toBeInTheDocument()
		expect(screen.getByText('First project')).toBeInTheDocument()
	})

	it('should link to the project detail page', () => {
		render(
			<ProjectCard
				project={{ id: '1', name: 'Alpha', description: null, createdAt: '2026-01-01T00:00:00Z' }}
			/>,
		)

		const link = screen.getByRole('link', { name: /Alpha/i })
		expect(link).toHaveAttribute('href', '/app/projects/1')
	})

	it('should handle missing description gracefully', () => {
		render(
			<ProjectCard
				project={{ id: '1', name: 'Alpha', description: null, createdAt: '2026-01-01T00:00:00Z' }}
			/>,
		)

		expect(screen.getByText('Alpha')).toBeInTheDocument()
		expect(screen.queryByText(/description/i)).not.toBeInTheDocument()
	})
})
```

Guidance:

- **Render once per test.** Each `it` gets a fresh `render()` call — no shared state between tests.
- **User interactions:** use `userEvent` (not `fireEvent`) for realistic behavior:

```tsx
const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: 'Submit' }))
await user.type(screen.getByLabelText('Name'), 'My Project')
```

- **Async operations:** use `waitFor` or `screen.findBy*` (async query) — never fixed timeouts:

```tsx
// Preferred — waits for the element to appear
expect(await screen.findByText('Project created')).toBeInTheDocument()

// Also valid — explicit wait
await waitFor(() => {
  expect(screen.getByText('Project created')).toBeInTheDocument()
})
```

- **Mocking children:** only when a child is expensive or has side effects. Prefer rendering the real component.

## Writing Hook Tests

Use `renderHook` from `@testing-library/react`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useProjects } from './use-projects'

describe('<useProjects>', () => {
	it('should return empty list initially', () => {
		const { result } = renderHook(() => useProjects())

		expect(result.current.projects).toEqual([])
		expect(result.current.isLoading).toBe(true)
	})

	it('should fetch projects on mount', async () => {
		// MSW handler returns mock data — see MSW section below
		const { result } = renderHook(() => useProjects())

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})

		expect(result.current.projects).toHaveLength(2)
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
// src/mocks/handlers/projects.ts
import { http, HttpResponse } from 'msw'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const projectsHandlers = [
	http.get(`${API_URL}/organizations/active/projects`, () => {
		return HttpResponse.json([
			{ id: '1', name: 'Alpha', description: 'First', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
			{ id: '2', name: 'Beta', description: 'Second', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
		])
	}),

	http.get(`${API_URL}/organizations/active/projects/:id`, ({ params }) => {
		const project = { id: params.id, name: 'Alpha', description: 'First', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
		return HttpResponse.json(project)
	}),

	http.post(`${API_URL}/organizations/active/projects`, async ({ request }) => {
		const body = await request.json() as { name: string; description?: string }
		return HttpResponse.json(
			{ id: '3', ...body, description: body.description ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
			{ status: 201 },
		)
	}),
]
```

### Server setup per test file

```ts
// src/components/create-project-form.spec.tsx
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const server = setupServer(
	http.post(`${API_URL}/organizations/active/projects`, async ({ request }) => {
		const body = await request.json() as { name: string }
		return HttpResponse.json({ id: 'new', ...body, description: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { status: 201 })
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
it('should show error message when API fails', async () => {
	server.use(
		http.post(`${API_URL}/organizations/active/projects`, () => {
			return HttpResponse.json({ error: 'VALIDATION_ERROR', message: 'Name is required' }, { status: 400 })
		}),
	)

	render(<CreateProjectForm />)

	await user.click(screen.getByRole('button', { name: 'Create' }))

	expect(await screen.findByText('Name is required')).toBeInTheDocument()
})
```

## Accessibility Assertions

Always prefer accessible queries and assertions:

```tsx
// Good — queries by role (accessible)
screen.getByRole('button', { name: 'Submit' })
screen.getByRole('heading', { name: 'Projects' })
screen.getByRole('link', { name: /Alpha/ })

// Good — queries by label (accessible)
screen.getByLabelText('Name')

// Acceptable — queries by text
screen.getByText('No projects yet')

// Last resort — testId (not accessible, avoid)
screen.getByTestId('project-card')
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

test('user can create a project', async ({ page }) => {
	await page.goto('/app/projects')

	// Open create dialog
	await page.getByRole('button', { name: 'New Project' }).click()

	// Fill form
	await page.getByLabel('Name').fill('My Project')
	await page.getByLabel('Description').fill('A test project')

	// Submit
	await page.getByRole('button', { name: 'Create' }).click()

	// Assert project appears in list
	await expect(page.getByText('My Project')).toBeVisible()
})
```

### E2E Best Practices

- **Locators:** `getByRole` > `getByText` > `getByLabel` > CSS selectors.
- **Assertions:** `expect(locator).toBeVisible()`, `toHaveURL()`, `toHaveText()`.
- **Navigation:** `page.waitForURL('**/path')` after actions that navigate.
- **Unique data:** generate unique emails/Names with `Date.now()` + random suffix.
- **Helpers:** extract reusable logic (email polling, auth setup) into `tests/e2e/helpers/`.

## Admin Components

Admin components follow the same patterns as other components. Key testing considerations:

### Mocking Auth Store for Admin Users

Admin pages require authentication with admin role. Mock the auth store to provide an admin user:

```tsx
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } | null; isAuthenticated: boolean }) => unknown) =>
    selector({ user: { role: "admin" }, isAuthenticated: true }),
}));
```

For non-admin user tests:

```tsx
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } | null; isAuthenticated: boolean }) => unknown) =>
    selector({ user: { role: "customer" }, isAuthenticated: true }),
}));
```

### Testing Auth Guard Behavior

Admin pages should redirect non-admin users to `/login`. Test this by mocking the auth store with a non-admin user and verifying the redirect:

```tsx
it("redirects non-admin users to login", async () => {
  const push = vi.fn();
  vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
  }));

  render(<AdminPage />);
  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/login");
  });
});
```

### Testing CRUD Operations

Admin pages typically perform CRUD operations. Use MSW to mock API responses:

```tsx
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";

// Override handler for specific test
server.use(
  http.get("*/admin/orders", () => {
    return HttpResponse.json([mockOrder]);
  }),
);
```

### Example Admin Test Pattern

Here's a complete example of testing an admin orders list page:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminOrdersPage } from "./page";

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } | null; isAuthenticated: boolean }) => unknown) =>
    selector({ user: { role: "admin" }, isAuthenticated: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("AdminOrdersPage", () => {
  it("renders orders table for admin users", async () => {
    render(<AdminOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("Pedidos")).toBeDefined();
    });

    expect(screen.getByText("Todos os Pedidos")).toBeDefined();
  });
});
```

## Coverage Gate

CI should enforce minimum coverage on component and hook paths:

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

## Commands (adapt to your project)

```bash
pnpm --filter @kronostore/web test           # vitest run (unit tests)
pnpm --filter @kronostore/web typecheck      # type checking
pnpm --filter @kronostore/web test:watch     # vitest watch
pnpm --filter @kronostore/web test:coverage  # coverage report
pnpm --filter @kronostore/web test:e2e       # playwright test
```

## Full Worked Example

Component (`components/project-card.tsx`):

```tsx
import Link from 'next/link'

interface Project {
	id: string
	name: string
	description: string | null
	createdAt: string
}

export function ProjectCard({ project }: { project: Project }) {
	return (
		<Link
			href={`/app/projects/${project.id}`}
			className="block rounded-lg border p-4 hover:bg-muted"
		>
			<h3 className="font-medium">{project.name}</h3>
			{project.description ? (
				<p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
			) : null}
		</Link>
	)
}
```

Test (`components/project-card.spec.tsx` — co-located):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectCard } from './project-card'

describe('<ProjectCard />', () => {
	it('should render the project name', () => {
		render(
			<ProjectCard
				project={{ id: '1', name: 'Alpha', description: null, createdAt: '2026-01-01T00:00:00Z' }}
			/>,
		)
		expect(screen.getByText('Alpha')).toBeInTheDocument()
	})

	it('should link to the project detail page', () => {
		render(
			<ProjectCard
				project={{ id: '1', name: 'Alpha', description: null, createdAt: '2026-01-01T00:00:00Z' }}
			/>,
		)
		expect(screen.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', '/app/projects/1')
	})
})
```

## Project Overrides

Record project-specific deviations here so the rest of the file stays portable (test file suffix, suite locations, commands, framework quirks, MSW handler locations).
