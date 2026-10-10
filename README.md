# TICKETVIBE

Marketplace de ingressos para eventos — projeto de estudo. Tudo roda local; sem deploy de produção.

## Requisitos

- Node `>= 22.12` e pnpm 10 (`npm i -g pnpm@10`; `corepack enable` só existe no Node 22–24)
- Podman 6+ com provider de compose funcional (`podman compose` via `docker-compose` ou `podman-compose`)

## Quickstart

```bash
pnpm install
pnpm infra:up     # Postgres, Redis, Mailpit (apenas 127.0.0.1)
pnpm --filter @ticketvibe/api db:migrate   # migrações Drizzle (idempotente)
pnpm --filter @ticketvibe/api db:seed      # categorias, locais e 12 eventos (idempotente)
pnpm dev          # web :3000 · api :3001 · worker BullMQ
```

Smoke test (com `pnpm dev` rodando):

```bash
curl -s http://127.0.0.1:3001/health                            # {"status":"ok"}
curl -s 'http://127.0.0.1:3001/events?view=featured'            # {"events":[…3 eventos…]}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000  # 200
```

Worker (com infra de pé):

```bash
timeout 10 pnpm --filter @ticketvibe/worker dev
```

Esperado: `[worker] listening for heartbeat jobs` e `[worker] job processed: N` (exit `124` do `timeout`).
Com o Redis fora o worker fica em loop de reconexão e não processa (nem sai) — suba a infra antes.

## Scripts (raiz)

| Script | O que faz |
|---|---|
| `pnpm dev` | turbo dev — web, api e worker em paralelo |
| `pnpm build` | build de produção (web; os demais pacotes não têm `build`) |
| `pnpm typecheck` | tsc de todos os pacotes (builda o web antes para gerar `.next/types`) |
| `pnpm test` | testes (vitest: shared + api + web; a integração exige `pnpm infra:up`) |
| `pnpm lint` / `pnpm format` | biome check / biome check --write |
| `pnpm --filter @ticketvibe/web storybook` | Storybook do design system (catálogo em http://localhost:6006) |
| `pnpm --filter @ticketvibe/api db:generate` | gera migrações Drizzle a partir do schema |
| `pnpm --filter @ticketvibe/api db:migrate` | aplica as migrações no Postgres |
| `pnpm --filter @ticketvibe/api db:seed` | popula categorias, locais e eventos (idempotente) |
| `pnpm infra:up` | sobe Postgres, Redis e Mailpit |
| `pnpm infra:down` | derruba os containers **e apaga os volumes** |

## Portas

Infra (5432/6379/1025/8025) escuta apenas em 127.0.0.1; web e api aceitam conexões de qualquer interface (acesso local via 127.0.0.1).

| Porta | Serviço |
|---|---|
| 3000 | web (Next.js) |
| 3001 | api (Fastify) |
| 6006 | storybook (design system do web) |
| 5432 | Postgres 16 |
| 6379 | Redis 7 |
| 1025 / 8025 | Mailpit SMTP / UI |

## Variáveis de ambiente

Nenhuma é obrigatória. Opcionais:

| Var | Padrão | Usada por |
|---|---|---|
| `PORT` | `3001` | api (`apps/api/src/index.ts`) |
| `REDIS_URL` | `redis://localhost:6379` | worker (`apps/worker/src/index.ts`) |
| `DATABASE_URL` | `postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe` | api (Drizzle client + drizzle-kit) |
| `API_URL` | `http://localhost:3001` | web (`fetchEvents` no servidor) |

`.env*` é ignorado pelo git; `.env.example` é permitido (exceção no `.gitignore`).

## Estrutura

```
apps/web          Next.js 16 + Tailwind + Shadcn/ui + Storybook :6006 (pt-BR; moeda BRL conforme spec)
apps/api          Fastify 5 + Drizzle/Postgres — rotas /health e /events validadas pelo shared (unit + integração)
apps/worker       BullMQ (fila heartbeat) contra o Redis local
packages/shared   contrato Zod — fonte única web↔api
compose.yaml      Postgres · Redis · Mailpit
lefthook.yml      pre-commit: biome · pre-push: typecheck + test
```

## Documentação

- [`docs/TESTING.md`](docs/TESTING.md) — como testamos: comandos reais, o que existe hoje e o que vem por ticket
- [`docs/skills/`](docs/skills/) — diretrizes portáteis: API, frontend, commits
- [`docs/agents/`](docs/agents/) — como agents navegam issues e domínio
- [`AGENTS.md`](AGENTS.md) — entry point para agents que trabalham neste repo
- [`.scratch/ticketvibe/spec.md`](.scratch/ticketvibe/spec.md) — spec do produto; [`issues/`](.scratch/ticketvibe/issues/) — tickets
