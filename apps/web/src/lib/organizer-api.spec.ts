import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  fetchOrganizerConnectStatus,
  fetchOrganizerTransfers,
  retryOrganizerTransfer,
  startOrganizerConnect,
} from './organizer-api';

const onboardingUrl = 'https://connect.stripe.com/onboarding';
const orderId = '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';
const transferEntry = {
  orderId,
  eventTitle: 'Festa do Livro',
  eventSlug: 'festa-do-livro',
  grossCents: 40000,
  platformFeeCents: 4000,
  organizerNetCents: 36000,
  transferStatus: 'failed',
  createdAt: '2026-10-20T12:00:00.000Z',
};

const server = setupServer(
  http.get(/\/api\/organizer\/payments\/connect$/, () =>
    HttpResponse.json({ connected: true, payoutsEnabled: false }),
  ),
  http.post(/\/api\/organizer\/payments\/connect$/, () =>
    HttpResponse.json({ onboardingUrl }),
  ),
  http.get(/\/api\/organizer\/payments\/transfers$/, () =>
    HttpResponse.json({ transfers: [transferEntry] }),
  ),
  http.post(/\/api\/organizer\/payments\/transfers\/[^/]+\/retry$/, () =>
    HttpResponse.json({ transferStatus: 'succeeded' }),
  ),
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('helpers da API de pagamentos do organizador', () => {
  test('fetchOrganizerConnectStatus retorna o status de conexão validado', async () => {
    const status = await fetchOrganizerConnectStatus();

    expect(status).toEqual({ connected: true, payoutsEnabled: false });
  });

  test('fetchOrganizerConnectStatus reclama quando a resposta quebra o contrato', async () => {
    server.use(
      http.get(/\/api\/organizer\/payments\/connect$/, () =>
        HttpResponse.json({ connected: 'sim' }),
      ),
    );

    await expect(fetchOrganizerConnectStatus()).rejects.toThrow(
      'Ocorreu um erro inesperado. Tente novamente.',
    );
  });

  test('startOrganizerConnect retorna a URL de onboarding', async () => {
    await expect(startOrganizerConnect()).resolves.toBe(onboardingUrl);
  });

  test('startOrganizerConnect retorna null quando não há URL de onboarding', async () => {
    server.use(
      http.post(/\/api\/organizer\/payments\/connect$/, () =>
        HttpResponse.json({ onboardingUrl: null }),
      ),
    );

    await expect(startOrganizerConnect()).resolves.toBeNull();
  });

  test('fetchOrganizerTransfers retorna a lista de repasses validada', async () => {
    const transfers = await fetchOrganizerTransfers();

    expect(transfers).toEqual([transferEntry]);
  });

  test('retryOrganizerTransfer retorna o status do repasse reprocessado', async () => {
    await expect(retryOrganizerTransfer(orderId)).resolves.toBe('succeeded');
  });

  test('retryOrganizerTransfer traduz repasse não reprocessável', async () => {
    server.use(
      http.post(/\/api\/organizer\/payments\/transfers\/[^/]+\/retry$/, () =>
        HttpResponse.json({ error: 'transfer_not_retryable' }, { status: 409 }),
      ),
    );

    await expect(retryOrganizerTransfer(orderId)).rejects.toThrow(
      'Este repasse não pode ser reprocessado.',
    );
  });

  test('retryOrganizerTransfer traduz pedido não encontrado', async () => {
    server.use(
      http.post(/\/api\/organizer\/payments\/transfers\/[^/]+\/retry$/, () =>
        HttpResponse.json({ error: 'order_not_found' }, { status: 404 }),
      ),
    );

    await expect(retryOrganizerTransfer(orderId)).rejects.toThrow(
      'Pedido não encontrado.',
    );
  });
});
