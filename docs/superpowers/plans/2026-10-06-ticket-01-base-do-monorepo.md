# Ticket 01 — Base do monorepo + ambiente local: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turborepo + pnpm workspace com `apps/web`, `apps/api`, `apps/worker` e `packages/shared`, ambiente local via Podman (Postgres, Redis, Mailpit), Biome + Lefthook como gates, pipelines `typecheck`/`test` verdes, API respondendo `/health`, web com página de boas-vindas e worker cumprimentando via BullMQ.

**Architecture:** Monorepo único no repositório (o repo ainda não é um git repo — este plano cria o primeiro commit; worktree não se aplica). Cada pacote é independente com seu próprio `tsconfig` (sem project references — YAGNI); o contrato entre eles nasce em `packages/shared` (Zod). Execução: `tsx` para API/worker (sem build em dev), Next.js para web, Vitest para testes, Turborepo orquestrando `typecheck`/`test`.

**Tech Stack:** Node 25 / pnpm 10.28 (instalados), Turborepo, Biome 2.x, Lefthook, Fastify, Next.js 16 (create-next-app), BullMQ + Redis, Zod, Vitest, Podman compose.

**Environment facts (verified):** `node v25.2.1`, `pnpm 10.28.0`, `git 2.55.0` (identidade global configurada, branch padrão `master`), `podman 6.1.1` (`podman compose` funcional via provider externo).

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` (root) | Scripts globais (`dev`, `typecheck`, `test`, `build`, `lint`, `format`, `infra:*`), deps raiz (`turbo`, `@biomejs/biome`, `lefthook`) |
| `pnpm-workspace.yaml` | Membros do workspace: `apps/*`, `packages/*` |
| `turbo.json` | Tasks: `build`, `typecheck`, `test`, `dev` |
| `.gitignore` | `node_modules`, `.next`, `.turbo`, `dist`, `coverage`, logs |
| `biome.json` | Formatter (single quotes) + linter recommended; force-ignores de saída |
| `lefthook.yml` | pre-commit: biome em staged; pre-push: `pnpm typecheck` + `pnpm test` |
| `compose.yaml` | Postgres 16, Redis 7, Mailpit (ports 5432/6379/1025+8025) |
| `packages/shared/package.json` + `src/index.ts` | Contrato Zod (`healthResponseSchema`) |
| `packages/shared/src/index.spec.ts` | Teste do contrato (TDD) |
| `apps/api/src/app.ts` | Constrói a instância Fastify com rotas (seam de teste via `inject`) |
| `apps/api/src/index.ts` | Sobe o servidor na porta 3001 |
| `apps/api/src/app.spec.ts` | Teste da rota `/health` contra o contrato compartilhado |
| `apps/worker/src/index.ts` | Worker + Queue BullMQ `heartbeat` (hello world) |
| `apps/web/` | Scaffold create-next-app; `src/app/page.tsx` (boas-vindas), `src/app/layout.tsx` (metadata pt-BR) |

---

### Task 1: Git init + raiz do workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`

- [ ] **Step 1: Inicializar o repositório git**

```bash
git init
```

Expected: `Initialized empty Git repository in .../.git/` (branch `master`, conforme config global).

- [ ] **Step 2: Criar `package.json` raiz**

```json
{
  "name": "ticketvibe",
  "private": true,
  "packageManager": "pnpm@10.28.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "test": "turbo test"
  }
}
```

- [ ] **Step 3: Criar `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Criar `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "test": {
      "dependsOn": ["^typecheck"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 5: Criar `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.next/
.turbo/
*.log
```

- [ ] **Step 6: Instalar o Turborepo e verificar**

```bash
pnpm add -Dw turbo
pnpm exec turbo --version
```

Expected: versão do turbo impressa (ex.: `2.x.x`).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore pnpm-lock.yaml
git commit -m "chore: initialize turborepo workspace"
```

Expected: commit criado (sem hooks ainda).

---

### Task 2: Biome (lint + format)

**Files:**
- Create: `biome.json`
- Modify: `package.json` (adicionar scripts `lint` e `format`)

- [ ] **Step 1: Instalar o Biome**

```bash
pnpm add -Dw @biomejs/biome
```

- [ ] **Step 2: Criar `biome.json`**

```json
{
  "files": {
    "includes": [
      "**",
      "!!**/node_modules",
      "!!**/.next",
      "!!**/.turbo",
      "!!**/dist",
      "!!**/coverage",
      "!!**/pnpm-lock.yaml"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all"
    }
  }
}
```

- [ ] **Step 3: Adicionar scripts ao `package.json` raiz**

Adicionar no objeto `scripts`:

```json
"lint": "biome check .",
"format": "biome check --write ."
```

- [ ] **Step 4: Normalizar formatação existente e verificar**

```bash
pnpm format
pnpm lint
```

Expected: `pnpm lint` termina sem diagnósticos (ex.: `Checked N files`).

- [ ] **Step 5: Commit**

```bash
git add biome.json package.json pnpm-lock.yaml
git commit -m "chore: add biome lint and format config"
```

---

### Task 3: packages/shared — contrato Zod (TDD)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.spec.ts` (teste primeiro)
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Criar `packages/shared/package.json` (sem deps ainda)**

