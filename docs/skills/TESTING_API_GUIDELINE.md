# Unit Testing Guidelines — API (Hexagonal Architecture)

A portable convention for unit-testing backend domain code built with use cases, repository contracts, and in-memory repositories. Copy this file into any application and adapt only the "Project Overrides" section at the bottom.

## Tech Stack

- **Test framework:** Vitest (works unchanged with Jest — swap `vitest` imports for `jest`).
- **Architecture:** Hexagonal (ports & adapters). Business logic lives in use cases; persistence lives behind repository contracts.
- **Isolation:** Every test creates fresh in-memory instances. Unit tests never touch a database, network, filesystem, or clock.

## Principles

1. **Fast feedback:** the whole unit suite should run in seconds. If a test is slow, it does not belong here.
2. **Behavior, not implementation:** assert what the use case returns/throws — never how it collaborates internally.
3. **Fail-closed determinism:** same input → same output, every run. No hidden `Date.now()`, `Math.random()`, or global state.
4. **One reason to exist:** a use case orchestrates one business operation. If you need "and" to describe it, split it.

## Test File Placement

### Unit tests — co-located with source

Every `.spec.ts` (or `.test.ts`) file lives **next to the file it tests**, using the same base name:

```
modules/<domain>/
├── domain/
│   ├── task.ts
│   ├── task.spec.ts                        # co-located
│   └── task-repository.ts
├── infra/
│   ├── drizzle-task-repository.ts
│   └── in-memory-task-repository.ts
│       └── in-memory-task-repository.spec.ts  # co-located
└── use-cases/
    ├── create-task.use-case.ts
    └── create-task.use-case.spec.ts           # co-located
```

Why co-location: the test-to-source mapping is obvious at a glance; refactors move both files together; no guessing where tests live.

### Integration tests — co-located with source

Tests that hit real databases are co-located alongside their source files (e.g., `checkout.use-case.integration.spec.ts` next to `checkout.use-case.ts`). There is no centralized `tests/integration/` directory in this project.

## Module Layout (expected structure)

```
modules/<domain>/
├── domain/
│   ├── <entity>.ts                       # entity types + domain errors
│   └── repository.ts                     # <Entity>Repository contract (interface)
├── infra/
│   ├── <driver>-<entity>-repository.ts   # production implementation (SQL/HTTP/etc.)
│   └── in-memory-<entity>-repository.ts  # test implementation of the same contract
└── use-cases/
    └── <verb>-<entity>.use-case.ts       # class with execute(input); receives the contract
```

Rules:

- The contract is **narrow by design** (ISP): it exposes only what the use cases consume.
- The in-memory repository implements the same contract as the production one. It is real logic (maps/arrays), never a mock library.
- Production-only operations (e.g. rows created by an external system) stay **out** of the contract; the in-memory class may expose extra public helpers for test seeding.

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Unit test file | `<source-file-name>.spec.ts` co-located with the source | `create-task.use-case.spec.ts` next to `create-task.use-case.ts` |
| Integration test file | `<feature>.spec.ts` in `tests/integration/` | `task-crud.spec.ts` |
| Use case suite | `describe('<UseCaseName>')` | `describe('CreateTaskUseCase')` |
| Repository suite | `describe('<RepositoryName>') → describe('<method>')` | `describe('InMemoryTaskRepository') → describe('findByAssignee')` |
| Test title | `it('should [observable behavior]')` — never `it('works')` | `it('should reject an empty title')` |
| Factory | `create<Task>(overrides?)` defined per test file | `createTask({ status: 'done' })` |

## Domain Errors

Use cases throw typed `DomainError` instances (extending the project's base error class). Never throw raw `Error` — typed errors make test assertions reliable and distinguishable from framework bugs.

```typescript
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
```

In use cases:

```typescript
if (!title) throw new DomainError('TITLE_REQUIRED', 'Title is required')
```

In tests:

```typescript
await expect(useCase.execute({ title: '' })).rejects.toThrow(DomainError)
await expect(useCase.execute({ title: '' })).rejects.toThrow('Title is required')
```

Test that the error carries the correct code:

```typescript
try {
  await useCase.execute({ title: '' })
  expect.fail('should throw')
} catch (error) {
  expect(error).toBeInstanceOf(DomainError)
  expect((error as DomainError).code).toBe('TITLE_REQUIRED')
}
```

## Writing Use Case Tests

Standard setup — fresh repository and use case per test via `beforeEach`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryTaskRepository } from '../infra/in-memory-task-repository.js'
import { CreateTaskUseCase } from './create-task.use-case.js'

