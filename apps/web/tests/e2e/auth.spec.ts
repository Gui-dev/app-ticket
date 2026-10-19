import { expect, test } from '@playwright/test';

import { registerVerifiedBuyer, WEB } from './helpers/auth';

test('cadastro, confirmação de e-mail via Mailpit, login, persistência e logout', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@ticketvibe.test`;
  const password = 'senha-forte-123';

  await registerVerifiedBuyer(page, {
    email,
    password,
    name: 'Comprador E2E',
  });

  await page.waitForURL(`${WEB}/`);
  const headerName = page.getByRole('banner').getByText('Comprador E2E');
  await expect(headerName).toBeVisible();

  await page.reload();
  await expect(headerName).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: /Entrar/ })).toBeVisible();
});
