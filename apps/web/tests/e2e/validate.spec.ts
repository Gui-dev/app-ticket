import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { approvePayment } from './helpers/checkout';
import { promoteOrganizerByEmail } from './helpers/db';
import {
  deleteOrdersByBuyer,
  deletePaymentEvents,
  readLatestOrder,
} from './helpers/orders';

const buyerEmails = new Set<string>();
const providerEventIds = new Set<string>();

test.afterEach(() => {
  deleteOrdersByBuyer([...buyerEmails]);
  deletePaymentEvents([...providerEventIds]);
  buyerEmails.clear();
  providerEventIds.clear();
});

test('valida e revalida o ingresso na entrada e recusa código inválido', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const organizerEmail = `e2e-validacao-organizador-${suffix}@ticketvibe.test`;
  const buyerEmail = `e2e-validacao-comprador-${suffix}@ticketvibe.test`;
  const password = 'senha-forte-123';
  const venueName = 'Teatro E2E Validação';
  const eventTitle = 'Show do Organizador Validação E2E';
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
    name: 'Organizador Validação E2E',
  });

  promoteOrganizerByEmail(organizerEmail);

  await organizerPage.reload();
  await organizerPage
    .getByRole('link', { name: 'Painel do organizador' })
    .click();
  await organizerPage.waitForURL(`${WEB}/organizador`);
  await expect(
    organizerPage.getByRole('heading', { name: 'Painel do organizador' }),
  ).toBeVisible();

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
    .fill('Evento criado para a validação de QR E2E.');
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
  await expect(organizerPage.getByText('R$ 50,00').first()).toBeVisible();

  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();

  await registerVerifiedBuyer(buyerPage, {
    email: buyerEmail,
    password,
    name: 'Comprador Validação E2E',
  });

  await buyerPage.goto(`${WEB}/`);
  await buyerPage.getByRole('button', { name: 'Shows' }).click();
  await buyerPage.waitForURL(/\?category=shows$/);
  const card = buyerPage.locator('article').filter({ hasText: eventTitle });
  await card.getByRole('link', { name: 'Ver Ingressos' }).click();
  await buyerPage.waitForURL(
    /\/events\/show-do-organizador-validacao-e2e(-\d+)?$/,
  );
  const eventPath = new URL(buyerPage.url()).pathname;
  await buyerPage.getByRole('link', { name: 'Escolher ingressos' }).click();
  await buyerPage.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await expect(
    buyerPage.getByText('Plateia · Fila A · Cadeira 1 · R$ 50,00'),
  ).toBeVisible();

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

  await buyerPage.goto(`${WEB}/conta/pedidos/${order.id}`);
  const qrCode = buyerPage.getByRole('figure', { name: 'QR Code do ingresso' });
  await expect(qrCode).toBeVisible();
  const ticketCode = await qrCode.locator('code').textContent();
  expect(ticketCode).toMatch(/^[\w-]{16,}$/);

  await buyerContext.close();

  await organizerPage.goto(`${WEB}/organizador/validacao`);
  await expect(
    organizerPage.getByRole('heading', { name: 'Validação de ingressos' }),
  ).toBeVisible();
  await expect(
    organizerPage
      .getByRole('region', { name: 'Câmera do scanner' })
      .getByText('Não foi possível acessar a câmera. Use o código manual.'),
  ).toBeVisible();
  await expect(
    organizerPage.getByRole('combobox', { name: 'Evento' }),
  ).toBeEnabled();
  await organizerPage
    .getByRole('combobox', { name: 'Evento' })
    .selectOption({ label: eventTitle });

  const validateButton = organizerPage.getByRole('button', { name: 'Validar' });
  const codeInput = organizerPage.getByLabel('Código do ingresso');
  const verdict = organizerPage.getByRole('status').filter({
    hasText: /Ingresso/,
  });

  await codeInput.fill(ticketCode ?? '');
  await validateButton.click();
  await expect(verdict.getByText('Ingresso válido.')).toBeVisible();
  await expect(verdict.getByText('Plateia · Fila A · Assento 1')).toBeVisible();

  await codeInput.fill(ticketCode ?? '');
  await validateButton.click();
  await expect(verdict.getByText('Ingresso já utilizado.')).toBeVisible();
  await expect(verdict.getByText(/Utilizado em .+ por .+/)).toBeVisible();

  await codeInput.fill('codigo-inexistente-e2e');
  await validateButton.click();
  await expect(verdict.getByText('Ingresso inválido.')).toBeVisible();

  await organizerContext.close();
});
