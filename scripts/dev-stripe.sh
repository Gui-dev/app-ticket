#!/bin/sh
# Encaminha os webhooks do Stripe para a API local e sincroniza o secret
# do .env (cada sessão de `stripe listen` gera um secret novo).
set -eu

LOG=/tmp/ticketvibe-stripe-listen.log
ENV_FILE=apps/api/.env

# OBEY a conta do app (e não a do `stripe login` do config do CLI): listener
# amarrado a STRIPE_SECRET_KEY, senão os eventos de compra nunca chegam.
STRIPE_KEY=$(sed -n 's/^STRIPE_SECRET_KEY=//p' "$ENV_FILE")
if [ -z "$STRIPE_KEY" ]; then
  echo "STRIPE_SECRET_KEY ausente em $ENV_FILE" >&2
  exit 1
fi

pkill -f 'stripe listen' 2>/dev/null || true
rm -f "$LOG"

# Tipos exclusivamente os que apps/api/src/modules/payments/infra/stripe-event-mapper.ts mapeia;
# no CLI 1.55+ é obrigatório explicitar (--events, --all-snapshot ou --all-thin).
stripe listen \
  --api-key "$STRIPE_KEY" \
  --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled \
  --forward-to localhost:3001/webhooks/stripe 2>&1 | tee "$LOG" &
LISTEN_PID=$!

n=0
until grep -q 'whsec_' "$LOG" 2>/dev/null || [ "$n" -ge 10 ]; do
  sleep 1
  n=$((n + 1))
done

NEW_WHSEC=$(grep -oE 'whsec_[A-Za-z0-9]+' "$LOG" | head -1 || true)
if [ -n "$NEW_WHSEC" ] && [ -f "$ENV_FILE" ]; then
  sed -i "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$NEW_WHSEC|" "$ENV_FILE"
  echo "[webhook] STRIPE_WEBHOOK_SECRET atualizado em $ENV_FILE ($NEW_WHSEC). Reinicie a API (pnpm dev) se ela já estava no ar."
fi

wait "$LISTEN_PID"
