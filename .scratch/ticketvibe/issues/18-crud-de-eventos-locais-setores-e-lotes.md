# 18: CRUD de eventos, locais, setores e lotes de preço no backoffice

**What to build:** O organizador cadastra e edita pelo backoffice seus eventos, locais, setores (com filas e cadeiras) e lotes de preço — e esses dados alimentam diretamente a descoberta pública e o mapa de assentos do comprador.

**Blocked by:** 17 (Papel organizador), 10 (Mapa de assentos)

**Status:** ready-for-agent

- [ ] CRUD de eventos restrito ao organizador dono (e aos dados da plataforma conforme seed)
- [ ] CRUD de locais com setores, filas e cadeiras
- [ ] CRUD de lotes de preço por setor e período, com vigência
- [ ] Dados criados no backoffice aparecem na busca/página do evento e no mapa de assentos
- [ ] Testes: integração de autorização e regras de lote, componentes com MSW, E2E de criar evento → ver na home
