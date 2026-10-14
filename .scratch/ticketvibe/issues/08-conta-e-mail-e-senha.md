# 08: Conta: e-mail e senha

**What to build:** O visitante se cadastra com e-mail e senha, confirma o e-mail (recebe o link no Mailpit), entra na sessão, recupera a senha esquecida e acessa sua conta — o fluxo completo de identidade que habilita a compra futura.

**Blocked by:** 01 (Base do monorepo + ambiente local)

**Status:** done

- [x] Better Auth configurado sobre o Postgres, provider e-mail+senha
- [x] Cadastro com confirmação de e-mail; e-mails visíveis no Mailpit (comando de dev documentado)
- [x] Login, logout e recuperação de senha funcionais
- [x] Sessão persistida e reconhecida pelo web (estado de "Entrar" no cabeçalho)
- [x] Testes: integração dos fluxos de auth (Postgres real), componente de login/cadastro com MSW, E2E de cadastro → confirmação via API do Mailpit → login

## Deferrals do ticket 08 (registrados no fechamento do 08)

- **`signOut` sem tratamento de erro** — `auth-menu.tsx` faz `await authClient.signOut()` sem try/catch; falha de transporte vira unhandled rejection e o refresh não roda (mesmo padrão já corrigido nos 4 forms). Fix de 3 linhas quando houver ocasião.
- **`role="status"`/`aria-live` nos success states** — "Verifique seu e-mail", "Link enviado", "Senha alterada" não anunciam a troca de estado para screen reader (padrão já usado em `header-search.tsx`).
- **Branch morta `PASSWORD_TOO_SHORT` no login-form** — better-auth não devolve esse code no sign-in (só no sign-up); mapeamento permanece correto por consistência.
- **`trustedOrigins` hardcoded** — `['http://localhost:3000', 'http://127.0.0.1:3000']` vai para o bundle de produção; env-gate quando houver deploy real.
- **Teste negativo de origin não commitado** — hostile origin → 403 `INVALID_ORIGIN` foi verificado ad-hoc, não virou teste de regressão (o positivo 127.0.0.1 está coberto).
- **`AbortSignal.timeout(3000)` no proxy vs SMTP real** — com SMTP de verdade (fora do Mailpit local) um sign-up pode 502 no proxy depois de o e-mail ter sido aceito; aumentar timeout ou isolar sign-up quando houver infra de e-mail real.
- **Duplicação entre os 4 forms** — bloco `role="alert"` + `try/catch/finally` repetidos; extrair `AuthErrorAlert` + `useAuthSubmit` se um 5º form aparecer (`formatAuthError` já foi para `lib/auth-errors.ts`).
- **`redirectTo` inerte no `requestPasswordReset`** — o link do e-mail de reset é montado pelo override custom (D6) e ignora o `redirectTo` do client; mantido por contrato com o Better Auth, mas é código morto hoje.