```json
{
  "name": "@ticketvibe/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências**

```bash
pnpm --filter @ticketvibe/shared add zod
pnpm --filter @ticketvibe/shared add -D typescript vitest
```

- [ ] **Step 3: Criar `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Escrever o teste falhando — `packages/shared/src/index.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./index";

describe("healthResponseSchema", () => {
  it("accepts a valid health payload", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("rejects a payload that is not ok", () => {
    expect(() => healthResponseSchema.parse({ status: "down" })).toThrow();
  });
});
```

- [ ] **Step 5: Rodar o teste para confirmar que falha**

```bash
pnpm --filter @ticketvibe/shared test
```

Expected: FAIL com erro de resolução do módulo `./index` (arquivo não existe).

- [ ] **Step 6: Implementar — `packages/shared/src/index.ts`**

```ts
import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
```

- [ ] **Step 7: Rodar o teste para confirmar que passa**

```bash
pnpm --filter @ticketvibe/shared test
```

Expected: `Test Files  2 passed (2)` e `Tests  2 passed (2)`.

- [ ] **Step 8: Typecheck + formatação + commit**

```bash
pnpm --filter @ticketvibe/shared typecheck
pnpm format
git add packages pnpm-lock.yaml
git commit -m "feat(shared): add health response schema"
```

Expected: typecheck sem saída (exit 0); `pnpm format` pode reformatar os arquivos novos para aspas simples — se mudou algo, incluí-los no commit (já coberto pelo `git add packages`).

---

### Task 4: apps/api — rota de health (TDD)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.spec.ts` (teste primeiro)
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Criar `apps/api/package.json` (sem deps ainda)**

```json
{
  "name": "@ticketvibe/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências**

```bash
pnpm --filter @ticketvibe/api add fastify "@ticketvibe/shared@workspace:*"
pnpm --filter @ticketvibe/api add -D typescript tsx vitest @types/node
```

- [ ] **Step 3: Criar `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Escrever o teste falhando — `apps/api/src/app.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@ticketvibe/shared";
import { buildApp } from "./app";

describe("GET /health", () => {
  it("returns a contract-valid ok payload", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: "ok" });

    await app.close();
  });
});
```

- [ ] **Step 5: Rodar o teste para confirmar que falha**

```bash
pnpm --filter @ticketvibe/api test
```

Expected: FAIL — módulo `./app` não encontrado.

- [ ] **Step 6: Implementar — `apps/api/src/app.ts`**

