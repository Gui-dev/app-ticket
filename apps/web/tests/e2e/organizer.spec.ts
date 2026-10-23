import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';
import { promoteOrganizerByEmail } from './helpers/db';

test('organizador acessa o painel, comprador é bloqueado e anônimo é redirecionado', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);

  const organizerEmail = `e2e-organizador-${Date.now()}@ticketvibe.test`;
  const buyerEmail = `e2e-organizador-comprador-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';

  await registerVerifiedBuyer(page, {
    email: organizerEmail,
    password,
    name: 'Organizador E2E',
  });

  promoteOrganizerByEmail(organizerEmail);

  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Painel do organizador' }),
  ).toBeVisible();

  await page.goto(`${WEB}/organizador`);
  await expect(
    page.getByRole('heading', { name: 'Painel do organizador' }),
  ).toBeVisible();

  const nav = page.getByRole('navigation', {
    name: 'Navegação do organizador',
  });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Painel' })).toBeVisible();

  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();

  await registerVerifiedBuyer(buyerPage, {
    email: buyerEmail,
    password,
    name: 'Comprador Bloqueado E2E',
  });

  await expect(
    buyerPage.getByRole('link', { name: 'Painel do organizador' }),
  ).toHaveCount(0);

  await buyerPage.goto(`${WEB}/organizador`);
  await expect(
    buyerPage.getByRole('heading', { name: 'Acesso restrito' }),
  ).toBeVisible();
  await expect(
    buyerPage.getByRole('link', { name: 'Voltar para a home' }),
  ).toBeVisible();

  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();

  await anonymousPage.goto(`${WEB}/organizador`);
  await expect(anonymousPage).toHaveURL(/entrar/);

  await buyerContext.close();
  await anonymousContext.close();
});
