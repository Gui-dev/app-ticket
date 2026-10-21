import type { OrderSummaryDto } from '@ticketvibe/shared';
import Link from 'next/link';

import { formatBRL, formatDatePtBR } from '@/lib/format';

export interface AccountOrdersProps {
  orders: OrderSummaryDto[];
}

const STATUS_LABELS: Record<OrderSummaryDto['status'], string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pagamento confirmado',
  failed: 'Pagamento não confirmado',
  expired: 'Pedido expirado',
};

function ticketCountLabel(count: number): string {
  return count === 1 ? '1 ingresso' : `${count} ingressos`;
}

export function AccountOrders({ orders }: AccountOrdersProps) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Você ainda não fez nenhum pedido.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/conta/pedidos/${order.id}`}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="font-heading text-lg font-semibold text-foreground">
              {order.eventTitle}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatDatePtBR(order.eventStartsAt)}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="rounded-full bg-secondary px-3 py-1 font-medium text-foreground">
                {STATUS_LABELS[order.status]}
              </span>
              <span className="text-muted-foreground">
                {ticketCountLabel(order.itemCount)}
              </span>
              <span className="ml-auto font-semibold text-foreground">
                {formatBRL(order.totalCents)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
