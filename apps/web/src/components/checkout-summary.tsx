import { formatBRL } from '@/lib/format';

export interface CheckoutSummaryItem {
  sectorSlug: string;
  sectorName?: string;
  rowLabel: string;
  seatLabel: string;
  priceCents: number;
}

export interface CheckoutSummaryProps {
  items: CheckoutSummaryItem[];
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
}

export function CheckoutSummary({
  items,
  subtotalCents,
  serviceFeeCents,
  totalCents,
}: CheckoutSummaryProps) {
  return (
    <section
      aria-label="Resumo do pedido"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">
        Resumo do pedido
      </h2>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
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
          <dd>{formatBRL(subtotalCents)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Taxa de serviço</dt>
          <dd>{formatBRL(serviceFeeCents)}</dd>
        </div>
      </dl>

      <p className="text-sm font-medium text-foreground">
        Total: {formatBRL(totalCents)}
      </p>
    </section>
  );
}
