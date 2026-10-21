import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TicketQr } from './ticket-qr';

describe('TicketQr', () => {
  it('mostra o QR Code com a legenda do código informado', () => {
    const { container } = render(<TicketQr code="abc123" />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-label', 'QR Code do ingresso');
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });
});
