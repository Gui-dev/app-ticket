# Spec: TICKETVIBE — Marketplace de ingressos para eventos

Status: ready-for-agent

## Problem Statement

Como comprador de ingressos no Brasil, eu preciso descobrir eventos (shows, teatro, festivais, esportes) perto de mim ou do meu interesse, escolher um lugar específico no local com garantia de que mais ninguém vai comprar o mesmo assento, e concluir a compra com segurança, recebendo meu ingresso digital de forma confiável — sem risco de pagar por um lugar que já foi vendido, sem atravessar um processo de cadastro friccionante e sem depender de plataformas onde a experiência de escolha de assento é obscura ou injusta.

## Solution

O TICKETVIBE (nome provisório) é um marketplace de ingressos em português e em Real, onde o comprador pesquisa e filtra eventos, escolhe seu assento em um mapa interativo de setores/filas/cadeiras, reserva o assento temporariamente (TTL), paga no checkout com cartão ou boleto Stripe (com taxa de serviço explícita) e recebe o ingresso digital com QR Code por e-mail e na sua conta. Do lado dos organizadores, um backoffice cadastra eventos, locais, setores e lotes de preço, acompanha vendas e valida QR Codes na entrada. O diferencial técnico central é a garantia de unicidade do assento: reserva temporária em Redis com expiração, transação de banco na confirmação da compra e atualização da disponibilidade.

## User Stories

### Descoberta (F1)

1. Como visitante, eu quero ver uma home com evento em destaque e uma lista de eventos em alta, para que eu descubra rapidamente o que está acontecendo.
2. Como visitante, eu quero buscar eventos por artista, nome do evento, local ou cidade, para que eu encontre o que procuro sem saber a categoria.
3. Como visitante, eu quero filtrar eventos por categoria (shows, esportes, teatro, festivais, comédia, infantil, dança), para que eu veja apenas o tipo de evento que me interessa.
4. Como visitante, eu quero filtrar eventos por data, para que eu encontre opções para o dia em que estou disponível.
5. Como visitante, eu quero filtrar eventos por localização (cidade/estado), para que eu veja eventos perto de mim.
6. Como visitante, eu quero abrir a página de um evento com descrição, local, data e faixas de preço, para que eu avalie se quero comprar.
7. Como visitante, eu quero abrir a página de um artista e ver todos os eventos relacionados a ele, para que eu acompanhe todas as datas dele.
8. Como visitante, eu quero abrir a página de um local (casa de show/teatro) e ver os eventos daquele espaço, para que eu descubra o que passa no meu local favorito.
9. Como visitante, eu quero ver a disponibilidade e o preço por setor na página do evento, para que eu tenha uma ideia do custo antes de escolher meu assento.

### Conta e autenticação (F1)

10. Como visitante, eu quero me cadastrar com e-mail e senha, para que eu tenha uma conta para comprar.
11. Como visitante, eu quero entrar com minha conta Google, para que eu compre sem digitar senha.
12. Como comprador, eu quero confirmar meu e-mail no cadastro, para que minha conta seja segura.
13. Como comprador, eu quero recuperar minha senha por e-mail, para que eu não fique travado se esquecê-la.
14. Como comprador, eu quero ver meu histórico de pedidos na conta, para que eu encontre minhas compras antigas.

### Escolha de ingressos e mapa de assentos (F2)

