import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { approvePayment } from './helpers/checkout';
import { restoreSeat } from './helpers/db';
import {
  deleteOrdersByBuyer,
  deletePaymentEvents,
  readLatestOrder,
} from './helpers/orders';

const EVENT_PATH = '/events/o-fantasma-da-opera';
const buyerEmails = new Set<string>();
const providerEventIds = new Set<string>();

test.afterEach(() => {
  restoreSeat('1');
  deleteOrdersByBuyer([...buyerEmails]);
  deletePaymentEvents([...providerEventIds]);
  buyerEmails.clear();
  providerEventIds.clear();
});

test('compra libera o ingresso digital com QR Code na conta', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const email = `comprador-conta-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';
  buyerEmails.add(email);

  await registerVerifiedBuyer(page, { email, password });

  restoreSeat('1');

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await page.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page.getByText('Total: R$ 132,00')).toBeVisible();
  await page.getByRole('button', { name: 'Pagar' }).click();

  const panel = page.getByRole('region', { name: 'Pagamento simulado' });
  await expect(panel).toBeVisible();

  const order = readLatestOrder();
  await expect(panel.locator('code')).toHaveText(order.providerRef);

  const eventId = await approvePayment(request, order);
  providerEventIds.add(eventId);

  await expect(page.getByText('Pedido confirmado')).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`${WEB}/conta`);
  await expect(
    page.getByRole('heading', { name: 'Meus pedidos' }),
  ).toBeVisible();

  const orderLink = page.getByRole('link', { name: /O Fantasma da Ópera/ });
  await expect(orderLink).toContainText('Pagamento confirmado');
  await expect(orderLink).toContainText('1 ingresso');
  await orderLink.click();

  await expect(page).toHaveURL(`${WEB}/conta/pedidos/${order.id}`);
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Válido para entrada', { exact: true }),
  ).toBeVisible();

  const qrCode = page.getByRole('figure', { name: 'QR Code do ingresso' });
  await expect(qrCode).toBeVisible();
  await expect(
    qrCode.locator('svg[aria-label="QR Code do ingresso"]'),
  ).toBeVisible();
  await expect(qrCode.locator('code')).toHaveText(/^[\w-]{16,}$/);
});
