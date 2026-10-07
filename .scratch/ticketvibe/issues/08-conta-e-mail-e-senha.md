# 08: Conta: e-mail e senha

**What to build:** O visitante se cadastra com e-mail e senha, confirma o e-mail (recebe o link no Mailpit), entra na sessão, recupera a senha esquecida e acessa sua conta — o fluxo completo de identidade que habilita a compra futura.

**Blocked by:** 01 (Base do monorepo + ambiente local)

**Status:** ready-for-agent

- [ ] Better Auth configurado sobre o Postgres, provider e-mail+senha
- [ ] Cadastro com confirmação de e-mail; e-mails visíveis no Mailpit (comando de dev documentado)
- [ ] Login, logout e recuperação de senha funcionais
- [ ] Sessão persistida e reconhecida pelo web (estado de "Entrar" no cabeçalho)
- [ ] Testes: integração dos fluxos de auth (Postgres real), componente de login/cadastro com MSW, E2E de cadastro → confirmação via API do Mailpit → login
