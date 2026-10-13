import { expect, test } from '@playwright/test';

test('página de evento navega para o local e lista os eventos do local', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera');

  await page.getByRole('link', { name: 'Teatro Renault' }).click();

  await expect(page).toHaveURL(/\/venues\/teatro-renault$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Teatro Renault' }),
  ).toBeVisible();
  await expect(page.getByText('São Paulo/SP', { exact: true })).toBeVisible();
  await expect(page.getByText('3 eventos encontrados')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver Ingressos' })).toHaveCount(
    3,
  );
});

test('página de evento navega para o artista e lista os eventos do artista', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera');

  await page.getByRole('link', { name: 'Andrew Lloyd Webber' }).click();

  await expect(page).toHaveURL(/\/artists\/andrew-lloyd-webber$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Andrew Lloyd Webber' }),
  ).toBeVisible();
  await expect(page.getByText('1 evento encontrado')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver Ingressos' })).toHaveCount(
    1,
  );
});

test('página de artista inexistente responde 404', async ({ page }) => {
  const response = await page.goto('/artists/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
});

test('página de local inexistente responde 404', async ({ page }) => {
  const response = await page.goto('/venues/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
});
