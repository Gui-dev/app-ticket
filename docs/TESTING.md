# Testing — Repository Adaptations

Project-specific deviations from the generic skills:
- API: [`docs/skills/TESTING_API_GUIDELINE.md`](./skills/TESTING_API_GUIDELINE.md)
- Frontend: [`docs/skills/TESTING_FRONTEND_GUIDELINE.md`](./skills/TESTING_FRONTEND_GUIDELINE.md)

This file records how each skill maps to this repository.

## API Testing

### Deviations

1. **Test file suffix:** `.spec.ts` (not `.test.ts`) — all tests co-located at `apps/api/src/**/*.spec.ts`.
2. **No shared contract suites:** the shared contract test pattern from the guideline does NOT exist in this project. In-memory and Drizzle repositories are tested independently.
3. **Integration via real DB:** integration tests use `kronostore_test` database directly (no Testcontainers). Tests that need a database use `apps/api/src/lib/db/test-helpers.ts` (`resetDatabase`, `seedTestData`) and `apps/api/src/lib/db/test-db.ts`.
4. **No centralized integration directory:** `apps/api/tests/integration/` does not exist. Integration-style specs (e.g., `checkout.use-case.integration.spec.ts`) live co-located with their source.
5. **Scope:** hexagonal pattern applies to domain modules under `modules/<domain>/`. Persistence owned by Better Auth stays outside the pattern.

### File Structure

```
apps/api/src/
├── lib/db/
│   ├── test-db.ts              # Drizzle client for kronostore_test
│   ├── test-helpers.ts         # resetDatabase, seedTestData, TEST_* constants
│   └── transaction.ts          # withTransaction, getTransactionClient (AsyncLocalStorage)
├── modules/<domain>/
│   ├── domain/
│   │   ├── <entity>.ts         # Types, DomainError classes
│   │   └── <entity>-repository.ts  # Repository contract (interface)
│   ├── infra/
│   │   ├── drizzle-<entity>-repository.ts   # Production (real DB)
│   │   └── in-memory-<entity>-repository.ts # Test double
│   ├── use-cases/
│   │   ├── <verb>-<noun>.use-case.ts
│   │   └── <verb>-<noun>.use-case.spec.ts   # Co-located unit tests
│   ├── schemas/
│   │   └── <entity>.schema.ts
│   └── routes/
│       └── index.ts
```

### Commands

```bash
pnpm --filter @kronostore/api test           # vitest run (all unit tests)
pnpm --filter @kronostore/api typecheck      # tsc --noEmit
pnpm --filter @kronostore/api test:watch     # vitest watch
pnpm --filter @kronostore/api test:coverage  # vitest run --coverage
```

### In-Memory Repositories

Available at `apps/api/src/modules/*/infra/in-memory-*-repository.ts`:

- categories, products, cart, coupons, orders, payments, stock, emails, webhooks, users

### Test Helpers

`apps/api/src/lib/db/test-helpers.ts`:
- `resetDatabase()` — truncates all tables with CASCADE
- `seedTestData()` — inserts category, product, variant, stock with deterministic IDs
- `TEST_CATEGORY_ID`, `TEST_PRODUCT_ID`, `TEST_VARIANT_ID`, `TEST_STOCK_ID`

### Coverage

~278 tests across 37 files.

---

## Frontend Testing

### Deviations

1. **Unit testing IS installed:** Vitest + React Testing Library + MSW v2 is fully configured and working. Unit tests are co-located at `apps/web/src/**/*.spec.{ts,tsx}`.
2. **E2E test location:** `apps/web/tests/e2e/*.spec.ts` (centralized, per Playwright convention).
3. **E2E helpers:** `apps/web/tests/e2e/helpers/mailpit.ts` — polls MailPit API for emails.
4. **Base URL:** E2E tests run against `http://localhost:3000` (Next.js dev server). The API at `http://localhost:3001` must be running.
5. **Auth in E2E:** users are registered via API (`/auth/sign-up`), then logged in via UI (`/login`). No MailPit email verification flow in E2E.
6. **Webhook HMAC in E2E:** checkout-flow tests compute HMAC-SHA256 signatures and POST to `/webhooks/payment` with `x-webhook-signature` header. Requires `WEBHOOK_SECRET` env var.

### Vitest Config

- `apps/web/vitest.config.ts`: jsdom, globals, `setupFiles: ['./src/test/setup.ts']`, alias `@` → `src`
- `apps/web/src/test/setup.ts`: jest-dom matchers, MSW server lifecycle, localStorage mock

### MSW Handlers

Located at `apps/web/src/mocks/handlers/`:
- `products.ts`
- `cart.ts`
- `auth.ts`

### Unit Test Files

- `apps/web/src/components/product/product-card.spec.tsx`
- `apps/web/src/components/product/product-grid.spec.tsx`
- `apps/web/src/components/checkout/checkout-form.spec.tsx`
- `apps/web/src/lib/cart-sync.spec.ts`
- `apps/web/src/stores/cart-store.spec.ts`

### E2E Test Files

- `apps/web/tests/e2e/browse-products.spec.ts`
- `apps/web/tests/e2e/cart-flow.spec.ts`
- `apps/web/tests/e2e/checkout-flow.spec.ts` (includes webhook HMAC test)

### Commands

```bash
pnpm --filter @kronostore/web test           # vitest run (unit tests)
pnpm --filter @kronostore/web typecheck      # tsc --noEmit
pnpm --filter @kronostore/web test:watch     # vitest watch
pnpm --filter @kronostore/web test:coverage  # vitest run --coverage
pnpm --filter @kronostore/web test:e2e       # playwright test
```

### Coverage

~33 unit tests across 5 files + 3 E2E test files.
