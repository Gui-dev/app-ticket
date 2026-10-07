# 11: Reserva de assento com TTL

**What to build:** Assim que o comprador seleciona um assento, ele fica reservado no nome da sessão com contagem regressiva de ~10 minutos; mais ninguém consegue comprar aquele assento durante a reserva; ao expirar (ou o comprador desistir), o assento volta a ficar livre — e dois compradores disputando o mesmo assento ao mesmo tempo nunca ambos vencem.

**Blocked by:** 10 (Mapa de assentos)

**Status:** ready-for-agent

- [ ] Reserva em Redis com TTL (~10 min) atrelada à sessão do comprador
- [ ] Contagem regressiva visível na UI de assento, com avisos de renovação/desistência
- [ ] Job do worker expira reservas e devolve os assentos ao mapa
- [ ] Assento reservado aparece como ocupado para os demais compradores (polling da F2)
- [ ] Teste de corrida obrigatório: dois compradores, mesmo assento, exatamente um vence (integração, Postgres real + Redis)
