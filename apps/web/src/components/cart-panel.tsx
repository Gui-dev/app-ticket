import { type TicketType, ticketTypeSchema } from '@ticketvibe/shared';

import { cn } from 'cn';

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
  onTypeChange: (seat: CartPanelItem, ticketType: TicketType) => void;
  onRemove: (seat: CartPanelItem) => void;
  onGiveUpAll: () => void;
}

const TICKET_TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: 'inteira', label: 'Inteira' },
  { value: 'meia', label: 'Meia' },
  { value: 'vip', label: 'VIP' },
];

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
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="sr-only">
                      Tipo de ingresso — Cadeira {item.seatLabel}, fila{' '}
                      {item.rowLabel}
                    </span>
                    <select
                      aria-label={`Tipo de ingresso — Cadeira ${item.seatLabel}, fila ${item.rowLabel}`}
                      className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                      value={item.ticketType}
                      onChange={(event) => {
                        const parsed = ticketTypeSchema.safeParse(
                          event.target.value,
                        );
                        if (parsed.success) onTypeChange(item, parsed.data);
                      }}
                    >
                      {TICKET_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remover Cadeira ${item.seatLabel}, fila ${item.rowLabel}`}
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

          <div
            aria-live="polite"
            className={cn('flex flex-wrap items-center gap-3')}
          >
            {remainingSeconds !== null && (
              <p className="text-sm text-muted-foreground">
                Reserva expira em {formatCountdown(remainingSeconds)}
              </p>
            )}
            {renewedNotice && (
              <p className="text-sm text-muted-foreground">Reserva renovada</p>
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
