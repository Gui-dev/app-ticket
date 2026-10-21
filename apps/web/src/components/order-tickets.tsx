import {
  type OrderDto,
  TICKET_TYPE_LABELS,
  type TicketStatusDto,
} from '@ticketvibe/shared';
import { TicketQr } from '@/components/ticket-qr';
import { formatBRL } from '@/lib/format';

export interface OrderTicketsProps {
  order: OrderDto;
}

const TICKET_STATUS_LABELS: Record<TicketStatusDto, string> = {
  valid: 'Válido para entrada',
  invalid: 'Ingresso não válido para entrada',
};

export function OrderTickets({ order }: OrderTicketsProps) {
  return (
    <section aria-label="Ingressos" className="flex flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold text-foreground">
        Ingressos
      </h2>
      <ul className="flex flex-col gap-4">
        {order.items.map((item) => (
          <li
            key={`${item.sectorSlug}:${item.rowLabel}:${item.seatLabel}`}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm font-medium text-foreground">
              {item.sectorName ?? item.sectorSlug} · Fila {item.rowLabel} ·
              Cadeira {item.seatLabel}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {TICKET_TYPE_LABELS[item.ticketType]}
              </span>
              <span className="font-semibold text-foreground">
                {formatBRL(item.priceCents)}
              </span>
            </div>
            {item.ticket ? (
              <div className="flex flex-col gap-3">
                <p className="w-fit rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
                  {TICKET_STATUS_LABELS[item.ticket.status]}
                </p>
                <TicketQr code={item.ticket.code} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ingresso ainda não emitido
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
