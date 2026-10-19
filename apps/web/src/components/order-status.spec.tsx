import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
  items: [
    {
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
      priceCents: 6000,
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
      screen.getByText('plateia · Fila A · Cadeira 6 · R$ 60,00'),
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
});
