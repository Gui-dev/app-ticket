import {
  formatBRL,
  formatDatePtBR,
  TICKET_TYPE_LABELS,
  type TicketType,
} from '@ticketvibe/shared';

import type { EmailMessage } from './email-sender.js';

export interface OrderConfirmationItem {
  sectorSlug: string;
  sectorName: string | null;
  rowLabel: string;
  seatLabel: string;
  ticketType: TicketType;
  priceCents: number;
}

export interface OrderConfirmationData {
  orderId: string;
  buyerEmail: string;
  eventTitle: string;
  eventStartsAt: Date;
  venueName: string;
  venueCity: string;
  venueState: string;
  items: OrderConfirmationItem[];
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function buildOrderConfirmationEmail(
  data: OrderConfirmationData,
): EmailMessage {
  const itemLines = data.items.map(
    (item) =>
      `- ${item.sectorName ?? item.sectorSlug} · Fila ${item.rowLabel} · Cadeira ${item.seatLabel} · ${TICKET_TYPE_LABELS[item.ticketType]} · ${formatBRL(item.priceCents)}`,
  );

  const lines = [
    'Olá!',
    '',
    'Sua compra foi confirmada no TICKETVIBE.',
    '',
    `Pedido: ${data.orderId}`,
    `Evento: ${data.eventTitle}`,
    `Data: ${formatDatePtBR(data.eventStartsAt.toISOString())} às ${timeFormatter.format(data.eventStartsAt)}`,
    `Local: ${data.venueName} - ${data.venueCity}/${data.venueState}`,
    '',
    'Ingressos:',
    ...itemLines,
    '',
    `Subtotal: ${formatBRL(data.subtotalCents)}`,
    `Taxa de serviço: ${formatBRL(data.serviceFeeCents)}`,
    `Total: ${formatBRL(data.totalCents)}`,
  ];

  return {
    to: data.buyerEmail,
    subject: `Compra confirmada: ${data.eventTitle}`,
    text: lines.join('\n'),
  };
}
