# 20: Validação de QR na entrada

**What to build:** Na porta do evento, o organizador lê o QR Code do ingresso com a câmera e recebe na hora o veredito: válido (e já usado ou não) ou inválido — com dupla leitura do mesmo ingresso sendo detectada.

**Blocked by:** 15 (Ingresso digital com QR), 17 (Papel organizador)

**Status:** ready-for-agent

- [ ] Endpoint de validação de QR restrito a organizador, que marca o ingresso como usado de forma atômica
- [ ] Respostas distintas: válido (novo), inválido (QR inexistente/ingresso de evento errado) e já utilizado (com horário/quem validou)
- [ ] UI de leitura por câmera no backoffice com feedback claro (sucesso/erro/duplicado)
- [ ] Falha de rede não marca o ingresso como usado indevidamente
- [ ] Testes: integração da corrida de dupla validação, componente da câmera com simulação, E2E de validar → revalidar → "já utilizado"
