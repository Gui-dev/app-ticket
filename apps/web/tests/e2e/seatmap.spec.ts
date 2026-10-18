import { expect, test } from '@playwright/test';

test('exibe o mapa e permite selecionar um assento livre', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await expect(
    page.getByRole('heading', { name: 'Escolha seu lugar' }),
  ).toBeVisible();

  const seat = page.getByRole('button', { name: 'Cadeira 6, fila A' });
  await expect(seat).toBeEnabled();
  await seat.click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Desistir de todos' }),
  ).toHaveCount(0);

  await expect(
    page.getByRole('button', { name: 'Cadeira 7, fila B' }),
  ).toBeDisabled();
});

test('escolhe o melhor lugar disponível com um clique', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Melhor lugar disponível' }).click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText('Nenhum assento no carrinho.')).toBeVisible();
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

test('reserva tem contagem regressiva e desistir libera o assento', async ({
  page,
}) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 8, fila A' }).click();

  await expect(
    page.getByText('Plateia · Fila A · Cadeira 8 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText(/Reserva expira em 09:5\d/)).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
  await expect(page.getByText(/Reserva expira em/)).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Cadeira 8, fila A' }),
  ).toBeEnabled();
});

test('assento reservado aparece ocupado para outro comprador', async ({
  browser,
}) => {
  const buyer1 = await (await browser.newContext()).newPage();
  const buyer2 = await (await browser.newContext()).newPage();

  await buyer1.goto('/events/o-fantasma-da-opera/ingressos');
  await buyer1.getByRole('button', { name: 'Cadeira 10, fila A' }).click();
  await expect(buyer1.getByText(/Reserva expira em/)).toBeVisible();

  await buyer2.goto('/events/o-fantasma-da-opera/ingressos');
  await expect(
    buyer2.getByRole('button', { name: 'Cadeira 10, fila A' }),
  ).toBeDisabled();

  await buyer1.getByRole('button', { name: 'Desistir de todos' }).click();
  await buyer2.reload();
  await expect(
    buyer2.getByRole('button', { name: 'Cadeira 10, fila A' }),
  ).toBeEnabled();

  await buyer1.context().close();
  await buyer2.context().close();
});

test('recupera a reserva após atualizar a página', async ({ page }) => {
  await page.goto('/events/o-fantasma-da-opera/ingressos');

  await page.getByRole('button', { name: 'Cadeira 12, fila A' }).click();
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  await page.reload();
  await expect(
    page.getByText('Plateia · Fila A · Cadeira 12 · R$ 120,00'),
  ).toBeVisible();
  await expect(page.getByText(/Reserva expira em/)).toBeVisible();

  await page.getByRole('button', { name: 'Desistir de todos' }).click();
});
