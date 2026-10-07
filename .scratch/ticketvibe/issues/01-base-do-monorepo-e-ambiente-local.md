# 01: Base do monorepo + ambiente local

**What to build:** Um desenvolvedor clona o repositório, sobe o ambiente com um comando (Podman: Postgres, Redis, Mailpit) e roda `pnpm dev` com a API, o web e o worker subindo juntos; os gates de qualidade (Biome, typecheck, testes unitários) funcionam via Lefthook e pipelines do Turborepo. A API responde uma rota de saúde e o web mostra uma página de boas-vindas.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Turborepo + pnpm workspace com `apps/web` (Next.js), `apps/api` (Fastify), `apps/worker` (BullMQ) e `packages/shared` (Zod)
- [ ] Compose Podman versionado no repo com Postgres, Redis e Mailpit
- [ ] Biome configurado no lugar de ESLint+Prettier; Lefthook com pre-commit = `biome check` e pre-push = typecheck + testes unitários
- [ ] Pipeline Turborepo de `typecheck` e `test` verde do zero
- [ ] Rota de saúde da API respondendo; página inicial do web renderizando
- [ ] Worker conecta ao Redis e agenda sem job (hello world do BullMQ)