```ts
import { type FastifyInstance, Fastify } from "fastify";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

- [ ] **Step 7: Implementar — `apps/api/src/index.ts`**

```ts
import { buildApp } from "./app";

const port = Number(process.env.PORT ?? 3001);

const app = buildApp();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`[api] listening on http://localhost:${port}`);
  })
  .catch((error) => {
    console.error("[api] failed to start", error);
    process.exit(1);
  });
```

- [ ] **Step 8: Rodar o teste para confirmar que passa**

```bash
pnpm --filter @ticketvibe/api test
```

Expected: `Test Files  1 passed (1)`.

- [ ] **Step 9: Smoke test manual da API**

```bash
pnpm --filter @ticketvibe/api dev > /tmp/api-dev.log 2>&1 &
API_PID=$!
sleep 3
curl -s http://127.0.0.1:3001/health
kill $API_PID
```

Expected: `{"status":"ok"}`.

- [ ] **Step 10: Typecheck + formatação + commit**

```bash
pnpm --filter @ticketvibe/api typecheck
pnpm format
git add apps pnpm-lock.yaml
git commit -m "feat(api): add health check route"
```

Expected: typecheck exit 0.

---

### Task 5: Ambiente local — Podman compose

**Files:**
- Create: `compose.yaml`
- Modify: `package.json` (scripts `infra:up` e `infra:down`)

- [ ] **Step 1: Criar `compose.yaml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ticketvibe-postgres
    environment:
      POSTGRES_USER: ticketvibe
      POSTGRES_PASSWORD: ticketvibe
      POSTGRES_DB: ticketvibe
    ports:
      - "5432:5432"
    volumes:
      - ticketvibe-pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: ticketvibe-redis
    ports:
      - "6379:6379"

  mailpit:
    image: axllent/mailpit:latest
    container_name: ticketvibe-mailpit
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  ticketvibe-pgdata:
```

- [ ] **Step 2: Adicionar scripts ao `package.json` raiz**

Adicionar no objeto `scripts`:

```json
"infra:up": "podman compose -f compose.yaml up -d",
"infra:down": "podman compose -f compose.yaml down -v"
```

- [ ] **Step 3: Subir a infraestrutura**

```bash
pnpm infra:up
```

Expected: containers `ticketvibe-postgres`, `ticketvibe-redis`, `ticketvibe-mailpit` criados e iniciados.

- [ ] **Step 4: Verificar cada serviço**

```bash
podman compose ps
podman exec ticketvibe-postgres pg_isready -U ticketvibe
podman exec ticketvibe-redis redis-cli ping
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8025
```

Expected: `pg_isready` → `accepting connections`; `redis-cli` → `PONG`; curl → `200`.

- [ ] **Step 5: Commit**

```bash
git add compose.yaml package.json
git commit -m "chore: add local infra with podman compose"
```

---

### Task 6: apps/worker — BullMQ hello world

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`

- [ ] **Step 1: Criar `apps/worker/package.json` (sem deps ainda)**

```json
{
  "name": "@ticketvibe/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Instalar dependências**

```bash
pnpm --filter @ticketvibe/worker add bullmq
pnpm --filter @ticketvibe/worker add -D typescript tsx @types/node
```

- [ ] **Step 3: Criar `apps/worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Implementar — `apps/worker/src/index.ts`**

```ts
import { Queue, Worker } from "bullmq";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || "6379"),
};

const queue = new Queue("heartbeat", { connection });

const worker = new Worker(
  "heartbeat",
  async (job) => {
    console.log(`[worker] job processed: ${job.id}`);
  },
  { connection },
);

queue
  .add("tick", {}, { attempts: 1 })
  .then(() => {
    console.log("[worker] listening for heartbeat jobs");
  })
  .catch((error) => {
    console.error("[worker] failed to enqueue", error);
    process.exit(1);
  });

async function shutdown() {
  await worker.close();
  await queue.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @ticketvibe/worker typecheck
```

Expected: exit 0, sem saída.

