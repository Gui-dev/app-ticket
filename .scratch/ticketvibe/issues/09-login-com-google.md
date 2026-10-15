# 09: Login com Google

**What to build:** O comprador com conta Google entra em um clique pelo botão do cabeçalho, sem digitar senha, cainho na mesma sessão do fluxo por e-mail — com a conta criada no primeiro acesso.

**Blocked by:** 08 (Conta: e-mail e senha)

**Status:** done

- [x] Provider Google configurado no Better Auth com credenciais de dev locais
- [x] Botão "Entrar com Google" na UI de login
- [x] Primeiro login cria usuário e sessão; logins seguintes reutilizam a conta (mesmo e-mail)
- [x] Contas por e-mail e por Google convergem no mesmo usuário
- [x] Testes: integração do callback de auth, componente do botão, E2E com o provider em modo de teste/simulado

**Implementação:** `40fc834` (provider), `24e0d63`+`1d77d8b` (integração callback simulado), `6baee66`+`ebdab8e` (botão), `1c21085` (E2E + README). Plano: `docs/superpowers/plans/2026-10-13-ticket-09-login-com-google.md`. Gates finais: lint 0, typecheck 5/5, test 43/89/130, playwright 18, build ok, drizzle limpo.

## Deferrals do ticket 09 (registrados no fechamento)

1. **Botão Google fora do `/entrar`** (cabeçalho, `/cadastro`) — decisão D2 do plano.
2. **UX do `/api/auth/error`** — falha de callback manda o usuário para o endpoint cru do Better Auth, sem página nossa.
3. **`AbortSignal.timeout(3000)` do proxy no callback OAuth** — o callback é o primeiro caminho em que o proxy aguenta uma chamada externa (token exchange do Google) dentro do timeout de 3s; estourou → 502 no meio do login e o state é consumido. Fix futuro: timeout maior em `/callback/*` (risco identificado no review final, sem teste).
4. **Env-gate de `GOOGLE_CLIENT_ID`/`SECRET` em produção** — placeholder de dev sobe se o deploy não setar as envs; `??` também aceita env vazia (usar `||`). README já alerta.
5. **UI de vinculação "já logado → entrar com Google"** — comportamento interno do Better Auth, sem UI de conta.
6. **Cobertura residual** — override de env não testado; teste de reuso não conta linhas de `account`; teste de erro usa e-mail que nunca entra no fluxo; state cookie não asserted no browser (E2E); glyph monocromático do "G" (diretrizes Google pedem multicolorido).