describe('CreateTaskUseCase', () => {
  let repository: InMemoryTaskRepository
  let useCase: CreateTaskUseCase

  beforeEach(() => {
    repository = new InMemoryTaskRepository()
    useCase = new CreateTaskUseCase(repository)
  })

  it('should create a task with valid input', async () => {
    const task = await useCase.execute({ title: 'Write docs', priority: 'high' })

    expect(task.id).toBeDefined()
    expect(task.title).toBe('Write docs')
    expect(task.status).toBe('open') // default value applied by the use case
  })

  it('should reject an empty title', async () => {
    await expect(useCase.execute({ title: '   ' })).rejects.toThrow('Title is required')
  })

  it('should persist the created task in the repository', async () => {
    const created = await useCase.execute({ title: 'Review PR' })

    const stored = await repository.findById(created.id)
    expect(stored?.title).toBe('Review PR')
  })
})
```

Guidance:

- Inject **all** dependencies through the constructor (repositories, id generators, clocks). A use case constructor with zero or one dependency is a smell — so is one with five.
- Seed preconditions through the repository (`repository.create(...)`) or another use case — never by poking private fields.
- Assert side effects through the repository's read methods, not by inspecting internals.

## Repository Testing

Each repository contract has two implementations: a production Drizzle implementation and an in-memory test double. Both are tested independently — there are no shared contract suites in this project.

- **In-memory tests** exercise the in-memory repository directly (fast, no I/O).
- **Drizzle tests** hit the `kronostore_test` database directly (integration, requires running Postgres).

## Writing In-Memory Repository Tests

Test in-memory-specific behavior: CRUD paths, edge cases, empty results, filtering, and the in-memory data structure:

```typescript
describe('InMemoryTaskRepository', () => {
  describe('findByAssignee', () => {
    let repository: InMemoryTaskRepository

    beforeEach(() => {
      repository = new InMemoryTaskRepository()
    })

    it('should return an empty list when nothing matches', async () => {
      expect(await repository.findByAssignee('user-1')).toEqual([])
    })

    it('should return only tasks assigned to the given user', async () => {
      await repository.create({ title: 'A', assigneeId: 'user-1' })
      await repository.create({ title: 'B', assigneeId: 'user-2' })

      const tasks = await repository.findByAssignee('user-1')

      expect(tasks.map((task) => task.title)).toEqual(['A'])
    })
  })
})
```

Cover: full CRUD paths it implements, empty results, not-found lookups, filtering/ordering/pagination logic, and uniqueness collisions if the production contract enforces them.

## Test Data Factories

Avoid repeating full object literals. Define one factory per test file (or a shared `testing/` folder when it grows), returning a valid entity with sensible defaults and allowing targeted overrides:

```typescript
function createTaskInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return { title: 'Sample task', priority: 'medium', ...overrides }
}

// usage
await useCase.execute(createTaskInput({ title: '' })) // focuses the test on the title rule
```

The test should highlight only the fields that matter to the behavior under test.

## Determinism

- **Clocks:** inject a `now: () => Date` (or `Clock` port) into use cases that timestamp things. Tests pass a fixed function.
- **IDs:** inject an id generator or accept ids from the repository. Never assert on random output.
- **No sleeps:** never `setTimeout`/fixed waits in unit tests — everything here is synchronous-by-design behind `async`.

## Recommended Case Checklist

### Use cases

1. **Success:** valid input returns the expected result.
2. **Validation:** invalid input throws the domain error with its message.
3. **Defaults:** optional fields receive documented defaults.
4. **Transformations:** output fields are derived/computed correctly.
5. **Authorization/state rules:** forbidden transitions throw (e.g. completing an already-completed task).
6. **Side effects:** the repository reflects the change (read it back to assert).

### In-memory repositories

1. **CRUD:** every contract method exercised.
2. **Edge cases:** empty collections, missing ids, no matches for filters.
3. **Ordering/pagination:** sort order and limit/offset behavior when the contract promises them.
4. **Relationships:** joins/lookups by related id return only matching rows.

## Anti-Patterns (do not do this)

- ❌ Connecting to a real database/service in unit tests — that is what integration tests are for.
- ❌ Hand-written mocks with `vi.mock`/`jest.mock` for repositories — use in-memory implementations.
- ❌ Testing framework/library internals instead of your behavior.
- ❌ `setTimeout`, fixed sleeps, or "retry until it passes" logic.
- ❌ Tests that depend on execution order or share mutable state — every test stands alone.
- ❌ Business logic in routes/controllers — untested logic is the real bug; move it into a use case.
- ❌ Asserting on private fields or internal call counts — assert observable behavior.
- ❌ Throwing raw `Error` from use cases — use typed `DomainError` so tests match by type and code.

## Coverage Gate

CI should enforce minimum coverage on business logic paths:

```
thresholds:
  lines: 80
  functions: 80
  statements: 80
  branches: 80
  paths:
    - src/modules/**/use-cases/**
    - src/modules/**/domain/**
```

Paths like `src/lib/abilities/**` (cross-cutting business rules) may also be included. Infrastructure and framework glue (`src/lib/errors/`, `src/middleware/`) is typically covered by integration tests, not enforced here.

## Definition of Done (for a use case)

- [ ] Contract defined (or extended) first; production + in-memory implementations exist.
- [ ] Domain error thrown as typed `DomainError` (not raw `Error`).
- [ ] Success, validation, and side-effect tests written before the implementation (TDD).
- [ ] All previously passing tests still pass.
- [ ] No I/O in the unit suite; the production implementation is covered by integration tests elsewhere.
- [ ] Coverage gate passes on the business logic paths.

## Commands (adapt to your project)

```bash
pnpm --filter @kronostore/api test           # unit suite
pnpm --filter @kronostore/api typecheck      # type checking
pnpm --filter @kronostore/api test:watch     # watch mode
pnpm --filter @kronostore/api test:coverage  # coverage report
```

## Full Worked Example

Domain contract (`domain/task-repository.ts`):

```typescript
export interface Task {
  id: string
  title: string
  status: 'open' | 'done'
  assigneeId?: string
}

export interface TaskRepository {
  create(input: { title: string; assigneeId?: string }): Promise<Task>
  findById(id: string): Promise<Task | null>
}
```

Use case (`use-cases/create-task.use-case.ts`):

```typescript
import type { Task, TaskRepository } from '../domain/task-repository.js'

export class CreateTaskUseCase {
  constructor(private readonly repository: TaskRepository) {}

  async execute(input: { title: string; assigneeId?: string }): Promise<Task> {
    const title = input.title.trim()
    if (!title) throw new Error('Title is required')

    return this.repository.create({ title, assigneeId: input.assigneeId })
  }
}
```

Tests (`create-task.use-case.test.ts`): see "Writing Use Case Tests" above — success, validation, and persistence read-back.

## Project Overrides

Record project-specific deviations here so the rest of the file stays portable (test file suffix, suite locations, commands, framework quirks).
