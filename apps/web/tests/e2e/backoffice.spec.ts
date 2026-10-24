import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { promoteOrganizerByEmail } from './helpers/db';

test('organizador cria local e evento com setor, que aparece na home e na página de evento', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const organizerEmail = `e2e-backoffice-${suffix}@ticketvibe.test`;
  const password = 'senha-forte-123';
  const venueName = `Teatro E2E Backoffice ${suffix}`;
  const eventTitle = `Show do Organizador E2E ${suffix}`;
  const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  await registerVerifiedBuyer(page, {
    email: organizerEmail,
    password,
    name: 'Organizador E2E',
  });

  promoteOrganizerByEmail(organizerEmail);

  await page.reload();
  await page.getByRole('link', { name: 'Painel do organizador' }).click();
  await page.waitForURL(`${WEB}/organizador`);
  await expect(
    page.getByRole('heading', { name: 'Painel do organizador' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Locais' }).click();
  await page.waitForURL(`${WEB}/organizador/locais`);
  await expect(
    page.getByRole('heading', { name: 'Locais', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar local' }).click();
  await page.getByLabel('Nome', { exact: true }).fill(venueName);
  await page.getByLabel('Cidade').fill('São Paulo');
  await page.getByLabel('Estado').fill('SP');
  await page.getByRole('button', { name: 'Cadastrar local' }).click();
  const venueItem = page.getByRole('listitem').filter({ hasText: venueName });
  await expect(venueItem).toBeVisible();
  await expect(venueItem.getByText('São Paulo/SP')).toBeVisible();

  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await page.getByRole('link', { name: 'Meus eventos' }).click();
  await page.waitForURL(`${WEB}/organizador/eventos`);
  await page.getByRole('link', { name: 'Criar evento' }).click();
  await page.waitForURL(`${WEB}/organizador/eventos/novo`);
  await page.getByLabel('Título').fill(eventTitle);
  await page
    .getByLabel('Descrição')
    .fill('Evento completo criado pela jornada E2E do backoffice.');
  await page
    .getByRole('combobox', { name: 'Categoria', exact: true })
    .selectOption({ label: 'Shows' });
  await expect(
    page.getByRole('combobox', { name: 'Local', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('combobox', { name: 'Local', exact: true })
    .selectOption({ label: venueName });
  await page.getByLabel('Data e hora').fill(startsAt);
  await page.getByRole('button', { name: 'Criar evento' }).click();
  await page.waitForURL(/\/organizador\/eventos\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('heading', { name: 'Editar evento' }),
  ).toBeVisible();

  await page.getByLabel('Nome do setor').fill('Plateia E2E');
  await page.getByLabel('Preço base').fill('50');
  await page.getByLabel('Nome da fila').first().fill('A');
  await page.getByLabel('Lugares').first().fill('10');
  await page.getByRole('button', { name: 'Criar setor' }).click();
  await expect(page.getByText('Plateia E2E')).toBeVisible();
  await expect(page.getByText('Fila A · 10 lugares')).toBeVisible();
  await expect(page.getByText('R$ 50,00').first()).toBeVisible();

  await page.goto(`${WEB}/`);
  await page.getByRole('button', { name: 'Shows' }).click();
  await page.waitForURL(/\?category=shows$/);
  await expect(page.getByText(eventTitle)).toBeVisible();

  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();

  await buyerPage.goto(`${WEB}/`);
  await buyerPage.getByRole('button', { name: 'Shows' }).click();
  await buyerPage.waitForURL(/\?category=shows$/);
  await expect(buyerPage.getByText(eventTitle)).toBeVisible();

  const card = buyerPage.locator('article').filter({ hasText: eventTitle });
  await card.getByRole('link', { name: 'Ver Ingressos' }).click();
  await buyerPage.waitForURL(/\/events\/show-do-organizador-e2e/);
  await expect(
    buyerPage.getByRole('heading', { level: 1, name: eventTitle }),
  ).toBeVisible();
  await expect(
    buyerPage.getByRole('heading', { name: 'Setores' }),
  ).toBeVisible();
  await expect(buyerPage.getByText('Plateia E2E')).toBeVisible();
  await expect(buyerPage.getByText('10 lugares disponíveis')).toBeVisible();
  await expect(buyerPage.getByText('R$ 50,00').first()).toBeVisible();

  await buyerContext.close();
});
