# 10: Mapa de assentos (setor → fila → cadeira)

**What to build:** Na página do evento, o comprador vê a estrutura real do local — setores com preço e disponibilidade, filas e cadeiras dentro do setor escolhido — e seleciona seu assento, ou usa "melhor lugar disponível" para deixar o sistema escolher por ele.

**Blocked by:** 06 (Página de evento)

**Status:** ready-for-agent

- [ ] Schema de locais com setores, filas e cadeiras, com fixtures seedadas coerentes com os eventos
- [ ] Endpoint REST de disponibilidade e preço por assento (estado por cadeira), schema Zod compartilhado
- [ ] UI de seleção em hierarquia setor → fila → cadeira, com estados por assento (livre/ocupado/indisponível)
- [ ] "Melhor lugar disponível": escolhe o melhor assento livre do setor preferido em um clique
- [ ] Testes: integração da rota de disponibilidade, unitários da regra de melhor lugar, componente com MSW, E2E de escolher assento