- [ ] **Step 6: Rodar contra o Redis (deve estar de pé — Task 5)**

```bash
timeout 10 pnpm --filter @ticketvibe/worker dev
```

Expected (na saída): `[worker] listening for heartbeat jobs` e `[worker] job processed: 1`. Exit code `124` é esperado — é o `timeout` encerrando um processo persistente saudável.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps pnpm-lock.yaml
git commit -m "feat(worker): add bullmq heartbeat worker"
```

---

### Task 7: apps/web — scaffold Next.js + página de boas-vindas

**Files:**
- Create: `apps/web/` (scaffold do create-next-app)
- Modify: `apps/web/src/app/layout.tsx` (metadata + lang)
- Replace: `apps/web/src/app/page.tsx` (página de boas-vindas)
- Modify: `apps/web/package.json` (script `typecheck`)

- [ ] **Step 1: Scaffold não-interativo**

```bash
pnpm dlx create-next-app@latest apps/web --ts --tailwind --app --src-dir --no-linter --import-alias "@/*" --use-pnpm --skip-install --disable-git
```

Expected: app criado em `apps/web/` sem prompts interativos.

- [ ] **Step 2: Registrar no workspace e higienizar**

```bash
pnpm install
rm -f apps/web/AGENTS.md
test ! -e apps/web/eslint.config.mjs && echo "sem eslint"
```

Expected: última linha `sem eslint` (o `--no-linter` foi honrado; se o arquivo existir, removê-lo e documentar no commit).

- [ ] **Step 3: Ajustar `apps/web/src/app/layout.tsx`**

Substituir o `export const metadata` existente por:

```tsx
export const metadata: Metadata = {
  title: "TICKETVIBE",
  description: "Marketplace de ingressos para eventos",
};
```

E trocar `<html lang="en">` por:

```tsx
<html lang="pt-BR">
```

- [ ] **Step 4: Substituir `apps/web/src/app/page.tsx` inteiramente**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
      <h1 className="text-4xl font-bold">
        TICKET<span className="text-emerald-400">VIBE</span>
      </h1>
      <p className="text-sm text-neutral-400">Ambiente local em execução.</p>
    </main>
  );
}
```

- [ ] **Step 5: Adicionar script `typecheck` ao `apps/web/package.json`**

Adicionar no objeto `scripts`:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 6: Normalizar formatação**

```bash
pnpm format
```

Expected: arquivos do scaffold convertidos para aspas simples.

- [ ] **Step 7: Build de produção do web**

```bash
pnpm --filter @ticketvibe/web build
```

Expected: build conclui (gera `next-env.d.ts`) e imprime algo como `✓ Compiled successfully` / `Generating static pages`.

- [ ] **Step 8: Typecheck do web**

```bash
pnpm --filter @ticketvibe/web typecheck
```

Expected: exit 0 (agora com `next-env.d.ts` gerado pelo build).

- [ ] **Step 9: Commit**

```bash
git add apps pnpm-lock.yaml
git commit -m "feat(web): scaffold next app shell"
```

---

### Task 8: Lefthook — gates pre-commit e pre-push

**Files:**
- Create: `lefthook.yml`
- Modify: `package.json` (dep `lefthook` + script `prepare`)

- [ ] **Step 1: Instalar o Lefthook e criar a config**

```bash
pnpm add -Dw lefthook
```

Criar `lefthook.yml`:

```yaml
pre-commit:
  jobs:
    - run: pnpm exec biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched && git update-index --again

pre-push:
  jobs:
    - run: pnpm typecheck
    - run: pnpm test
```

- [ ] **Step 2: Adicionar `prepare` ao `package.json` raiz**

Adicionar no objeto `scripts`:

```json
"prepare": "lefthook install"
```

- [ ] **Step 3: Instalar os hooks e verificar**

