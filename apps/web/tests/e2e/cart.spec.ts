import { execSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

function backdateHold(seatLabel: string): void {
  execSync(
    `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -c "update seats set hold_expires_at = now() - interval '1 second' where label = '${seatLabel}' and hold_user_id is not null and row_id in (select sr.id from seat_rows sr join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = 'o-fantasma-da-opera' and s.slug = 'plateia' and sr.label = 'A')"`,
    { stdio: 'ignore' },
  );
}

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
