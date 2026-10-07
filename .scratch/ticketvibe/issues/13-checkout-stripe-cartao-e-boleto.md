# 13: Checkout Stripe (cartão/boleto)

**What to build:** O comprador logado vê o resumo do pedido com preço, taxa de serviço e total, paga com cartão ou boleto no Stripe (sandbox) e, na confirmação do pagamento, recebe seu pedido confirmado com os assentos definitivamente seus — operação atômica: ou o pagamento confirma e o assento é fixado, ou tudo volta ao estado anterior.

**Blocked by:** 12 (Carrinho de evento único), 08 (Conta: e-mail e senha)

**Status:** ready-for-agent

- [ ] Resumo de checkout exibindo preço, taxa de serviço (cobrada do comprador) e total
- [ ] Camada de pagamento abstraída por interface com implementação Stripe (sandbox: cartão e boleto)
- [ ] Webhook Stripe processado de forma idempotente via worker (reentregas não duplicam pedido)
- [ ] Transação de banco que confirma o pedido e fixa os assentos somente com pagamento aprovado; falha/expiração libera tudo
- [ ] Pedido criado na conta do comprador com valores e status
- [ ] Testes: integração da corrida pagamento×expiração, unitários do cálculo de taxa, E2E de compra completa simulando o webhook
