'use client';

import {
  bestSeatResponseSchema,
  type SeatmapDto,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import { cn } from 'cn';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { formatBRL } from '@/lib/format';

interface SeatMapProps {
  eventSlug: string;
}

interface SelectedSeat {
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn('size-4 rounded border', swatch)}
      />
      {label}
    </li>
  );
}

export function SeatMap({ eventSlug }: SeatMapProps) {
  const [seatmap, setSeatmap] = useState<SeatmapDto | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bestPending, setBestPending] = useState(false);
  const [bestError, setBestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/events/${encodeURIComponent(eventSlug)}/seatmap`,
          {
            signal: AbortSignal.timeout(5000),
          },
        );
        if (response.status === 404) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!response.ok) throw new Error('seatmap_request_failed');
        const payload = seatmapResponseSchema.parse(await response.json());
        if (!cancelled) {
          setSeatmap(payload.seatmap);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventSlug]);

  async function pickBestSeat(sectorSlug: string) {
    setBestPending(true);
    setBestError(null);
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/best-seat?sector=${encodeURIComponent(sectorSlug)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        setBestError('Não há assentos livres neste setor.');
        return;
      }
      if (!response.ok) throw new Error('best_seat_request_failed');
      const payload = bestSeatResponseSchema.parse(await response.json());
      const sector = seatmap?.sectors.find(
        (item) => item.slug === payload.seat.sectorSlug,
      );
      if (!sector) throw new Error('best_seat_unknown_sector');
      setActiveSlug(sector.slug);
      setSelected({
        sectorName: sector.name,
        rowLabel: payload.seat.rowLabel,
        seatLabel: payload.seat.seatLabel,
        priceFromCents: payload.seat.priceFromCents,
      });
    } catch {
      setBestError('Não foi possível escolher o melhor lugar agora.');
    } finally {
      setBestPending(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando mapa de assentos...
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o mapa de assentos.
      </p>
    );
  }

  if (!seatmap || seatmap.sectors.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        O mapa de assentos ainda não foi publicado para este evento.
      </p>
    );
  }

  const sector =
    seatmap.sectors.find((item) => item.slug === activeSlug) ??
    seatmap.sectors[0];
  const totalSeats = sector.rows.reduce(
    (sum, row) => sum + row.seats.length,
    0,
  );
  const availableSeats = sector.rows.reduce(
    (sum, row) =>
      sum + row.seats.filter((seat) => seat.status === 'available').length,
    0,
  );

  return (
    <section aria-label="Mapa de assentos" className="flex flex-col gap-6">
      <ul className="flex flex-wrap gap-2">
        {seatmap.sectors.map((item) => (
          <li key={item.slug}>
            <Chip
              label={item.name}
              selected={item.slug === sector.slug}
              onClick={() => {
                setActiveSlug(item.slug);
                setSelected(null);
                setBestError(null);
              }}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium text-foreground">
          {sector.name} · {formatBRL(sector.priceFromCents)} · {availableSeats}{' '}
          de {totalSeats} livres
        </p>
        <p className="text-xs text-muted-foreground">
          Fila A fica mais perto do palco.
        </p>
      </div>

      <ul className="flex flex-wrap gap-4">
        <LegendItem swatch="bg-secondary border-border" label="Livre" />
        <LegendItem swatch="bg-muted opacity-60" label="Ocupada" />
        <LegendItem
          swatch="bg-destructive/10 opacity-60"
          label="Indisponível"
        />
        <LegendItem swatch="bg-primary border-primary" label="Selecionada" />
      </ul>

      <div className="overflow-x-auto pb-2">
        <ul className="flex w-max flex-col gap-2">
          {sector.rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-xs font-medium text-muted-foreground">
                {row.label}
              </span>
              <div className="flex gap-1.5">
                {row.seats.map((seat) => {
                  const isSelected =
                    selected !== null &&
                    selected.rowLabel === row.label &&
                    selected.seatLabel === seat.label &&
                    selected.sectorName === sector.name;
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      disabled={seat.status !== 'available'}
                      aria-label={`Cadeira ${seat.label}, fila ${row.label}`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelected({
                          sectorName: sector.name,
                          rowLabel: row.label,
                          seatLabel: seat.label,
                          priceFromCents: sector.priceFromCents,
                        })
                      }
                      className={cn(
                        'size-8 shrink-0 rounded-md border text-xs font-medium transition-colors',
                        seat.status === 'available' &&
                          'bg-secondary border-border hover:border-primary',
                        seat.status === 'occupied' &&
                          'cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60',
                        seat.status === 'unavailable' &&
                          'cursor-not-allowed bg-destructive/10 text-muted-foreground opacity-60',
                        isSelected &&
                          'bg-primary text-primary-foreground border-primary',
                      )}
                    >
                      {seat.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={bestPending}
            onClick={() => pickBestSeat(sector.slug)}
          >
            {bestPending ? 'Escolhendo...' : 'Melhor lugar disponível'}
          </Button>
        </div>

        {bestError && (
          <p role="alert" className="text-sm text-destructive">
            {bestError}
          </p>
        )}

        <div aria-live="polite">
          {selected && (
            <p role="status" className="text-sm font-medium text-foreground">
              Você selecionou: {selected.sectorName} · Fila {selected.rowLabel}{' '}
              · Cadeira {selected.seatLabel} ·{' '}
              {formatBRL(selected.priceFromCents)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