15. Como comprador, eu quero ver o mapa do evento em hierarquia setor → fila → cadeira, para que eu escolha meu lugar com precisão.
16. Como comprador, eu quero ver a disponibilidade e o preço de cada assento no mapa, para que eu escolha conforme meu orçamento.
17. Como comprador, eu quero uma opção de "melhor lugar disponível", para que eu compre rápido sem estudar o mapa.
18. Como comprador, eu quero escolher a quantidade e o tipo de ingresso (inteira, meia, VIP), para que eu compre conforme minha necessidade.
19. Como comprador, eu quero que a meia-entrada funcione por sistema de honra (sem comprovação), para que eu possa comprar meu meia sem burocracia.
20. Como comprador, eu quero que meu assento escolhido seja reservado temporariamente com contagem regressiva de ~10 minutos, para que ninguém mais compre o mesmo lugar enquanto decido.
21. Como comprador, eu quero que o sistema impeça dois compradores de adquirirem o mesmo assento, mesmo acessando ao mesmo tempo, para que minha compra seja sempre válida.
22. Como comprador, eu quero ver, ao abrir o mapa, quais assentos já foram tomados por outros compradores, para que eu não escolha um lugar indisponível.

### Carrinho e checkout (F2)

23. Como comprador, eu quero um carrinho de evento único com contador de expiração, para que a reserva do assento tenha um prazo claro e justo.
24. Como comprador, eu quero ver o resumo do pedido com preço, taxa de serviço e total, para que eu saiba exatamente quanto vou pagar.
25. Como comprador, eu quero que a taxa de serviço seja cobrada de mim (comprador) e exibida explicitamente no checkout, para que não haja surpresa no total.
26. Como comprador, eu quero pagar com cartão de crédito, para que eu use meu meio preferido.
27. Como comprador, eu quero pagar com boleto, para que eu pague mesmo sem cartão.
28. Como comprador, eu quero pagar com Pix quando o projeto estiver no modo live do Stripe, para que eu pague na hora pelo meio mais usado no Brasil.
29. Como comprador, eu quero que a confirmação do pagamento libere meu assento definitivamente dentro da transação do banco, para que o lugar seja garantidamente meu.
30. Como comprador, eu quero que uma falha ou estouro do TTL de reserva libere o assento automaticamente, para que nenhum lugar fique bloqueado para sempre.

### Pós-compra (F3)

31. Como comprador, eu quero receber um e-mail de confirmação com meus ingressos, para ter a prova da compra.
32. Como comprador, eu quero ver meu ingresso digital com QR Code na minha conta, para que eu entre no evento mesmo sem e-mail disponível.
33. Como comprador, eu quero ver o status e os detalhes de cada pedido (evento, assentos, valores, pagamento), para que eu tenha tudo organizado.
34. Como comprador, eu quero cancelar ou solicitar reembolso de um pedido quando o evento permitir, seguindo as regras do evento, para que eu tenha proteção se os planos mudarem.
35. Como comprador, eu quero que a disponibilidade de assentos se atualize em tempo real (WebSocket) enquanto eu escolho, para que eu veja lugares sendo ocupados sem recarregar a página.

### Organizador / backoffice (F4)

36. Como organizador, eu quero me cadastrar com papel de organizador na plataforma, para que eu possa vender meus eventos.
37. Como organizador, eu quero cadastrar eventos com descrição, data, local e categorias, para que meus eventos apareçam na descoberta.
38. Como organizador, eu quero cadastrar locais, setores, filas e cadeiras, para que o mapa de assentos reflita o meu espaço.
39. Como organizador, eu quero cadastrar lotes de preço por setor e período, para que eu faça precificação por lote como na bilheteria tradicional.
40. Como organizador, eu quero ver relatórios de vendas (ingressos, receita, por período), para que eu acompanhe o desempenho do meu evento.
41. Como organizador, eu quero validar QR Codes de ingressos na entrada (leitura por câmera), para que eu controlo o acesso ao evento.
42. Como organizador, eu quero definir as regras de cancelamento/reembolso do meu evento, para que o reembolso siga a política que eu escolhi.
43. Como organizador, eu quero receber meus repasses via Stripe Connect com split automático e a taxa da plataforma descontada, para que eu receba sem conciliação manual.
44. Como plataforma, eu quero que cada venda calcule e separe a minha platform fee, para que a receita do marketplace seja rastreável por pedido.

### Qualidade e operação (transversal)

