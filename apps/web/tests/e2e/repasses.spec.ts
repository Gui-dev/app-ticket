import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { approvePayment } from './helpers/checkout';
import { promoteOrganizerByEmail, restoreSeat } from './helpers/db';
import {
  deleteOrdersByBuyer,
  deletePaymentEvents,
  readLatestOrder,
} from './helpers/orders';

const buyerEmails = new Set<string>();
const providerEventIds = new Set<string>();

test.afterEach(() => {
  restoreSeat('1');
  deleteOrdersByBuyer([...buyerEmails]);
  deletePaymentEvents([...providerEventIds]);
  buyerEmails.clear();
  providerEventIds.clear();
});

test('organizador conectado vende, recebe o repasse e vê os valores na tela', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const organizerEmail = `e2e-repasses-organizador-${suffix}@ticketvibe.test`;
  const buyerEmail = `e2e-repasses-comprador-${suffix}@ticketvibe.test`;
  const password = 'senha-forte-123';
  const venueName = 'Teatro E2E Repasses';
  const eventTitle = `Noite de Repasses E2E ${suffix}`;
  const sectorName = 'Plateia';
  const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  buyerEmails.add(buyerEmail);

  const organizerContext = await browser.newContext();
  const organizerPage = await organizerContext.newPage();

  await registerVerifiedBuyer(organizerPage, {
    email: organizerEmail,
    password,
    name: 'Organizador Repasses E2E',
  });

  promoteOrganizerByEmail(organizerEmail);

  await organizerPage.reload();
  await organizerPage
    .getByRole('link', { name: 'Painel do organizador' })
    .click();
  await organizerPage.waitForURL(`${WEB}/organizador`);
  await organizerPage.getByRole('link', { name: 'Repasses' }).click();
  await organizerPage.waitForURL(`${WEB}/organizador/repasses`);
  await expect(
    organizerPage.getByRole('heading', { name: 'Repasses' }),
  ).toBeVisible();
  await expect(
    organizerPage.getByRole('link', { name: 'Conectar Stripe' }),
  ).toBeVisible();
  await expect(organizerPage.getByText('Não conectado')).toBeVisible();

  await organizerPage.reload();
  await expect(
    organizerPage.getByText('Conta conectada; repasse automático'),
  ).toBeVisible();

  await organizerPage
    .getByRole('link', { name: 'Painel', exact: true })
    .click();
  await organizerPage.waitForURL(`${WEB}/organizador`);
  await organizerPage.getByRole('link', { name: 'Locais' }).click();
  await organizerPage.waitForURL(`${WEB}/organizador/locais`);
  await organizerPage.getByRole('button', { name: 'Cadastrar local' }).click();
  await organizerPage.getByLabel('Nome', { exact: true }).fill(venueName);
  await organizerPage.getByLabel('Cidade').fill('São Paulo');
  await organizerPage.getByLabel('Estado').fill('SP');
  await organizerPage.getByRole('button', { name: 'Cadastrar local' }).click();
  await expect(
    organizerPage
      .getByRole('listitem')
      .filter({ hasText: venueName })
      .getByText('São Paulo/SP'),
  ).toBeVisible();

  await organizerPage
    .getByRole('link', { name: 'Painel', exact: true })
    .click();
  await organizerPage.getByRole('link', { name: 'Meus eventos' }).click();
  await organizerPage.waitForURL(`${WEB}/organizador/eventos`);
  await organizerPage.getByRole('link', { name: 'Criar evento' }).click();
  await organizerPage.waitForURL(`${WEB}/organizador/eventos/novo`);
  await organizerPage.getByLabel('Título').fill(eventTitle);
  await organizerPage
    .getByLabel('Descrição')
    .fill('Evento criado para o fluxo de repasses E2E.');
  await organizerPage
    .getByRole('combobox', { name: 'Categoria', exact: true })
    .selectOption({ label: 'Shows' });
  await expect(
    organizerPage.getByRole('combobox', { name: 'Local', exact: true }),
  ).toBeEnabled();
  await organizerPage
    .getByRole('combobox', { name: 'Local', exact: true })
    .selectOption({ label: venueName });
  await organizerPage.getByLabel('Data e hora').fill(startsAt);
  await organizerPage.getByRole('button', { name: 'Criar evento' }).click();
  await organizerPage.waitForURL(/\/organizador\/eventos\/[0-9a-f-]{36}$/);
  await expect(
    organizerPage.getByRole('heading', { name: 'Editar evento' }),
  ).toBeVisible();

  await organizerPage.getByLabel('Nome do setor').fill(sectorName);
  await organizerPage.getByLabel('Preço base').fill('50');
  await organizerPage.getByLabel('Nome da fila').first().fill('A');
  await organizerPage.getByLabel('Lugares').first().fill('10');
  await organizerPage.getByRole('button', { name: 'Criar setor' }).click();
  await expect(organizerPage.getByText('Fila A · 10 lugares')).toBeVisible();

  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();

  await registerVerifiedBuyer(buyerPage, {
    email: buyerEmail,
    password,
    name: 'Comprador Repasses E2E',
  });
  await buyerPage.getByRole('button', { name: 'Sair' }).click();
  await expect(
    buyerPage.getByRole('banner').getByRole('link', { name: 'Entrar' }),
  ).toBeVisible();

  await buyerPage.goto(`${WEB}/`);
  await buyerPage.getByRole('button', { name: 'Shows' }).click();
  await buyerPage.waitForURL(/\?category=shows$/);
  const card = buyerPage.locator('article').filter({ hasText: eventTitle });
  await card.getByRole('link', { name: 'Ver Ingressos' }).click();
  await buyerPage.waitForURL(/\/events\/noite-de-repasses-e2e-\d+$/);
  const eventPath = new URL(buyerPage.url()).pathname;
  await buyerPage.getByRole('link', { name: 'Escolher ingressos' }).click();
  await buyerPage.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await expect(
    buyerPage.getByText('Plateia · Fila A · Cadeira 1 · R$ 50,00'),
  ).toBeVisible();

  await buyerPage.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(
    buyerPage.getByText('Entre para finalizar a compra'),
  ).toBeVisible();
  await buyerPage.getByRole('link', { name: 'Entrar na conta' }).click();
  await buyerPage.getByLabel('E-mail').fill(buyerEmail);
  await buyerPage.getByLabel('Senha').fill(password);
  await buyerPage.getByRole('button', { name: 'Entrar', exact: true }).click();
  await buyerPage.waitForURL(`${WEB}/`);

  await buyerPage.goto(`${WEB}${eventPath}/checkout`);
  await expect(buyerPage.getByText('Total: R$ 55,00')).toBeVisible();
  await buyerPage.getByRole('button', { name: 'Pagar' }).click();

  const panel = buyerPage.getByRole('region', { name: 'Pagamento simulado' });
  await expect(panel).toBeVisible();

  const order = readLatestOrder();
  await expect(panel.locator('code')).toHaveText(order.providerRef);

  const eventId = await approvePayment(buyerPage.request, order);
  providerEventIds.add(eventId);

  await expect(buyerPage.getByText('Pedido confirmado')).toBeVisible({
    timeout: 15_000,
  });

  await organizerPage.goto(`${WEB}/organizador/repasses`);
  const transferRow = organizerPage
    .getByRole('row')
    .filter({ hasText: eventTitle });
  await expect(transferRow).toBeVisible({ timeout: 15_000 });
  await expect(
    transferRow.getByRole('cell', { name: 'R$ 55,00' }),
  ).toBeVisible();
  await expect(
    transferRow.getByRole('cell', { name: 'R$ 5,00' }),
  ).toBeVisible();
  await expect(
    transferRow.getByRole('cell', { name: 'R$ 50,00' }),
  ).toBeVisible();
  await expect(
    transferRow.getByRole('cell', { name: 'Repasse enviado' }),
  ).toBeVisible();

  await buyerContext.close();
  await organizerContext.close();
});
