import { describe, expect, it } from 'vitest';

import {
  buildOrderConfirmationEmail,
  type OrderConfirmationData,
} from './order-confirmation.js';

const orderData: OrderConfirmationData = {
  orderId: 'order-123',
  buyerEmail: 'ana@example.com',
  eventTitle: 'O Fantasma da Opera',
  eventStartsAt: new Date('2026-07-12T23:00:00.000Z'),
  venueName: 'Teatro Municipal',
  venueCity: 'São Paulo',
  venueState: 'SP',
  items: [
    {
      sectorSlug: 'plateia',
      sectorName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
      priceCents: 6000,
    },
    {
      sectorSlug: 'plateia',
      sectorName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '7',
      ticketType: 'inteira',
      priceCents: 12000,
    },
  ],
  subtotalCents: 18000,
  serviceFeeCents: 1800,
  totalCents: 19800,
};

function expectFragmentsInOrder(text: string, fragments: string[]) {
  let cursor = -1;

  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor + 1);
    expect(
      index,
      `fragmento ausente ou fora de ordem: ${fragment}`,
    ).toBeGreaterThan(cursor);
    cursor = index;
  }
}

describe('buildOrderConfirmationEmail', () => {
  it('monta a confirmação de compra com os dados do pedido', () => {
    const message = buildOrderConfirmationEmail(orderData);

    expect(message.subject).toBe('Compra confirmada: O Fantasma da Opera');
    expect(message.to).toBe('ana@example.com');

    expectFragmentsInOrder(message.text, [
      'Pedido: order-123',
      'Evento: O Fantasma da Opera',
      'Data: 12 de Julho, 2026 às 20:00',
      'Local: Teatro Municipal - São Paulo/SP',
      'Ingressos:',
      'Plateia · Fila A · Cadeira 6 · Meia · R$ 60,00',
      'Plateia · Fila A · Cadeira 7 · Inteira · R$ 120,00',
      'Subtotal: R$ 180,00',
      'Taxa de serviço: R$ 18,00',
      'Total: R$ 198,00',
    ]);
  });

  it('usa o slug do setor quando o nome não está disponível', () => {
    const message = buildOrderConfirmationEmail({
      ...orderData,
      items: [{ ...orderData.items[0], sectorName: null }],
      subtotalCents: 6000,
      serviceFeeCents: 600,
      totalCents: 6600,
    });

    expect(message.text).toContain(
      'plateia · Fila A · Cadeira 6 · Meia · R$ 60,00',
    );
  });
});