45. Como desenvolvedor, eu quero que a API sirva documentação Swagger gerada dos schemas Zod via Scalar em `/docs`, para que o contrato esteja sempre visível e atualizado.
46. Como desenvolvedor, eu quero que os schemas Zod compartilhados sejam a única fonte de verdade do contrato, para que front e back nunca divirjam silenciosamente.
47. Como desenvolvedor, eu quero subir todo o ambiente local (Postgres, Redis, Mailpit) com Podman a partir do repositório, para que o projeto rode em qualquer máquina com um comando.
48. Como desenvolvedor, eu quero testes automatizados em três níveis (unitário, integração e E2E), para que eu mude o código com confiança.
49. Como desenvolvedor, eu quero documentação de componentes no Storybook, para que a UI tenha um catálogo navegável e testável isoladamente.
50. Como desenvolvedor, eu quero lint/format com Biome e gates no pre-commit/pre-push via Lefthook, para que a qualidade seja aplicada antes do push.

## Implementation Decisions

- **Arquitetura de repositório**: Turborepo + pnpm workspace com `apps/web` (Next.js), `apps/api` (Fastify), `apps/worker` (BullMQ) e `packages/shared` (schemas Zod, tipos e erros de domínio compartilhados).
- **Contrato web↔API**: REST validado com Zod; `packages/shared` é a fonte única dos schemas de request/response. A API usa o Fastify com provider de tipo Zod, e o OpenAPI é gerado desses schemas.
- **Documentação de API**: Swagger + Scalar servidos na rota `/docs` da API, a partir do OpenAPI gerado — nunca escrito à mão.
- **Persistência**: PostgreSQL + Drizzle ORM. Busca por artista/evento/local/cidade com full-text search do próprio Postgres (`tsvector`/`pg_trgm`), sem serviço de busca externo.
- **Autenticação**: Better Auth sobre o mesmo banco, métodos e-mail+senha e Google. Um único usuário com papel (`organizer`) para o backoffice — sem sistema de contas separado.
- **Cache/filas/reserva**: Redis para TTL de reserva de assento e como broker das filas BullMQ. Worker roda como processo separado da API.
- **Desafio central — unicidade do assento**: reserva temporária do assento no Redis com TTL (~10 min) + transação no banco na confirmação da compra (lock/seletiva condicional) impedindo venda duplicada; liberação automática na expiração do TTL ou falha do pagamento. Jobs do worker: expirar reservas, enviar e-mails, processar webhook Stripe idempotente.
- **Mapa de assentos**: hierarquia setor → fila → cadeira (sem render SVG cadeira-a-cadeira na v1; evolução possível sem mudar o modelo de dados). Opção "melhor lugar disponível" por setor.
- **Carrinho**: um evento por carrinho, com contador de expiração (~10 min) igual ao TTL da reserva.
- **Pagamentos**: Stripe em modo sandbox desde a F2, com camada de pagamento abstraída por interface + implementação Stripe. Meios: cartão e boleto; Pix habilita ao ir para o modo live. Stripe Connect (split + platform fee) modelado desde o schema de pedidos da F2, ativo na F4.
- **Taxa de serviço**: cobrada do comprador, somada no checkout, exibida explicitamente no resumo do pedido.
- **E-mail**: Mailpit no ambiente de estudo (dev local); provedor de produção adiado para o go-live.
- **Real-time**: F2 usa polling de disponibilidade ao interagir; WebSocket (rooms por evento) entra na F3, com a infra nascendo na API desde a F2.
- **Idioma/moeda**: pt-BR e BRL fixos, sem i18n.
- **UI**: Shadcn/ui + Tailwind no `apps/web`, tema alinhado aos mockups em `docs/layout/` (escuro, verde/roxo). Storybook com stories co-localizados para componentes que renderizam sem dado externo (design system, cards, inputs); sem stories de composição de página.
- **Qualidade**: Biome no lugar de ESLint+Prettier; Lefthook com pre-commit = `biome check` (staged) e pre-push = typecheck + testes unitários (E2E fica para o CI/manual); convenções SOLID nos módulos da API (padrão hexagonal: domínio, infra, casos de uso, rotas).
- **Ambiente local**: Podman (compose) para Postgres, Redis e Mailpit; `pnpm dev` para os apps. Seed fixtures versionados para venues/setores/cadeiras (usadas também nos E2E).
- **Fases**: F1 descoberta+conta → F2 mapa de assentos+reserva+checkout → F3 QR+pós-compra+WS → F4 backoffice+reembolso+Connect.
- **Tipos de ingresso**: inteira, meia (sistema de honra, sem verificação) e VIP.
- **Modelo de carrinho/assinatura de teste**: projeto de estudo — tudo roda local, sem deploy de produção no escopo desta spec.

