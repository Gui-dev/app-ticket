import { expect, test } from '@playwright/test';

const WEB = 'http://localhost:3000';

test('botão Google leva à authorize URL do Google (modo simulado)', async ({
  page,
}) => {
  await page.route('**://accounts.google.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>google stub</body></html>',
    }),
  );

  await page.goto(`${WEB}/entrar`);
  await page.getByRole('button', { name: 'Entrar com Google' }).click();

  await page.waitForURL(/accounts\.google\.com/);
  const authorizeUrl = new URL(page.url());
  expect(authorizeUrl.pathname).toBe('/o/oauth2/v2/auth');
  expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
  expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
    `${WEB}/api/auth/callback/google`,
  );
  expect(authorizeUrl.searchParams.get('client_id')).toBeTruthy();
  expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
});
