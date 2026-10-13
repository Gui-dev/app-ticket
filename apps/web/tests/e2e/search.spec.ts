import { expect, test } from '@playwright/test';

test('busca pelo header filtra os resultados', async ({ page }) => {
  await page.goto('/');

  const search = page.getByRole('combobox', { name: 'Buscar eventos' });
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
  await page.goto('/?q=festival');

  await expect(page.locator('article')).toHaveCount(3);

  await page.getByRole('button', { name: 'Comédia' }).click();

  await expect(page).toHaveURL(/q=festival/);
  await expect(page).toHaveURL(/category=comedy/);
  await expect(page.locator('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Melhor de Stand-up: Grand Finale' }),
  ).toBeVisible();
});

test('mostra estado vazio quando nada corresponde', async ({ page }) => {
  await page.goto('/?q=zzz');

  await expect(page.getByText(/Nenhum evento encontrado/)).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
});

test('limpar filtros volta para a home', async ({ page }) => {
  await page.goto('/?q=zzz');

  await page.getByRole('link', { name: 'Limpar filtros' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
});

test('suggestion panel opens and navigating to an event works', async ({
  page,
}) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('fantasma');

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('group', { name: 'Eventos' })).toBeVisible();

  await listbox.getByRole('option').first().click();
  await page.waitForURL('**/events/o-fantasma-da-opera');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
});

test('pressing Enter with no highlighted suggestion shows results', async ({
  page,
}) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('cyberpunk');
  await input.press('Enter');

  await page.waitForURL((url) => url.searchParams.get('q') === 'cyberpunk');
  await expect(page).toHaveURL(/\?q=cyberpunk/);
});

test('selecting a location suggestion filters the results by city', async ({
  page,
}) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('rio');

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  const localsGroup = listbox.getByRole('group', { name: 'Locais' });
  await expect(localsGroup).toBeVisible();
  await localsGroup.getByRole('option').first().click();

  await page.waitForURL(
    (url) => url.searchParams.get('q') === 'Rio de Janeiro',
  );
  await expect(page).toHaveURL(/\?q=Rio\+de\+Janeiro/);
  await expect(page.locator('article')).toHaveCount(2);
});

test('Escape closes the panel and keeps the typed text', async ({ page }) => {
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Buscar eventos' });
  await input.fill('fantasma');
  await expect(
    page.getByRole('listbox').getByRole('option').first(),
  ).toBeVisible();

  await input.press('Escape');

  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(input).toHaveValue('fantasma');
});