## Testing Decisions

- **O que torna um bom teste**: testar apenas comportamento externo (HTTP status/corpo, efeitos no banco, estado renderizado, fluxo no navegador) — nunca detalhes de implementação interna (chamadas privadas, estrutura de classes).
- **Seam primário**: o contrato Zod em `packages/shared` é o seam único entre front e back; os outros testes penduram nele.
- **Unidade nos casos de uso (API)**: hexagonal com repositórios in-memory para lógica pura — cálculo de taxa e totais, regra de TTL da reserva, "melhor lugar disponível", transições de estado do pedido. Prior art: padrão `use-cases/*.spec.ts` co-localizado do projeto anterior.
- **Integração de rota (API)**: Fastify + Postgres real (banco de teste local via Podman), cobrindo contrato das rotas e os casos de corrida — dois compradores disputando o mesmo assento, expiração de reserva, idempotência do webhook Stripe. Prior art: `test-helpers` (`resetDatabase`, `seedTestData`) do projeto anterior.
- **Componentes web**: React Testing Library + MSW, handlers MSW implementando os schemas Zod do contrato. Prior art: handlers `products/cart/auth` e specs de componentes do projeto anterior.
- **E2E**: Playwright contra a stack real local — fluxo crítico de compra com mapa de assentos, conflito de assento (dois navegadores), expiração de carrinho, recebimento do e-mail via API do Mailpit, leitura do QR. Prior art: `tests/e2e/*` e helpers de Mailpit/Webhook HMAC do projeto anterior.
- **Storybook**: serves como catálogo e harness de desenvolvimento dos componentes; testes visuais automatizados fora do escopo.
- **Gates**: Biome + typecheck + unitários no Lefthook; cobertura incremental seguindo as diretrizes em `docs/TESTING.md`.

## Out of Scope

- Deploy de produção, CI em nuvem e provedor de e-mail transacional (Mailpit local por enquanto).
- Pix (habilita ao migrar para o modo live do Stripe).
- i18n, multi-moeda e versão em inglês.
- Render SVG cadeira-a-cadeira do mapa (evolução futura da F3; F2/F3 usam setor→fila→cadeira).
- Carrinho multi-evento.
- Verificação de meia-entrada (upload de comprovação); sistema de honra.
- Validação de QR offline (sem rede) no backoffice.
- Marketplace de múltiplos sellers ativo desde o início (Stripe Connect modelado, operação de split ativa na F4).
- Sistema de chat/suporte, recomendações personalizadas, app mobile nativo.
- Testes visuais automatizados (Chromatic etc.).

## Further Notes

- **Pendência encerrada (ticket 02, 2026-10-07)**: `docs/TESTING.md` e `docs/skills/*` foram adaptados ao TICKETVIBE; sweep com `rg` confirma zero referências ao projeto anterior (`kronostore`).
- Os mockups de referência estão em `docs/layout/` (home e "Eventos em Alta") e devem guiar a identidade visual da F1.
- A numeração de fases (F1–F4) é a ordem de execução acordada; cada fase é quebrável em tickets independentes via `to-tickets`.
