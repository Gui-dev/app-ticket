# 12: Carrinho de evento único

**What to build:** O comprador monta o pedido do evento com a quantidade e os tipos de ingresso (inteira, meia, VIP) escolhidos, vê o contador de expiração sincronizado com a reserva dos assentos, e o carrinho se comporta como um só evento — ao adicionar de outro evento, o fluxo recomeça em vez de misturar.

**Blocked by:** 11 (Reserva de assento com TTL)

**Status:** ready-for-agent

- [ ] Carrinho atrelado a um único evento, com TTL espelhando a reserva de assentos
- [ ] Seleção de quantidade e tipo de ingresso (inteira, meia por honra, VIP) com preços corretos
- [ ] UI de carrinho com contagem regressiva e resumo dos itens
- [ ] Ao expirar, o carrinho some e os assentos são liberados junto com a reserva
- [ ] Testes: unitários de totais/tipos, componente com MSW, E2E de adicionar → expirar → ver assento liberado
