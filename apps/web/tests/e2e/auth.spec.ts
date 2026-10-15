import { expect, test } from '@playwright/test';

import { clearMailbox, waitForEmailLink } from './helpers/mailpit';

const WEB = 'http://localhost:3000';

test('cadastro, confirmação de e-mail via Mailpit, login, persistência e logout', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';

  await clearMailbox(request);

  await page.goto(`${WEB}/cadastro`);
  await page.getByLabel('Nome').fill('Comprador E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Verifique seu e-mail')).toBeVisible();

  const verifyUrl = await waitForEmailLink(
    request,
    email,
    'Confirme seu e-mail',
  );
  await page.goto(verifyUrl);

  await page.goto(`${WEB}/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await page.waitForURL(`${WEB}/`);
  const headerName = page.getByRole('banner').getByText('Comprador E2E');
  await expect(headerName).toBeVisible();

  await page.reload();
  await expect(headerName).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: /Entrar/ })).toBeVisible();
});
