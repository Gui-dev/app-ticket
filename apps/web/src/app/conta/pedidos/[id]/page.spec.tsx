import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { useParams, push, router } = vi.hoisted(() => {
  const pushMock = vi.fn();
  return { useParams: vi.fn(), push: pushMock, router: { push: pushMock } };
});

vi.mock('next/navigation', () => ({ useParams, useRouter: () => router }));

vi.mock('@/components/header', () => ({
  Header: () => <header />,
}));

const PedidoPage = (await import('./page')).default;

const server = setupServer();

const orderId = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

const orderUrl = /\/api\/orders\/[^/]+$/;

const cancelUrl = /\/api\/orders\/[^/]+\/cancel$/;

const orderResponse = {
  order: {
    id: orderId,
    eventSlug: 'o-fantasma-da-opera',
    status: 'paid',
    paymentMethod: 'card',
    subtotalCents: 12000,
    serviceFeeCents: 1200,
    totalCents: 13200,
    refundCents: null,
    items: [
      {
        sectorSlug: 'plateia',
        sectorName: 'Plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
        priceCents: 12000,
        ticket: { code: 'abc123', status: 'valid' },
      },
    ],
    createdAt: '2026-10-18T12:00:00.000Z',
    paidAt: '2026-10-18T12:05:00.000Z',
  },
  event: {
    slug: 'o-fantasma-da-opera',
    title: 'O Fantasma da Ópera',
    startsAt: '2026-11-20T23:00:00.000Z',
  },
};

