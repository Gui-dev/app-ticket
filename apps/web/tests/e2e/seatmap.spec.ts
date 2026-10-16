import { expect, test } from '@playwright/test';

test('exibe o mapa e permite selecionar um assento livre', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await expect(
    page.getByRole('heading', { name: 'Escolha seu lugar' }),
  ).toBeVisible();

  const seat = page.getByRole('button', { name: 'Cadeira 6, fila A' });
  await expect(seat).toBeEnabled();
  await seat.click();

  await expect(page.getByRole('status')).toHaveText(
    'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
  );
  await expect(
    page.getByRole('button', { name: 'Cadeira 7, fila B' }),
  ).toBeDisabled();
});

test('escolhe o melhor lugar disponível com um clique', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Melhor lugar disponível' }).click();

  await expect(page.getByRole('status')).toHaveText(
    'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
  );
});

test('mostra o estado vazio para eventos sem mapa de assentos', async ({
  page,
}) => {
  await page.goto('/events/corrida-de-rua-sp/ingressos');

  await expect(
    page.getByText(
      'O mapa de assentos ainda não foi publicado para este evento.',
    ),
  ).toBeVisible();
});
