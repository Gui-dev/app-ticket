import { render, screen } from '@testing-library/react';
import type { OrderDto } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { OrderConfirmation } from './order-confirmation';

const baseOrder: OrderDto = {
  id: '11111111-1111-4111-8111-111111111111',
  eventSlug: 'o-fantasma-da-opera',
  status: 'paid',
  paymentMethod: 'card',
  subtotalCents: 18000,
  serviceFeeCents: 1800,
  totalCents: 19800,
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

describe('OrderConfirmation', () => {
  it('mostra o pedido confirmado com os assentos e o total', () => {
    render(<OrderConfirmation order={baseOrder} />);

    expect(
      screen.getByRole('heading', { name: 'Pedido confirmado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 198,00')).toBeInTheDocument();
  });

  it('mostra que o pagamento está aguardando quando o pedido está pendente', () => {
    render(
      <OrderConfirmation
        order={{ ...baseOrder, status: 'pending', paidAt: null }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Aguardando pagamento' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Pedido confirmado' }),
    ).not.toBeInTheDocument();
  });

  it('mostra que o pagamento não foi confirmado e o motivo', () => {
    render(
      <OrderConfirmation
        order={{ ...baseOrder, status: 'failed', paidAt: null }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Pagamento não confirmado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'O pagamento não foi aprovado e os assentos foram liberados.',
      ),
    ).toBeInTheDocument();
  });

  it('mostra que o pedido expirou quando a reserva acabou', () => {
    render(
      <OrderConfirmation
        order={{ ...baseOrder, status: 'expired', paidAt: null }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Pedido expirado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A reserva dos assentos expirou antes da confirmação do pagamento.',
      ),
    ).toBeInTheDocument();
  });

  it('mostra que o pedido foi reembolsado', () => {
    render(
      <OrderConfirmation
        order={{ ...baseOrder, status: 'refunded', refundCents: 19800 }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Reembolsado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'O cancelamento foi concluído e o valor pago foi reembolsado.',
      ),
    ).toBeInTheDocument();
  });
});
