import {
  TICKET_TYPE_LABELS,
  type TicketType,
  ticketTypeSchema,
} from '@ticketvibe/shared';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';

export interface CartPanelItem {
  sectorSlug: string;
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  ticketType: TicketType;
  priceCents: number;
}

interface CartPanelProps {
  items: CartPanelItem[];
  totalCents: number;
  remainingSeconds: number | null;
  renewedNotice: boolean;
  pending: boolean;
  error: string | null;
  checkoutHref?: string;
  onTypeChange: (seat: CartPanelItem, ticketType: TicketType) => void;
  onRemove: (seat: CartPanelItem) => void;
  onGiveUpAll: () => void;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function CartPanel({
  items,
  totalCents,
  remainingSeconds,
  renewedNotice,
  pending,
  error,
  checkoutHref,
  onTypeChange,
  onRemove,
  onGiveUpAll,
}: CartPanelProps) {
  const hasItems = items.length > 0;

  return (
    <section
      aria-label="Carrinho"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">Carrinho</h2>

      {hasItems ? (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={`${item.sectorSlug}:${item.rowLabel}:${item.seatLabel}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-foreground">
                  {item.sectorName} · Fila {item.rowLabel} · Cadeira{' '}
                  {item.seatLabel} · {formatBRL(item.priceCents)}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <select
                    aria-label={`Tipo de ingresso — ${item.sectorName}, fila ${item.rowLabel}, cadeira ${item.seatLabel}`}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                    value={item.ticketType}
                    onChange={(event) => {
                      const parsed = ticketTypeSchema.safeParse(
                        event.target.value,
                      );
                      if (parsed.success) onTypeChange(item, parsed.data);
                    }}
                  >
                    {Object.entries(TICKET_TYPE_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remover ${item.sectorName}, fila ${item.rowLabel}, cadeira ${item.seatLabel}`}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => onRemove(item)}
                  >
                    Remover
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-sm font-medium text-foreground">
            Total: {formatBRL(totalCents)}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {remainingSeconds !== null && (
              <p className="text-sm text-muted-foreground">
                Reserva expira em {formatCountdown(remainingSeconds)}
              </p>
            )}
            {renewedNotice && (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Reserva renovada
              </p>
            )}
            {checkoutHref && (
              <Button asChild>
                <Link href={checkoutHref}>Finalizar compra</Link>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onGiveUpAll}
            >
              Desistir de todos
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum assento no carrinho.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
