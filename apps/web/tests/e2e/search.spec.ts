import { expect, test } from '@playwright/test';

test('busca pelo header filtra os resultados', async ({ page }) => {
  await page.goto('/');

  const search = page.getByRole('searchbox', { name: 'Buscar eventos' });
  await search.fill('cyberpunk');
  await search.press('Enter');

  await expect(page).toHaveURL(/\?q=cyberpunk/);
  await expect(
    page.getByRole('heading', { name: 'Cyberpunk Electronic Festival' }),
  ).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);
});

test('chip de categoria filtra os resultados', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Teatro' }).click();

  await expect(page).toHaveURL(/category=teatro/);
  await expect(page.locator('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'A Hora é a Vez' }),
  ).toBeVisible();
});

test('combina busca e categoria', async ({ page }) => {
  await page.goto('/?q=stand');

  await expect(page.locator('article')).toHaveCount(2);

  await page.getByRole('button', { name: 'Comédia' }).click();

  await expect(page).toHaveURL(/q=stand/);
  await expect(page).toHaveURL(/category=comedy/);
  await expect(page.locator('article')).toHaveCount(2);
});

test('mostra estado vazio quando nada corresponde', async ({ page }) => {
  await page.goto('/?q=zzz');

  await expect(page.getByText(/Nenhum evento encontrado/)).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
});

test('limpar filtros volta para a home', async ({ page }) => {
  await page.goto('/?q=zzz');

  await page.getByRole('link', { name: 'Limpar filtros' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3000/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
});
