import { render, screen } from '@testing-library/react';
import type { OrderDto } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { OrderTickets } from './order-tickets';

const baseOrder: OrderDto = {
  id: '11111111-1111-4111-8111-111111111111',
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
};

function orderWith(ticket: OrderDto['items'][number]['ticket']): OrderDto {
  return {
    ...baseOrder,
    items: [{ ...baseOrder.items[0], ticket }],
  };
}

describe('OrderTickets', () => {
  it('mostra o ingresso válido com o assento, o preço e o QR Code', () => {
    render(
      <OrderTickets order={orderWith({ code: 'abc123', status: 'valid' })} />,
    );

    expect(
      screen.getByText('Plateia · Fila A · Cadeira 6'),
    ).toBeInTheDocument();
    expect(screen.getByText('Inteira')).toBeInTheDocument();
    expect(screen.getByText('R$ 120,00')).toBeInTheDocument();
    expect(screen.getByText('Válido para entrada')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'QR Code do ingresso' }),
    ).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('mostra o ingresso inválido e mantém o QR Code visível', () => {
    render(
      <OrderTickets order={orderWith({ code: 'abc123', status: 'invalid' })} />,
    );

    expect(
      screen.getByText('Ingresso não válido para entrada'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'QR Code do ingresso' }),
    ).toBeInTheDocument();
  });

  it('avisa que o ingresso ainda não foi emitido e não mostra QR Code', () => {
    const { container } = render(<OrderTickets order={orderWith(null)} />);

    expect(screen.getByText('Ingresso ainda não emitido')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});
