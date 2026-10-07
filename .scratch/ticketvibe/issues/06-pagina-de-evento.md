# 06: Página de evento

**What to build:** O visitante abre um evento e encontra tudo o que precisa para decidir a compra: descrição, data, local (com cidade), categorias e a faixa de preço por setor, além do caminho para escolher ingressos.

**Blocked by:** 04 (Seed de eventos + home)

**Status:** ready-for-agent

- [ ] Endpoint REST de detalhe do evento com setores e preços por setor, schema Zod compartilhado
- [ ] Página de evento no web: descrição, data, local, categorias, preços "a partir de" por setor
- [ ] CTA que leva à escolha de ingressos (pode apontar para a próxima fase até lá existir)
- [ ] Estados de carregamento e de evento inexistente tratados
- [ ] Testes: integração da rota, componente com MSW, E2E de navegação home → evento
