# 21: Regras de cancelamento/reembolso

**What to build:** O organizador define a política de cancelamento do evento; dentro dela, o comprador pode cancelar/solicitar reembolso de um pedido pela sua conta, recebendo o desfecho (reembolso concedido/negado conforme a regra) — e o assento cancelado volta a ficar disponível.

**Blocked by:** 18 (CRUD de eventos, locais, setores e lotes), 15 (Ingresso digital com QR)

**Status:** closed

- [x] Política de cancelamento por evento configurável no backoffice (janela, percentual)
- [x] Fluxo de cancelamento/reembolso na conta do comprador, com validação contra a política
- [x] Efeito no estado: pedido cancelado, QR invalidado, assento liberado novamente
- [x] Reembolso no Stripe sandbox correspondente ao pedido pago
- [x] Testes: unitários das regras de janela/percentual, integração do fluxo completo, E2E de cancelar → ver assento livre
