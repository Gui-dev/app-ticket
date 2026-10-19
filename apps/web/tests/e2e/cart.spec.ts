import { expect, test } from '@playwright/test';

import { backdateHold } from './helpers/db';

test('adiciona dois assentos e mostra o total do carrinho', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 1, fila A' }).click();
  await page.getByRole('button', { name: 'Cadeira 3, fila A' }).click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
  ).toBeVisible();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 3 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText('Total: R$ 240,00')).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cadeira 1, fila A' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Cadeira 3, fila A' }),
  ).toBeEnabled();
});

test('meia entrada cobra metade do preço por item', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 4, fila A' }).click();
  await expect(page.getByText('Total: R$ 120,00')).toBeVisible();

  await page
    .getByLabel('Tipo de ingresso — Plateia, fila A, cadeira 4')
    .selectOption('meia');

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 4 · R$ 60,00'),
  ).toBeVisible();
  await expect(page.getByText('Total: R$ 60,00')).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
});

test('vip dobra o preço do assento', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 5, fila A' }).click();

  await page
    .getByLabel('Tipo de ingresso — Plateia, fila A, cadeira 5')
    .selectOption('vip');

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 5 · R$ 240,00'),
  ).toBeVisible();
  await expect(page.getByText('Total: R$ 240,00')).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
});

test('ao expirar, o carrinho esvazia e o assento volta a ficar livre', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 2, fila A' }).click();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 2 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  backdateHold('2');
  await page.reload();

  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(page.getByText(/Reserva expira em/)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Cadeira 2, fila A' }),
  ).toBeEnabled();
});
