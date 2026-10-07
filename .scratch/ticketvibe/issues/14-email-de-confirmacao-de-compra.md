# 14: E-mail de confirmação de compra

**What to build:** Logo após o pagamento confirmado, o comprador recebe um e-mail com a confirmação do pedido e seus ingressos, visualizando a mensagem no Mailpit durante o desenvolvimento — sem o e-mail atrasar ou perder a compra.

**Blocked by:** 13 (Checkout Stripe)

**Status:** ready-for-agent

- [ ] Job BullMQ no worker enviado após confirmação do pagamento (desacoplado do checkout)
- [ ] E-mail de confirmação com resumo do pedido e ingressos, entregue no Mailpit em dev
- [ ] Reentrega do job (retry) não envia e-mail duplicado para o mesmo pedido
- [ ] Falha de envio é observável e reprocessável, sem travar a compra
- [ ] Testes: unitários do template/dados do e-mail, integração do job (fila real), E2E de comprar → e-mail aparece na API do Mailpit
