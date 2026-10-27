# 20: Validação de QR na entrada

**What to build:** Na porta do evento, o organizador lê o QR Code do ingresso com a câmera e recebe na hora o veredito: válido (e já usado ou não) ou inválido — com dupla leitura do mesmo ingresso sendo detectada.

**Blocked by:** 15 (Ingresso digital com QR), 17 (Papel organizador)

**Status:** done

- [x] Endpoint de validação de QR restrito a organizador, que marca o ingresso como usado de forma atômica
- [x] Respostas distintas: válido (novo), inválido (QR inexistente/ingresso de evento errado) e já utilizado (com horário/quem validou)
- [x] UI de leitura por câmera no backoffice com feedback claro (sucesso/erro/duplicado)
- [x] Falha de rede não marca o ingresso como usado indevidamente
- [x] Testes: integração da corrida de dupla validação, componente da câmera com simulação, E2E de validar → revalidar → "já utilizado"

## Implementação

Plano: `docs/superpowers/plans/2026-10-26-ticket-20-validacao-de-qr.md`, executado via subagent-driven development (implementador + revisão de spec/qualidade por task, com revisão final do branch inteiro).

| Task | Commit | Escopo |
|---|---|---|
| 1 | `c2718c5` | Contratos compartilhados: `organizerTicketValidationRecordSchema` (`result` discriminado `valid`/`already_used`/`invalid`, `usedAt` ISO nullable, `usedBy`/`sectorName`/`rowLabel`/`seatLabel`) com refines encadeados (already_used exige horário+quem; demais resultados com nulls), `organizerTicketValidationResponseSchema` (`{ validation }`), `organizerTicketValidateSchema` (`{ code }`); tipos `OrganizerTicketValidationDto`/`OrganizerTicketValidationResponse`/`OrganizerTicketValidate`; spec EN (exceção da casa) |
| 2 | `2ccdc41` | Migração `0014_married_blindfold.sql` (drizzle-kit): `tickets.used_at` e `tickets.validated_by` (nullable). Port `validateTicketForOrganizer` (in-memory + drizzle em paridade): ownership estrito (plataforma/alheio → `forbidden`, inexistente → `not_found`); ingresso desconhecido ou de outro evento → `invalid`; marca atômica em um único `UPDATE tickets SET used_at = now(), validated_by = … WHERE code = … AND used_at IS NULL` (0 linhas → re-select com join `user.name` → `already_used`); assento vem de `order_items`. Use-case pass-through; rota `POST /organizer/events/:id/tickets/validate` guard-first (401/403 de papel → 404 id → 400 corpo) com veredito 200 discriminado — erros HTTP só de sessão/evento/corpo; corrida pinada com duas `app.inject` em `Promise.all` (um `valid`, um `already_used`) |
| 3 | `f180e0c` | Web: dependência `jsqr` (única nova do ticket) com wrapper `decodeQr`; componente `QrScanner` (câmera traseira via `getUserMedia`, `<video playsInline muted>`, laço rAF com `decode` injetável, unmount cancela rAF + para tracks, erro de câmera uma vez); página `/organizador/validacao` — select de eventos próprios, scanner `aria-label="Câmera do scanner"`, entrada manual `Código do ingresso` + `Validar` (desabilitado sem evento), `Selecione um evento antes de validar.`, loading `Validando ingresso…`, vereditos `Ingresso válido.` + `{setor} · Fila {fila} · Assento {assento}`, `Ingresso inválido.`, `Ingresso já utilizado.` + `Utilizado em {data} às {hora} por {nome}.` (`formatDatePtBR` + `Intl` pt-BR/SP); erro `Não foi possível validar o ingresso.` + mensagem mapeada; nav ganha `Validação` e painel ganha o atalho |
| 4 | `db76f9b` | E2E `validate.spec.ts`: organizador cria local + evento + setor (plateia, fila A, 10 lugares, R$ 50) → comprador compra `Cadeira 1, fila A` → checkout (`R$ 55,00`) → `approvePayment` → `Pedido confirmado` → código extraído do figure `QR Code do ingresso` em `/conta/pedidos/[id]` → organizador valida: `Ingresso válido.` + `Plateia · Fila A · Assento 1` → revalida: `Ingresso já utilizado.` + `Utilizado em … por …` → código inventado: `Ingresso inválido.` |
| 5 | (docs) | Gates finais, revisão final do branch e fechamento da issue |

## Gates finais (27/10/2026, HEAD `db76f9b`)

| Gate | Resultado |
|---|---|
| `pnpm lint` | 0 erros (1 info pré-existente em `apps/api/src/db/test-helpers.ts`) |
| `pnpm typecheck` | 5/5 workspaces |
| `pnpm test --force` | API 573 (88 arquivos), web 369 (60 arquivos), shared 138 (1 arquivo) — todos pass, execução fresca |
| Playwright (E2E) | 37/37 (inclui `validate.spec.ts` com a jornada validar → revalidar → inválido) |
| `pnpm build` | ok (rebuild forçado do turbo, sem cache) |

Cobertura dos critérios: endpoint restrito ao organizador dono com marcação atômica (`UPDATE … WHERE used_at IS NULL` único; corrida pina exatamente um `valid`); vereditos distintos 200 discriminado — inválido cobre código inexistente e ingresso de outro evento, já utilizado carrega horário (ISO `usedAt`) e quem validou (`user.name`); UI de câmera com feedback claro (válido/inválido/duplicado + aviso de câmera indisponível com caminho manual); falha não marca — guardas 401/403/404/400 rodam antes de qualquer marca com assert `used_at/validated_by` null no banco, e a marca ocorre uma única vez no servidor (rede no cliente nunca duplica); testes nas três camadas: integração da corrida com injects paralelos, componente da câmera simulado (rAF/stream fakes, `decode` injetado) e E2E porta-a-porta.

## Deferrals do ticket 20

- **Scanner básico:** sem zoom/torch/leitura em segundo plano; decode laço rAF simples; `BarcodeDetector` nativo (só Chromium) fica para depois.
- **Sem histórico de leituras na página:** apenas o último veredito permanece visível; log da sessão da porta é evolução.
- **Sem validação offline:** a porta exige conexão; fila de sincronização é ticket próprio.
- **`invalid` não diferencia motivo:** código desconhecido e ingresso de outro evento devolvem o mesmo `Ingresso inválido.` (o operador da porta não precisa do porquê).
- **Paridade in-memory/drizzle:** in-memory seqüencia `usedBy` com `userId` (user.name não existe no seed); drizzle resolve o nome real. Sem render em prod.
- **Dependência `jsqr`:** única do ticket; decoder positivo (QR real decodificado) exercitado apenas em uso real — o componente cobre lifecycle e assinatura do laço com `decode` injetado.
- **Assert de câmera no E2E:** depende de host sem câmera; execução headed com webcam renderia a linha e ainda falharia o spec (assert scoping fica para sessão futura).
- **Info de lint pré-existente:** `apps/api/src/db/test-helpers.ts:17` (`useTemplate`), fora do escopo deste ticket.
