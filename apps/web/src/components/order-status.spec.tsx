import { render, screen } from '@testing-library/react';
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

import { OrderStatus } from './order-status';

const server = setupServer();

const paidOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  eventSlug: 'o-fantasma-da-opera',
  status: 'paid',
  paymentMethod: 'card',
  subtotalCents: 6000,
  serviceFeeCents: 600,
  totalCents: 6600,
  refundCents: null,
  items: [
    {
      sectorSlug: 'plateia',
      sectorName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
      priceCents: 6000,
      ticket: null,
    },
  ],
  createdAt: '2026-10-18T12:00:00.000Z',
  paidAt: '2026-10-18T12:05:00.000Z',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('OrderStatus', () => {
  it('mostra o pedido confirmado quando o pagamento foi aprovado', async () => {
    server.use(
      http.get(/\/api\/orders\/.+$/, () =>
        HttpResponse.json({ order: paidOrder }),
      ),
    );

    render(<OrderStatus orderId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByText('Pedido confirmado')).toBeInTheDocument();
    expect(
      screen.getByText('Plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 66,00')).toBeInTheDocument();
  });

  it('mostra que o pagamento ainda está pendente', async () => {
    server.use(
      http.get(/\/api\/orders\/.+$/, () =>
        HttpResponse.json({
          order: { ...paidOrder, status: 'pending', paidAt: null },
        }),
      ),
    );

    render(<OrderStatus orderId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByText('Aguardando pagamento')).toBeInTheDocument();
  });

  it('avisa quando o pedido não pode ser carregado', async () => {
    server.use(http.get(/\/api\/orders\/.+$/, () => HttpResponse.error()));

    render(<OrderStatus orderId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o pedido. Tente novamente.',
    );
  });

  it('não dispara um segundo poll enquanto o primeiro está em andamento', async () => {
    vi.useFakeTimers();
    try {
      let requests = 0;
      let release: () => void = () => {};
      server.use(
        http.get(/\/api\/orders\/.+$/, async () => {
          requests += 1;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ order: paidOrder });
        }),
      );

      render(<OrderStatus orderId="11111111-1111-4111-8111-111111111111" />);
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toBe(1);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(requests).toBe(1);

      release();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await vi.advanceTimersByTimeAsync(0);
        if (screen.queryByText('Pedido confirmado')) break;
      }
      expect(requests).toBe(1);
      expect(screen.getByText('Pedido confirmado')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
