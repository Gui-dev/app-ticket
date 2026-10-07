# 09: Login com Google

**What to build:** O comprador com conta Google entra em um clique pelo botão do cabeçalho, sem digitar senha, cainho na mesma sessão do fluxo por e-mail — com a conta criada no primeiro acesso.

**Blocked by:** 08 (Conta: e-mail e senha)

**Status:** ready-for-agent

- [ ] Provider Google configurado no Better Auth com credenciais de dev locais
- [ ] Botão "Entrar com Google" na UI de login
- [ ] Primeiro login cria usuário e sessão; logins seguintes reutilizam a conta (mesmo e-mail)
- [ ] Contas por e-mail e por Google convergem no mesmo usuário
- [ ] Testes: integração do callback de auth, componente do botão, E2E com o provider em modo de teste/simulado
