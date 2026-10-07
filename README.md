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