describe('PedidoPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    useParams.mockReturnValue({ id: orderId });
  });
  afterEach(() => {
    server.resetHandlers();
    useParams.mockReset();
    push.mockReset();
  });
  afterAll(() => server.close());

  it('mostra o resumo do pedido com os ingressos', async () => {
    server.use(http.get(orderUrl, () => HttpResponse.json(orderResponse)));

    render(<PedidoPage />);

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 6'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pedido' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'O Fantasma da Ópera' }),
    ).toBeInTheDocument();
    expect(screen.getByText('20 de Novembro, 2026')).toBeInTheDocument();
    expect(screen.getByText('18 de Outubro, 2026')).toBeInTheDocument();
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
    expect(screen.getByText('Pagamento').parentElement).toHaveTextContent(
      'Cartão',
    );
    expect(screen.getByText('R$ 132,00')).toBeInTheDocument();
    expect(screen.getByText('Válido para entrada')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'QR Code do ingresso' }),
    ).toBeInTheDocument();
  });

  it('mostra o carregamento enquanto busca o pedido', () => {
    server.use(
      http.get(orderUrl, async () => {
        await delay('infinite');
        return HttpResponse.json(orderResponse);
      }),
    );

    render(<PedidoPage />);

    expect(screen.getByText('Carregando o pedido...')).toBeInTheDocument();
  });

  it('mostra que o pedido não foi encontrado quando a API responde 404', async () => {
    server.use(
      http.get(orderUrl, () =>
        HttpResponse.json({ error: 'order_not_found' }, { status: 404 }),
      ),
    );

    render(<PedidoPage />);

    expect(
      await screen.findByText('Pedido não encontrado.'),
    ).toBeInTheDocument();
  });

  it('redireciona para /entrar quando a API responde 401', async () => {
    server.use(
      http.get(orderUrl, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );

    render(<PedidoPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/entrar'));
    expect(
      screen.queryByText('Não foi possível carregar o pedido.'),
    ).not.toBeInTheDocument();
  });

  it('mostra o erro quando a API falha', async () => {
    server.use(
      http.get(orderUrl, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(<PedidoPage />);

    expect(
      await screen.findByText('Não foi possível carregar o pedido.'),
    ).toBeInTheDocument();
  });

  it('mostra o slug do evento quando o evento não existe mais', async () => {
    server.use(
      http.get(orderUrl, () =>
        HttpResponse.json({ ...orderResponse, event: null }),
      ),
    );

    render(<PedidoPage />);

    expect(
      await screen.findByRole('heading', { name: 'o-fantasma-da-opera' }),
    ).toBeInTheDocument();
  });

  it('recarrega o pedido quando o id muda depois de um 404', async () => {
    const otherOrderId = '22222222-2222-4222-8222-222222222222';

    server.use(
      http.get(orderUrl, ({ request }) => {
        const { pathname } = new URL(request.url);
        if (pathname.endsWith(orderId)) {
          return HttpResponse.json(
            { error: 'order_not_found' },
            { status: 404 },
          );
        }
        return HttpResponse.json(orderResponse);
      }),
    );

    const { rerender } = render(<PedidoPage />);

    expect(
      await screen.findByText('Pedido não encontrado.'),
    ).toBeInTheDocument();

    useParams.mockReturnValue({ id: otherOrderId });
    rerender(<PedidoPage />);

    expect(
      await screen.findByRole('heading', { name: 'O Fantasma da Ópera' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Pedido não encontrado.'),
    ).not.toBeInTheDocument();
  });

  it('mostra o botão Cancelar pedido para pedido pago', async () => {
    server.use(http.get(orderUrl, () => HttpResponse.json(orderResponse)));

    render(<PedidoPage />);

    expect(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    ).toBeInTheDocument();
  });

  it('não mostra o botão Cancelar pedido quando o pedido não está pago', async () => {
    server.use(
      http.get(orderUrl, () =>
        HttpResponse.json({
          ...orderResponse,
          order: { ...orderResponse.order, status: 'pending', paidAt: null },
        }),
      ),
    );

    render(<PedidoPage />);

    expect(await screen.findByText('Aguardando pagamento')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancelar pedido' }),
    ).not.toBeInTheDocument();
  });

  it('cancela o pedido pago e mostra o reembolso', async () => {
    server.use(
      http.get(orderUrl, () => HttpResponse.json(orderResponse)),
      http.post(cancelUrl, () =>
        HttpResponse.json({
          ...orderResponse,
          order: {
            ...orderResponse.order,
            status: 'refunded',
            refundCents: 13200,
          },
        }),
      ),
    );

    render(<PedidoPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    );

    expect(await screen.findByText('Reembolsado')).toBeInTheDocument();
    expect(screen.getByText('Reembolso de R$ 132,00')).toBeInTheDocument();
  });

  it('mostra o erro quando a janela de cancelamento encerrou', async () => {
    server.use(
      http.get(orderUrl, () => HttpResponse.json(orderResponse)),
      http.post(cancelUrl, () =>
        HttpResponse.json({ error: 'refund_window_closed' }, { status: 409 }),
      ),
    );

    render(<PedidoPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O período de cancelamento deste pedido já encerrou.',
    );
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
  });

  it('mostra o erro quando a política do evento não permite reembolso', async () => {
    server.use(
      http.get(orderUrl, () => HttpResponse.json(orderResponse)),
      http.post(cancelUrl, () =>
        HttpResponse.json({ error: 'refund_not_allowed' }, { status: 409 }),
      ),
    );

    render(<PedidoPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A política de cancelamento deste evento não permite reembolso.',
    );
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
  });

  it('mostra o erro quando o pedido não pode mais ser cancelado', async () => {
    server.use(
      http.get(orderUrl, () => HttpResponse.json(orderResponse)),
      http.post(cancelUrl, () =>
        HttpResponse.json({ error: 'order_not_cancellable' }, { status: 409 }),
      ),
    );

    render(<PedidoPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este pedido não pode mais ser cancelado.',
    );
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
  });

  it('mostra o erro quando o provedor de reembolso falha', async () => {
    server.use(
      http.get(orderUrl, () => HttpResponse.json(orderResponse)),
      http.post(cancelUrl, () =>
        HttpResponse.json({ error: 'refund_provider_error' }, { status: 502 }),
      ),
    );

    render(<PedidoPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancelar pedido' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível processar o reembolso agora. Tente novamente.',
    );
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
  });
});
