import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { push, router } = vi.hoisted(() => {
  const pushMock = vi.fn();
  return { push: pushMock, router: { push: pushMock } };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/components/header', () => ({
  Header: () => <header />,
}));

const ContaPage = (await import('./page')).default;

const server = setupServer();

const orderId = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

const orderListResponse = {
  orders: [
    {
      id: orderId,
      eventSlug: 'o-fantasma-da-opera',
      eventTitle: 'O Fantasma da Ópera',
      eventStartsAt: '2026-11-20T23:00:00.000Z',
      status: 'paid',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      itemCount: 1,
      createdAt: '2026-10-18T12:00:00.000Z',
    },
  ],
};

describe('ContaPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    push.mockReset();
  });
  afterAll(() => server.close());

  it('mostra os pedidos devolvidos pela API', async () => {
    server.use(
      http.get(/\/api\/orders$/, () => HttpResponse.json(orderListResponse)),
    );

    render(<ContaPage />);

    expect(await screen.findByText('O Fantasma da Ópera')).toBeInTheDocument();
    expect(screen.getByText('R$ 132,00')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /O Fantasma da Ópera/ }),
    ).toHaveAttribute('href', `/conta/pedidos/${orderId}`);
    expect(push).not.toHaveBeenCalled();
  });

  it('mostra a mensagem de lista vazia', async () => {
    server.use(
      http.get(/\/api\/orders$/, () => HttpResponse.json({ orders: [] })),
    );

    render(<ContaPage />);

    expect(
      await screen.findByText('Você ainda não fez nenhum pedido.'),
    ).toBeInTheDocument();
  });

  it('redireciona para /entrar quando a API responde 401', async () => {
    server.use(
      http.get(/\/api\/orders$/, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    render(<ContaPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/entrar'));
  });

  it('mostra a mensagem de erro quando a API falha', async () => {
    server.use(
      http.get(/\/api\/orders$/, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(<ContaPage />);

    expect(
      await screen.findByText('Não foi possível carregar seus pedidos.'),
    ).toBeInTheDocument();
  });
});
