import { expect, test } from '@playwright/test';

test('home exibe o destaque e os eventos em alta', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'O Fantasma da Ópera',
  );
  await expect(
    page.getByRole('heading', { name: 'Eventos em Alta' }),
  ).toBeVisible();
});
