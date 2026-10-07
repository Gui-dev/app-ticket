# 17: Papel organizador + área do organizador

**What to build:** O usuário que atua como organizador tem seu papel na conta e acessa uma área de backoffice separada da experiência de comprador, com as rotas protegidas por papel — negando o acesso a quem não é organizador.

**Blocked by:** 08 (Conta: e-mail e senha)

**Status:** ready-for-agent

- [ ] Papel `organizer` no mesmo usuário Better Auth (sem sistema de contas separado)
- [ ] Meio de promover usuário a organizador no ambiente de estudo (seed/ferramenta local)
- [ ] Área do organizador com layout próprio e rotas protegidas por papel
- [ ] Usuário comum é redirecionado/negado nas rotas do backoffice
- [ ] Testes: integração das guards de papel, componente da navegação, E2E de organizador logado acessar e comprador ser bloqueado
