import { expect, type Page } from '@playwright/test';

import { clearMailbox, waitForEmailLink } from './mailpit';

export const WEB = 'http://localhost:3000';

export interface VerifiedBuyer {
  email: string;
  password: string;
  name?: string;
}

export async function registerVerifiedBuyer(
  page: Page,
  buyer: VerifiedBuyer,
): Promise<void> {
  await clearMailbox(page.request);

  await page.goto(`${WEB}/cadastro`);
  await page.getByLabel('Nome').fill(buyer.name ?? 'Comprador E2E');
  await page.getByLabel('E-mail').fill(buyer.email);
  await page.getByLabel('Senha').fill(buyer.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Verifique seu e-mail')).toBeVisible();

  const verifyUrl = await waitForEmailLink(
    page.request,
    buyer.email,
    'Confirme seu e-mail',
  );
  await page.goto(verifyUrl);

  await page.goto(`${WEB}/entrar`);
  await page.getByLabel('E-mail').fill(buyer.email);
  await page.getByLabel('Senha').fill(buyer.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await page.waitForURL(`${WEB}/`);
}
