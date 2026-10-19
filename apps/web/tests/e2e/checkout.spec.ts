import { execSync } from 'node:child_process';

import { type APIRequestContext, expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { readLatestOrder, readOrderStatus } from './helpers/orders';
import { signStripeWebhook } from './helpers/stripe';

const API_URL = 'http://127.0.0.1:3001';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
const EVENT_SLUG = 'o-fantasma-da-opera';
const EVENT_PATH = `/events/${EVENT_SLUG}`;
const PLATEIA_ROW_A = `row_id in (select sr.id from seat_rows sr join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = '${EVENT_SLUG}' and s.slug = 'plateia' and sr.label = 'A')`;

function psql(sql: string): string {
  return execSync(
    `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -At -c "${sql}"`,
    { encoding: 'utf8' },
  ).trim();
}

function backdateHold(seatLabel: string): void {
  psql(
    `update seats set hold_expires_at = now() - interval '1 second' where label = '${seatLabel}' and hold_user_id is not null and ${PLATEIA_ROW_A}`,
  );
}

function restoreSeat(seatLabel: string): void {
  const key = psql(
    `select e.id || ':' || sr.id || ':' || se.id from seats se join seat_rows sr on sr.id = se.row_id join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = '${EVENT_SLUG}' and s.slug = 'plateia' and sr.label = 'A' and se.label = '${seatLabel}'`,
  );
  if (key) {
    execSync(`podman exec ticketvibe-redis redis-cli del hold:seat:${key}`, {
      stdio: 'ignore',
    });
  }
  psql(
    `update seats set status = 'available', hold_user_id = null, hold_expires_at = null where label = '${seatLabel}' and ${PLATEIA_ROW_A}`,
  );
}

async function approvePayment(
  request: APIRequestContext,
  order: { providerRef: string; totalCents: number },
): Promise<void> {
  const payload = JSON.stringify({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: order.providerRef,
        amount_received: order.totalCents,
      },
    },
  });
  const response = await request.post(`${API_URL}/webhooks/stripe`, {
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signStripeWebhook(payload, WEBHOOK_SECRET),
    },
    data: payload,
  });
  expect(response.ok()).toBe(true);
}

test.afterEach(() => {
  restoreSeat('1');
  restoreSeat('4');
});

test('completa a compra quando o webhook de pagamento é aprovado', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const email = `comprador-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';

  await registerVerifiedBuyer(page, { email, password });
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Entrar' }),
  ).toBeVisible();

  restoreSeat('1');

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await page.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page.getByText('Entre para finalizar a compra')).toBeVisible();
  await page.getByRole('link', { name: 'Entrar na conta' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(`${WEB}/`);

  await page.goto(`${WEB}${EVENT_PATH}/checkout`);
  await expect(page.getByText('Total: R$ 132,00')).toBeVisible();
  await page.getByRole('button', { name: 'Pagar' }).click();

  const panel = page.getByRole('region', { name: 'Pagamento simulado' });
  await expect(panel).toBeVisible();

  const order = readLatestOrder();
  await expect(panel.locator('code')).toHaveText(order.providerRef);

  await approvePayment(request, order);

  await expect(page.getByText('Pedido confirmado')).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await expect(
    page.getByRole('button', { name: 'Cadeira 1, fila A' }),
  ).toBeDisabled();
});

test('falha e libera o assento quando o pagamento chega após a reserva expirar', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(60_000);

  const email = `comprador-expirado-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';

  await registerVerifiedBuyer(page, { email, password });

  restoreSeat('4');

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await page.getByRole('button', { name: 'Cadeira 4, fila A' }).click();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 4 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page.getByText('Total: R$ 132,00')).toBeVisible();
  await page.getByRole('button', { name: 'Pagar' }).click();

  const panel = page.getByRole('region', { name: 'Pagamento simulado' });
  await expect(panel).toBeVisible();

  const order = readLatestOrder();
  await expect(panel.locator('code')).toHaveText(order.providerRef);

  backdateHold('4');

  const seatmap = await context.newPage();
  await seatmap.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await expect(
    seatmap.getByRole('button', { name: 'Cadeira 4, fila A' }),
  ).toBeEnabled();
  await seatmap.close();

  await approvePayment(request, order);

  await expect(page.getByText('Pagamento não confirmado')).toBeVisible({
    timeout: 15_000,
  });
  expect(readOrderStatus(order.id)).toBe('failed');

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await expect(
    page.getByRole('button', { name: 'Cadeira 4, fila A' }),
  ).toBeEnabled();
});
