import type { OrderDto } from '@ticketvibe/shared';

import { formatBRL } from '@/lib/format';

export interface OrderConfirmationProps {
  order: OrderDto;
}

const STATUS_CONTENT: Record<
  OrderDto['status'],
  { title: string; description: string }
> = {
  paid: {
    title: 'Pedido confirmado',
    description: 'O pagamento foi aprovado e seus assentos estão garantidos.',
  },
  pending: {
    title: 'Aguardando pagamento',
    description:
      'Assim que o pagamento for aprovado, seus assentos serão confirmados.',
  },
  failed: {
    title: 'Pagamento não confirmado',
    description: 'O pagamento não foi aprovado e os assentos foram liberados.',
  },
  expired: {
    title: 'Pedido expirado',
    description:
      'A reserva dos assentos expirou antes da confirmação do pagamento.',
  },
  refunded: {
    title: 'Reembolsado',
    description: 'O cancelamento foi concluído e o valor pago foi reembolsado.',
  },
};

export function OrderConfirmation({ order }: OrderConfirmationProps) {
  const content = STATUS_CONTENT[order.status];

  return (
    <section
      aria-label="Pedido"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">{content.title}</h2>
      <p className="text-sm text-muted-foreground">{content.description}</p>

      <ul className="flex flex-col gap-2">
        {order.items.map((item) => (
          <li
            key={`${item.sectorSlug}:${item.rowLabel}:${item.seatLabel}`}
            className="text-sm text-foreground"
          >
            {item.sectorName ?? item.sectorSlug} · Fila {item.rowLabel} ·
            Cadeira {item.seatLabel} · {formatBRL(item.priceCents)}
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <dt>Subtotal</dt>
          <dd>{formatBRL(order.subtotalCents)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Taxa de serviço</dt>
          <dd>{formatBRL(order.serviceFeeCents)}</dd>
        </div>
      </dl>

      <p className="text-sm font-medium text-foreground">
        Total: {formatBRL(order.totalCents)}
      </p>
    </section>
  );
}
