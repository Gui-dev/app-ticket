import { render, screen } from '@testing-library/react';
import type { OrderSummaryDto } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { AccountOrders } from './account-orders';

const orderId = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

const paidOrder: OrderSummaryDto = {
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
};

describe('AccountOrders', () => {
  it('mostra o evento, a data, o status, o total e os ingressos do pedido', () => {
    render(<AccountOrders orders={[paidOrder]} />);

    expect(screen.getByText('O Fantasma da Ópera')).toBeInTheDocument();
    expect(screen.getByText('20 de Novembro, 2026')).toBeInTheDocument();
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
    expect(screen.getByText('R$ 132,00')).toBeInTheDocument();
    expect(screen.getByText('1 ingresso')).toBeInTheDocument();
  });

  it('leva para o detalhe do pedido', () => {
    render(<AccountOrders orders={[paidOrder]} />);

    expect(
      screen.getByRole('link', { name: /O Fantasma da Ópera/ }),
    ).toHaveAttribute('href', `/conta/pedidos/${orderId}`);
  });

  it('mostra a mensagem de lista vazia', () => {
    render(<AccountOrders orders={[]} />);

    expect(
      screen.getByText('Você ainda não fez nenhum pedido.'),
    ).toBeInTheDocument();
  });
});
