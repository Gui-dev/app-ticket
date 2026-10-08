# Testing — TICKETVIBE

How testing works in this repository. Project-specific deviations from the generic skills:

- API: [`docs/skills/TESTING_API_GUIDELINE.md`](./skills/TESTING_API_GUIDELINE.md)
- Frontend: [`docs/skills/TESTING_FRONTEND_GUIDELINE.md`](./skills/TESTING_FRONTEND_GUIDELINE.md)
- Commits: [`docs/skills/COMMIT_GUIDELINE.md`](./skills/COMMIT_GUIDELINE.md)

## Principles (spec & testing guidelines)

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
| Integration (routes + real Postgres) | Vitest against a planned local `ticketvibe_test` database; planned helpers `resetDatabase` / `seedTestData` | **arrives with ticket 04** (first route over the DB) |
| E2E | Playwright against the real local stack (web :3000, api :3001, Mailpit API :8025) | **from ticket 05 on** (first E2E acceptance criterion is ticket 05; auth journey at 08, full purchase journey at 13) |

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

- Coverage tooling is **not installed yet**; the gate is expected to start with ticket 04+.
- Planned policy (per the testing guidelines in `docs/skills/`; the spec defers coverage guidance to this doc): minimum 80% lines/functions/statements/branches on business-logic paths — `apps/api/src/modules/**/{use-cases,domain}/**` and `apps/web/src/{components,hooks,lib}/**`. Infrastructure and framework glue are covered by integration/E2E instead, not by the unit gate.
- E2E tests complement unit coverage and are never measured by it.

## Gates (Lefthook)

- **pre-commit:** `pnpm exec biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched && git update-index --again`
- **pre-push:** `pnpm typecheck` then `pnpm test`
- E2E is not in the hooks (manual now, cloud CI out of scope for this study project).
