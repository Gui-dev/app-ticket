# 19: Relatórios de vendas

**What to build:** O organizador vê, por evento e por período, quantos ingressos vendeu e quanto faturou (já separando a taxa da plataforma), respondendo "como foram minhas vendas?" sem consultar o banco.

**Blocked by:** 18 (CRUD de eventos, locais, setores e lotes), 13 (Checkout Stripe)

**Status:** ready-for-agent

- [ ] Endpoint de agregação de vendas por evento/período (ingressos, receita, plataforma fee), restrito ao dono
- [ ] Página de relatórios no backoffice com filtros de período e por evento
- [ ] Valores batem com os pedidos confirmados do checkout (fonte única: pedidos)
- [ ] Testes: integração das agregações com pedidos seedados, componente com MSW, E2E de vender → ver no relatório
