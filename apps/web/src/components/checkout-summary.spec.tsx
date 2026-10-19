import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CheckoutSummary } from './checkout-summary';

describe('CheckoutSummary', () => {
  it('mostra cada item, a taxa de serviço e o total', () => {
    render(
      <CheckoutSummary
        items={[
          {
            sectorSlug: 'plateia',
            sectorName: 'Plateia',
            rowLabel: 'A',
            seatLabel: '6',
            priceCents: 6000,
          },
          {
            sectorSlug: 'plateia',
            sectorName: 'Plateia',
            rowLabel: 'A',
            seatLabel: '7',
            priceCents: 12000,
          },
        ]}
        subtotalCents={18000}
        serviceFeeCents={1800}
        totalCents={19800}
      />,
    );

    expect(
      screen.getByText('Plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Plateia · Fila A · Cadeira 7 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Taxa de serviço')).toBeInTheDocument();
    expect(screen.getByText('R$ 18,00')).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 198,00')).toBeInTheDocument();
  });

  it('usa o slug do setor quando o nome não está disponível', () => {
    render(
      <CheckoutSummary
        items={[
          {
            sectorSlug: 'plateia',
            rowLabel: 'A',
            seatLabel: '6',
            priceCents: 6000,
          },
        ]}
        subtotalCents={6000}
        serviceFeeCents={600}
        totalCents={6600}
      />,
    );

    expect(
      screen.getByText('plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
  });
});
