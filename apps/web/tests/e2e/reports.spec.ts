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

function saoPauloDateTimeLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

test('compra confirmada aparece no relatório do organizador com os números exatos', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const organizerEmail = `e2e-relatorios-organizador-${suffix}@ticketvibe.test`;
  const buyerEmail = `e2e-relatorios-comprador-${suffix}@ticketvibe.test`;
  const password = 'senha-forte-123';
  const venueName = 'Teatro E2E Relatórios';
  const eventTitle = 'Show do Organizador Relatório E2E';
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
    name: 'Organizador Relatórios E2E',
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
    .fill('Evento criado para o relatório de vendas E2E.');
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
    name: 'Comprador Relatórios E2E',
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
  await buyerPage.waitForURL(
    /\/events\/show-do-organizador-relatorio-e2e(-\d+)?$/,
  );
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

  await organizerPage.getByRole('link', { name: 'Relatórios' }).click();
  await organizerPage.waitForURL(`${WEB}/organizador/relatorios`);
  await expect(
    organizerPage.getByRole('heading', { name: 'Relatórios' }),
  ).toBeVisible();
  await expect(
    organizerPage.getByText('Nenhum evento do organizador ainda.'),
  ).toBeHidden();
  await expect(
    organizerPage.getByRole('combobox', { name: 'Evento' }),
  ).toBeEnabled();

  const reportResponse = organizerPage.waitForResponse((response) =>
    response.url().includes('/report'),
  );
  await organizerPage
    .getByRole('combobox', { name: 'Evento' })
    .selectOption({ label: eventTitle });
  await reportResponse;

  const kpi = (label: string) =>
    organizerPage.locator('dl > div').filter({ hasText: label }).locator('dd');
  await expect(kpi('Ingressos vendidos')).toHaveText('1');
  await expect(kpi('Pedidos pagos')).toHaveText('1');
  await expect(kpi('Faturamento bruto')).toHaveText('R$ 50,00');
  await expect(kpi('Taxa da plataforma')).toHaveText('R$ 5,00');
  await expect(kpi('Líquido do evento')).toHaveText('R$ 45,00');

  const now = Date.now();
  await organizerPage
    .getByLabel('De', { exact: true })
    .fill(saoPauloDateTimeLocal(new Date(now - 24 * 60 * 60 * 1000)));
  await organizerPage
    .getByLabel('Até', { exact: true })
    .fill(saoPauloDateTimeLocal(new Date(now + 60_000)));
  await organizerPage.getByRole('button', { name: 'Aplicar' }).click();

  await expect(kpi('Ingressos vendidos')).toHaveText('1');
  await expect(kpi('Pedidos pagos')).toHaveText('1');
  await expect(kpi('Faturamento bruto')).toHaveText('R$ 50,00');
  await expect(kpi('Taxa da plataforma')).toHaveText('R$ 5,00');
  await expect(kpi('Líquido do evento')).toHaveText('R$ 45,00');

  await buyerContext.close();

  await organizerPage
    .getByLabel('De', { exact: true })
    .fill(saoPauloDateTimeLocal(new Date(now - 2 * 60 * 60 * 1000)));
  await organizerPage
    .getByLabel('Até', { exact: true })
    .fill(saoPauloDateTimeLocal(new Date(now - 60 * 60 * 1000)));
  await organizerPage.getByRole('button', { name: 'Aplicar' }).click();

  await expect(
    organizerPage.getByText('Nenhuma venda no período.'),
  ).toBeVisible();

  await organizerContext.close();
});
