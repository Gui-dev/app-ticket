# 16: WebSocket de disponibilidade de assentos

**What to build:** Enquanto o comprador está escolhendo assento, ele vê lugares sendo ocupados e liberados em tempo real (sem recarregar), porque a API notifica todos os que assistem ao mesmo evento — substituindo o polling da F2.

**Blocked by:** 11 (Reserva de assento com TTL)

**Status:** ready-for-agent

- [ ] Endpoint WebSocket na API com rooms por evento
- [ ] Eventos publicados a cada mudança de disponibilidade (reserva, expiração, compra)
- [ ] Mapa de assentos assina o WebSocket e atualiza os estados sem polling
- [ ] Reconexão e fallback: se o WS cair, o comportamento degrada para o polling existente
- [ ] Testes: unitários do fan-out por room, integração do handshake/evento, E2E de dois navegadores vendo a mesma ocupação
