# 15: Ingresso digital com QR Code + histórico de pedidos

**What to build:** O comprador acessa sua conta e vê todo o histórico de pedidos; abrindo um pedido, encontra seus ingressos digitais com QR Code prontos para a entrada no evento.

**Blocked by:** 14 (E-mail de confirmação de compra)

**Status:** ready-for-agent

- [ ] Rota REST de histórico de pedidos do usuário autenticado, schema Zod compartilhado
- [ ] Geração de QR Code único por ingresso, vinculado ao pedido e ao assento
- [ ] Página de conta com lista de pedidos (status, evento, valores) e detalhe com ingressos renderizando os QR Codes
- [ ] Ingresso de pedido expirado/cancelado não é mais válido para entrada
- [ ] Testes: integração das rotas de pedido, unitários da geração/desvalidação do QR, componente com MSW, E2E de comprar → ver QR na conta
