import { expect, test } from '@playwright/test';

import { WEB } from './helpers/auth';
import { restoreSeat } from './helpers/db';

const EVENT_PATH = '/events/o-fantasma-da-opera';
const SEAT_NAME = 'Cadeira 1, fila A';
const CART_ITEM_TEXT = 'Plateia · Fila A · Cadeira 1 · R$ 120,00';

type WindowMarker = { noReload?: boolean };

async function readNoReload(page: Awaited<ReturnType<typeof newPage>>) {
  const value = await page.evaluate(
    () => (window as unknown as WindowMarker).noReload,
  );
  expect(value).toBe(true);
}

test.afterEach(() => {
  restoreSeat('1');
});

test('dois compradores veem a mesma ocupação de assento em tempo real', async ({
  browser,
}) => {
  test.setTimeout(90_000);

  restoreSeat('1');

  const buyerA = await (await browser.newContext()).newPage();
  const buyerB = await (await browser.newContext()).newPage();

  await buyerA.goto(`${WEB}${EVENT_PATH}/ingressos`);
  const seatA = buyerA.getByRole('button', { name: SEAT_NAME });
  await expect(seatA).toBeEnabled();

  await buyerB.goto(`${WEB}${EVENT_PATH}/ingressos`);
  const seatB = buyerB.getByRole('button', { name: SEAT_NAME });
  await expect(seatB).toBeEnabled();
  await buyerB.evaluate(() => {
    (window as unknown as WindowMarker).noReload = true;
  });

  await seatA.click();
  await expect(buyerA.getByText(CART_ITEM_TEXT)).toBeVisible();

  await expect(seatB).toBeDisabled({ timeout: 15_000 });
  await readNoReload(buyerB);

  await seatA.click();
  await expect(seatB).toBeEnabled({ timeout: 15_000 });
  await readNoReload(buyerB);

  await buyerA.context().close();
  await buyerB.context().close();
});