```bash
pnpm exec lefthook install
test -f .git/hooks/pre-commit && test -f .git/hooks/pre-push && echo "hooks ok"
```

Expected: `Hook(s) installed` e depois `hooks ok`.

- [ ] **Step 4: Provar o pre-commit com um arquivo mal formatado**

```bash
printf 'const x   =  {a:1};\n' > hook-check.ts
git add hook-check.ts
pnpm exec biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched && git update-index --again
git show :hook-check.ts
git reset -q hook-check.ts
rm hook-check.ts
```

Expected: `git show` imprime `const x = { a: 1 };` (corrigido pelo biome e re-staged).

- [ ] **Step 5: Provar o pre-push**

```bash
pnpm exec lefthook run pre-push
```

Expected: tasks `typecheck` e `test` do Turborepo executam e terminam verdes.

- [ ] **Step 6: Commit (o próprio hook roda aqui)**

```bash
git add lefthook.yml package.json pnpm-lock.yaml
git commit -m "chore: add lefthook git hooks"
```

Expected: commit aceito; se o biome corrigir algo staged, o arquivo é re-staged antes do commit.

---

### Task 9: Verificação final contra os critérios do ticket

**Files:**
- Modify: `.scratch/ticketvibe/issues/01-base-do-monorepo-e-ambiente-local.md` (marcar critérios)

- [ ] **Step 1: Gates de qualidade**

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: `lint` sem diagnósticos; `typecheck` verde para shared/api/worker/web; `test` verde (2 testes do shared + 1 da api).

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: build do web conclui (api/worker/shared não têm script `build` — Turborepo os ignora).

- [ ] **Step 3: Infraestrutura e worker**

```bash
pnpm infra:up
timeout 10 pnpm --filter @ticketvibe/worker dev
```

Expected: logs `[worker] listening for heartbeat jobs` e `[worker] job processed: 1`.

- [ ] **Step 4: Smoke da API e da web**

```bash
pnpm --filter @ticketvibe/api dev > /tmp/api-dev.log 2>&1 &
API_PID=$!
pnpm --filter @ticketvibe/web dev > /tmp/web-dev.log 2>&1 &
WEB_PID=$!
sleep 8
curl -s http://127.0.0.1:3001/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
kill $API_PID $WEB_PID
```

Expected: `{"status":"ok"}` e `200`.

- [ ] **Step 5: Estado do repositório**

```bash
git status --porcelain
```

Expected: vazio (nada sujo para commitar).

- [ ] **Step 6: Marcar os critérios de aceitação**

Atualizar `.scratch/ticketvibe/issues/01-base-do-monorepo-e-ambiente-local.md`, marcando cada `- [ ]` como `- [x]` somente se cada item foi verificado nos passos anteriores.

---

## Self-Review

**Spec/coverage (critérios do ticket 01):**
- Turborepo + pnpm + apps (web/api/worker) + shared Zod → Tasks 1, 3, 4, 6, 7 ✓
- Compose Podman (Postgres, Redis, Mailpit) → Task 5 ✓
- Biome + Lefthook (pre-commit biome / pre-push typecheck+unit) → Tasks 2, 8 ✓
- Pipelines `typecheck`/`test` verdes → Task 9 ✓
- Rota de saúde da API + página inicial do web → Tasks 4, 7 (smoke Task 9) ✓
- Worker conecta ao Redis e agenda job → Task 6 ✓

**Placeholders:** nenhum (sem TBD/TODO/"adicionar depois"); todos os passos têm código ou comando com saída esperada.

**Consistência de tipos/nomes:** `buildApp(): FastifyInstance` idêntico entre teste e implementação; `healthResponseSchema` (literal `"ok"`) usado no teste da API e definido no shared; scripts globais `dev/build/typecheck/test/lint/format/infra:*` definidos na Task 1–2–5 e consumidos no lefthook (Task 8) e na verificação final (Task 9); escopos de pacote `@ticketvibe/*` uniformes.
