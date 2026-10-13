import { expect, test } from '@playwright/test';

test('card da home navega para a página de evento', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Ver Ingressos' }).first().click();

  await expect(page).toHaveURL(/\/events\/o-fantasma-da-opera$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'O Fantasma da Ópera' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Setores' })).toBeVisible();
  await expect(page.getByRole('list')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Escolher ingressos' }),
  ).toHaveAttribute('href', '/events/o-fantasma-da-opera/ingressos');
});

test('página de evento inexistente responde 404', async ({ page }) => {
  const response = await page.goto('/events/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Voltar para a home' }),
  ).toBeVisible();
});
