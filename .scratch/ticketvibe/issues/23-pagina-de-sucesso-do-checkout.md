# 23: Página de sucesso do checkout e tema noturno do Stripe

**What to build:** Ao concluir o pagamento do cartão, o comprador é levado a uma página de sucesso com as principais informações do pedido (evento, assentos, sub-/total) e CTA **Ver meus ingressos** — reutilizando a página de retorno `/events/{slug}/checkout/retorno` (que já existia para o fluxo de boleto) — e o formulário do Stripe ganha o tema `night`, coerente com o app dark.

**Blocked by:** 13 (Checkout Stripe cartão e boleto)

**Status:** done

- [x] Cartão: `confirmPayment` com sucesso navega para `/events/{slug}/checkout/retorno?order={id}` (em vez de ficar na mesma página sem feedback)
- [x] Página de retorno reformulada: pol "Compra concluída" quando o pedido paga; "Estamos conferindo seu pagamento" durante o intervalo confirm→webhook; CTA na confirmação
- [x] Formulário Stripe com `appearance.theme: 'night'`
- [x] Specs: navegação pós-confirm + options do Elements (checkout-flow) e estados da página de sucesso (order-status)

## Implementação

| Commit | Escopo |
|---|---|
| `658a933` | checkout-flow (push pós-confirm + `appearance.theme: 'night'`), página de retorno sem heading estático, OrderStatus com headings por status + CTA "Ver meus ingressos", specs |

Verificação: 400 specs web + 650 API, typecheck, lint, CI verde (run `42395415493`).
