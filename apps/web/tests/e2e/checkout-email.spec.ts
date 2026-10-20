import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { approvePayment } from './helpers/checkout';
import { restoreSeat } from './helpers/db';
import { waitForEmail } from './helpers/mailpit';
import {
  deleteOrdersByBuyer,
  deletePaymentEvents,
  readLatestOrder,
} from './helpers/orders';

const EVENT_PATH = '/events/o-fantasma-da-opera';
const buyerEmails = new Set<string>();
const providerEventIds = new Set<string>();

test.afterEach(() => {
  restoreSeat('6');
  deleteOrdersByBuyer([...buyerEmails]);
  deletePaymentEvents([...providerEventIds]);
  buyerEmails.clear();
  providerEventIds.clear();
});

test('compra dispara o e-mail de confirmação para o comprador', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const email = `comprador-email-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';
  buyerEmails.add(email);

  await registerVerifiedBuyer(page, { email, password });
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Entrar' }),
  ).toBeVisible();

  restoreSeat('6');

  await page.goto(`${WEB}${EVENT_PATH}/ingressos`);
  await page.getByRole('button', { name: 'Cadeira 6, fila A' }).click();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
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

  const message = await waitForEmail(request, email, 'Compra confirmada');
  expect(message.subject).toBe('Compra confirmada: O Fantasma da Ópera');
  expect(message.text).toContain('Total: R$ 132,00');
  expect(message.text).toContain('Plateia · Fila A · Cadeira 6');
});
