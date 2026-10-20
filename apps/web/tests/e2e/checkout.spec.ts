import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { approvePayment } from './helpers/checkout';
import { backdateHold, readSeatStatus, restoreSeat } from './helpers/db';
import {
  deleteOrdersByBuyer,
  deletePaymentEvents,
  readLatestOrder,
  readOrderStatus,
} from './helpers/orders';

const EVENT_PATH = '/events/o-fantasma-da-opera';
const buyerEmails = new Set<string>();
const providerEventIds = new Set<string>();

test.afterEach(() => {
  restoreSeat('1');
  restoreSeat('4');
  deleteOrdersByBuyer([...buyerEmails]);
  deletePaymentEvents([...providerEventIds]);
  buyerEmails.clear();
  providerEventIds.clear();
});

test('completa a compra quando o webhook de pagamento é aprovado', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const email = `comprador-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';
  buyerEmails.add(email);

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

  const eventId = await approvePayment(request, order);
  providerEventIds.add(eventId);

  await expect(page.getByText('Pedido confirmado')).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cadeira 1, fila A' }),
  ).toBeDisabled();
});

test('falha e libera o assento quando o pagamento chega após a reserva expirar', async ({
  page,
  context,
  browser,
  request,
}) => {
  test.setTimeout(60_000);

  const email = `comprador-expirado-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';
  buyerEmails.add(email);

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
  await expect(seatmap.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await seatmap.close();

  expect(readSeatStatus('4')).toBe('available');

  const eventId = await approvePayment(request, order);
  providerEventIds.add(eventId);

  await expect(page.getByText('Pagamento não confirmado')).toBeVisible({
    timeout: 15_000,
  });
  expect(readOrderStatus(order.id)).toBe('failed');

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();

  const anonymous = await (await browser.newContext()).newPage();
  await anonymous.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await expect(
    anonymous.getByRole('button', { name: 'Cadeira 4, fila A' }),
  ).toBeEnabled();
  await anonymous.context().close();
});
