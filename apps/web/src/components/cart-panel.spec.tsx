import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CartPanel, type CartPanelItem } from './cart-panel';

function baseItem(overrides: Partial<CartPanelItem> = {}): CartPanelItem {
  return {
    sectorSlug: 'plateia',
    sectorName: 'Plateia',
    rowLabel: 'A',
    seatLabel: '6',
    ticketType: 'inteira',
    priceCents: 12000,
    ...overrides,
  };
}

describe('CartPanel', () => {
  it('renders each seat with its price and the total', () => {
    render(
      <CartPanel
        items={[
          baseItem(),
          baseItem({ seatLabel: '8', ticketType: 'meia', priceCents: 6000 }),
        ]}
        totalCents={18000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Plateia · Fila A · Cadeira 8 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText(/Reserva expira em 09:59/)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(
      <CartPanel
        items={[]}
        totalCents={0}
        remainingSeconds={null}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    expect(screen.getByText('Nenhum assento no carrinho.')).toBeInTheDocument();
    expect(screen.queryByText(/Reserva expira em/)).not.toBeInTheDocument();
  });

  it('calls onTypeChange with the new type', () => {
    const onTypeChange = vi.fn();
    render(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={onTypeChange}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByLabelText('Tipo de ingresso — Plateia, fila A, cadeira 6'),
      { target: { value: 'meia' } },
    );
    expect(onTypeChange).toHaveBeenCalledWith(
      expect.objectContaining({ seatLabel: '6', rowLabel: 'A' }),
      'meia',
    );
  });

  it('calls onRemove and onGiveUpAll', () => {
    const onRemove = vi.fn();
    const onGiveUpAll = vi.fn();
    render(
      <CartPanel
        items={[baseItem(), baseItem({ seatLabel: '8' })]}
        totalCents={24000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={onRemove}
        onGiveUpAll={onGiveUpAll}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remover Plateia, fila A, cadeira 6',
      }),
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ seatLabel: '6' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Desistir de todos' }));
    expect(onGiveUpAll).toHaveBeenCalledOnce();
  });

  it('distinguishes same-numbered seats across sectors', () => {
    const onRemove = vi.fn();
    render(
      <CartPanel
        items={[
          baseItem(),
          baseItem({ sectorSlug: 'balcony', sectorName: 'Balcony' }),
        ]}
        totalCents={24000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={onRemove}
        onGiveUpAll={vi.fn()}
      />,
    );

    const balconyRemove = screen.getByRole('button', {
      name: 'Remover Balcony, fila A, cadeira 6',
    });
    fireEvent.click(balconyRemove);
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ sectorSlug: 'balcony' }),
    );
    expect(
      screen.getByLabelText('Tipo de ingresso — Plateia, fila A, cadeira 6'),
    ).toBeInTheDocument();
  });

  it('links to checkout when items exist', () => {
    render(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice={false}
        pending={false}
        error={null}
        checkoutHref="/events/o-fantasma-da-opera/checkout"
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Finalizar compra' }),
    ).toHaveAttribute('href', '/events/o-fantasma-da-opera/checkout');
  });

  it('does not link to checkout when the cart is empty', () => {
    render(
      <CartPanel
        items={[]}
        totalCents={0}
        remainingSeconds={null}
        renewedNotice={false}
        pending={false}
        error={null}
        checkoutHref="/events/o-fantasma-da-opera/checkout"
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('link', { name: 'Finalizar compra' }),
    ).not.toBeInTheDocument();
  });

  it('shows the renewed notice, the error and disables while pending', () => {
    const { rerender } = render(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice
        pending={false}
        error={null}
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Reserva renovada')).toBeInTheDocument();

    rerender(
      <CartPanel
        items={[baseItem()]}
        totalCents={12000}
        remainingSeconds={599}
        renewedNotice={false}
        pending
        error="Este assento acabou de ser reservado por outro comprador."
        onTypeChange={vi.fn()}
        onRemove={vi.fn()}
        onGiveUpAll={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Este assento acabou de ser reservado por outro comprador.',
    );
    expect(
      screen.getByRole('button', { name: 'Desistir de todos' }),
    ).toBeDisabled();
  });
});
