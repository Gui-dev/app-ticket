# 22: Stripe Connect: split e platform fee

**What to build:** O organizador conecta sua conta Stripe e, a cada venda, o valor cai já dividido: a plataforma retém automaticamente a sua taxa e o organizador recebe o repasse do seu lado — sem conciliação manual.

**Blocked by:** 17 (Papel organizador), 13 (Checkout Stripe)

**Status:** ready-for-agent

- [ ] Onboarding de conta conectada Stripe Connect no backoffice (sandbox)
- [ ] Cobrança em modo split: platform fee separada por pedido desde a origem do pagamento
- [ ] Pedido registra claramente os três valores: bruto, taxa da plataforma, líquido do organizador
- [ ] Falha no repasse fica visível e reprocessável, sem perder a venda
- [ ] Testes: integração do split no fluxo de pagamento, unitários do cálculo da fee, E2E de vender com conta conectada e conferir os valores
