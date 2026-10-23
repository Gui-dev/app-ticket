# 17: Papel organizador + área do organizador

**What to build:** O usuário que atua como organizador tem seu papel na conta e acessa uma área de backoffice separada da experiência de comprador, com as rotas protegidas por papel — negando o acesso a quem não é organizador.

**Blocked by:** 08 (Conta: e-mail e senha)

**Status:** done

- [x] Papel `organizer` no mesmo usuário Better Auth (sem sistema de contas separado)
- [x] Meio de promover usuário a organizador no ambiente de estudo (seed/ferramenta local)
- [x] Área do organizador com layout próprio e rotas protegidas por papel
- [x] Usuário comum é redirecionado/negado nas rotas do backoffice
- [x] Testes: integração das guards de papel, componente da navegação, E2E de organizador logado acessar e comprador ser bloqueado

## Implementação

Plano: `docs/superpowers/plans/2026-10-22-ticket-17-papel-organizador-backoffice.md`, executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com revisão final do branch inteiro).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `b3eebcf` | Papel `organizer` no mesmo usuário Better Auth: coluna `role` (`'buyer' | 'organizer'`, default `'buyer'`) na tabela `user` com migração única `0012_perpetual_xorn.sql` gerada por drizzle-kit; `additionalFields` na config do Better Auth com `input: false` (server-owned, signup não se auto-promove) e `returned` no default (papel sai no objeto de sessão); `createGetSession` propaga `SessionUser.role` com fallback `?? 'buyer'`; 4 testes de integração pt-BR (buyer no signup; `role` no payload ignorado; promoção no banco refletida na mesma sessão; anônimo com papel buyer) |
| 2 | `de68425` | Guard puro de papel `guardOrganizer` em `modules/auth/role-guard.ts` (`ok` / `not_authenticated` / `not_organizer`) + módulo `organizer/` na API com `GET /organizer/session`: sem sessão → 401 `{ error }`; anônimo/comprador → 403 `{ error }`; organizador → 200 `{ user: { id, email, role } }`; registrado em `app.ts` junto aos demais módulos; spec unitária (4 casos) + spec de integração da rota (4 casos) |
| 3 | `53cb2c1` | Ferramenta local de promoção: `promoteOrganizerByEmail(db, email)` idempotente (`promoted`/`not_found`) em `apps/api/src/db/promote-organizer.ts`, binário com `isMainModule`, `db.$client.end()` no `finally`, `exitCode = 1` + mensagem em pt-BR no not-found, script `db:promote-organizer` (uso: `pnpm --filter @ticketvibe/api db:promote-organizer <email>`); 3 testes de integração (promove, idempotente, inexistente) + evidência manual real do binário nos dois caminhos |
| 4 | `80018fe` | Área `/organizador` no web: `auth-client` ganha `inferAdditionalFields` (forma manual com `required: false, input: false`, espelhando a config do servidor — pacotes separados); layout client-side com guard de papel (splash `role="status"` em pending sem nenhum conteúdo protegido; redirect `/entrar` sem usuário; `AcessoNegado` para comprador, sem redirect nem children; organizador vê `<OrganizadorNav />` + children); `OrganizadorNav` dirigido por array com destaque `aria-current="page"` via `usePathname`; `AcessoNegado` ("Acesso restrito" / link "Voltar para a home"); `AuthMenu` mostra link "Painel do organizador" apenas para organizers; página Painel (heading + empty state); specs de componente da nav (2), do layout (4 casos) e do auth-menu (2, no estilo MSW existente) |
| 5 | `e40c269` | E2E `organizer.spec.ts` (um teste, três contextos): organizador promovido por SQL (`promoteOrganizerByEmail` em `helpers/db.ts`, padrão `query()`/podman psql existente) + reload vê o link no header, acessa `/organizador` e vê o painel com a nav; comprador logado separado segue sem o link e recebe "Acesso restrito" com o link de volta pra home; anônimo sem login termina em `/entrar` |
| 6 | (docs) | Gates finais e fechamento da issue |

Correções da revisão final do branch:

| Commit | Escopo |
|---|---|
| `ccb1804` | Eliminação das `!`/non-null assertions (lint warnings): a rota passou a tratar `!session → 401` explicitamente antes de consultar o guard (mesmo mapeamento 401/403/200, guard continua como decisor de papel) e o spec do signup passou a usar o padrão da casa `sentEmails.at(-1)?.text ?? ''` |

## Gates finais (22/10/2026)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `apps/api/src/db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test --force` | API 442 (69 arquivos), web 303 (49 arquivos), shared 84 (1 arquivo) — todos pass, execução fresca, 0 cached |
| Playwright (E2E) | 34/34 (organizer 1 + checkout 2 + checkout-email 1 + seat-availability 1 + demais 29), reexecutado no head `ccb1804` |
| `pnpm build` | ok |

Cobertura dos critérios: o papel vive na mesma conta Better Auth (coluna `role` server-owned, sem sistema de contas separado, e o signup não aceita papel no payload); a promoção é a ferramenta local `db:promote-organizer` (idempotente, com erro claro para e-mail inexistente); a área `/organizador` tem layout próprio com guard de papel e a rota API `GET /organizer/session` é a primeira rota protegida por papel (401 sem sessão, 403 para anônimo/comprador); usuário comum e anônimo são negados na área (denial no web, 403 na API); testes de integração do guard (unitária + rota), componente da navegação (nav + auth-menu) e E2E com os três papéis (organizador acessa, comprador bloqueado, anônimo redirecionado).

Nenhuma falha apareceu nos gates finais no head `ccb1804`; a única correção pós-revisão-final (`ccb1804`) foi cosmética/lint e foi revalidada por cima (lint, typecheck, suíte API, E2E 34/34 e build rodados no estado final).

## Deferrals do ticket 17

- **Painel de administração de papéis (promover via UI):** adiado — a promoção é ferramenta local de ambiente de estudo por design deste ticket; um painel de gestão de usuários precisa de destino de política (quem pode promover, auditoria) melhor decidido com o product.
- **Vínculo organizador ↔ evento (dono do evento):** chega com o CRUD de eventos (ticket 18), que decide a modelagem de propriedade.
- **Guard checa apenas o papel:** uma sessão anônima com `role: 'organizer'` gravado direto no banco passaria no guard; hoje nenhuma superfície escreve `role` fora da promoção server-side — revisar a checagem de `isAnonymous` em conjunto quando as rotas do backoffice escreverem dados (tickets 18+).
- **Cast `as UserRole` no `get-session`** (plan-mandated): o Better Auth digita additional fields como `string`; um valor fora do enum gravado direto no banco vazaría como `role` inválido — exposição confinada porque o guard falha fechado (`!== 'organizer'`).
- **Teste de hijack do signup** não distingue o `input: false` (strip do payload) da default do banco: o outcome observado (`buyer`) é o que a spec pede; a distinção é implícita.
- **Migração gerada sem newline final** (`0012_perpetual_xorn.sql`): formato de saída do drizzle-kit, cosmético.
- **Promotion tool:** select-then-update em vez de `update().returning()` único (deliberado — o select distingue `not_found` sem query extra); um throw inesperado (ex.: pool fora) vira unhandled rejection com exit ≠ 0 sem mensagem amigável (o `seed.ts` faz catch); com argv vazio a mensagem sai sem o e-mail.
- **Web:** copy extra não prevista no plano (rótulo "Organizador" acima da nav e parágrafo do painel); `layout.spec` usa mock hand-rolled do hook `useSession` (a forma real do payload é exercida pelos testes MSW do `auth-menu`); assertion de posição do link no `auth-menu.spec` via `nextElementSibling`.
- **E2E:** e-mail interpolado em SQL do helper `promoteOrganizerByEmail` sem escape SQL (mesma exposição dos helpers pré-existentes; inputs são controlados pelo teste); contexts fechados sem `finally` (o Playwright revida no fim do teste).
- **Rota:** a rota checa `!session` antes do guard, então o ramo `not_authenticated` do guard só é exercido pela spec unitária — redundância defensiva e legível.
