'use client';

import {
  bestSeatResponseSchema,
  holdRequestSchema,
  holdResponseSchema,
  SEAT_HOLD_RENEW_AFTER_SECONDS,
  type SeatmapDto,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import { cn } from 'cn';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { authClient } from '@/lib/auth-client';
import { formatBRL } from '@/lib/format';

interface SeatMapProps {
  eventSlug: string;
}

interface SelectedSeat {
  sectorSlug: string;
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}

class HoldConflictError extends Error {}

const TICK_MS = 1_000;
const POLL_MS = 10_000;

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

function toSelectedSeat(
  seatmap: SeatmapDto,
  hold: { sectorSlug: string; rowLabel: string; seatLabel: string },
): SelectedSeat | null {
  const sector = seatmap.sectors.find((item) => item.slug === hold.sectorSlug);
  if (!sector) return null;
  return {
    sectorSlug: sector.slug,
    sectorName: sector.name,
    rowLabel: hold.rowLabel,
    seatLabel: hold.seatLabel,
    priceFromCents: sector.priceFromCents,
  };
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000));
}

async function postHold(
  eventSlug: string,
  seat: SelectedSeat,
): Promise<Response> {
  const body = holdRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
  });
  return fetch(`/api/events/${encodeURIComponent(eventSlug)}/holds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

async function postRelease(
  eventSlug: string,
  seat: SelectedSeat,
): Promise<void> {
  const body = holdRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
  });
  await fetch(`/api/events/${encodeURIComponent(eventSlug)}/holds/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

export function SeatMap({ eventSlug }: SeatMapProps) {
  const [seatmap, setSeatmap] = useState<SeatmapDto | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [renewedNotice, setRenewedNotice] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bestPending, setBestPending] = useState(false);
  const [bestError, setBestError] = useState<string | null>(null);
  const renewingRef = useRef(false);
  const holdExpiresAtRef = useRef<string | null>(null);

  const applyHoldExpiry = useCallback((expiresAt: string | null) => {
    holdExpiresAtRef.current = expiresAt;
    setHoldExpiresAt(expiresAt);
  }, []);

  const fetchSeatmap = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/seatmap`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error('seatmap_request_failed');
      const payload = seatmapResponseSchema.parse(await response.json());
      setSeatmap(payload.seatmap);
      setLoading(false);
      const hold = payload.holds[0];
      if (hold) {
        const restored = toSelectedSeat(payload.seatmap, hold);
        if (restored) {
          setSelected(restored);
          applyHoldExpiry(hold.expiresAt);
          setRemainingSeconds(secondsUntil(hold.expiresAt));
        }
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [eventSlug, applyHoldExpiry]);

  useEffect(() => {
    fetchSeatmap();
    const interval = setInterval(() => {
      fetchSeatmap();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchSeatmap]);

  async function sendHold(seat: SelectedSeat): Promise<string> {
    let response = await postHold(eventSlug, seat);
    if (response.status === 401) {
      await authClient.signIn.anonymous();
      response = await postHold(eventSlug, seat);
    }
    if (response.status === 409) throw new HoldConflictError();
    if (!response.ok) throw new Error('hold_request_failed');
    const payload = holdResponseSchema.parse(await response.json());
    return payload.hold.expiresAt;
  }

  async function ensureHold(seat: SelectedSeat) {
    if (holdPending) return;
    setHoldPending(true);
    setHoldError(null);
    try {
      const expiresAt = await sendHold(seat);
      setSelected(seat);
      applyHoldExpiry(expiresAt);
      setRemainingSeconds(secondsUntil(expiresAt));
    } catch (err) {
      setSelected(null);
      applyHoldExpiry(null);
      setRemainingSeconds(null);
      setHoldError(
        err instanceof HoldConflictError
          ? 'Este assento acabou de ser reservado por outro comprador.'
          : 'Não foi possível reservar o assento. Tente novamente.',
      );
      fetchSeatmap();
    } finally {
      setHoldPending(false);
    }
  }

  function selectSeat(seat: SelectedSeat) {
    ensureHold(seat);
  }

  async function releaseHold() {
    if (!selected) return;
    const seat = selected;
    try {
      await postRelease(eventSlug, seat);
    } finally {
      setSelected(null);
      applyHoldExpiry(null);
      setRemainingSeconds(null);
      setRenewedNotice(false);
      setHoldError(null);
      fetchSeatmap();
    }
  }

  function switchSector(slug: string) {
    if (selected) {
      postRelease(eventSlug, selected).catch(() => {});
    }
    setSelected(null);
    applyHoldExpiry(null);
    setRemainingSeconds(null);
    setRenewedNotice(false);
    setHoldError(null);
    setBestError(null);
    setActiveSlug(slug);
  }

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
      selectSeat({
        sectorSlug: sector.slug,
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

  useEffect(() => {
    if (!holdExpiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const renewIfNeeded = () => {
      const current = holdExpiresAtRef.current;
      if (!current) return;
      const secondsLeft = secondsUntil(current);
      if (secondsLeft <= 0) {
        setSelected(null);
        applyHoldExpiry(null);
        setRemainingSeconds(null);
        setRenewedNotice(false);
        setHoldError('Sua reserva expirou. Selecione o assento novamente.');
        return;
      }
      setRemainingSeconds(secondsLeft);
      if (
        secondsLeft <= SEAT_HOLD_RENEW_AFTER_SECONDS &&
        selected &&
        !renewingRef.current
      ) {
        renewingRef.current = true;
        postHold(eventSlug, selected)
          .then(async (response) => {
            if (!response.ok) return;
            const payload = holdResponseSchema.parse(await response.json());
            applyHoldExpiry(payload.hold.expiresAt);
            setRenewedNotice(true);
          })
          .catch(() => {})
          .finally(() => {
            renewingRef.current = false;
          });
      }
    };

    renewIfNeeded();
    const interval = setInterval(renewIfNeeded, TICK_MS);
    return () => clearInterval(interval);
  }, [holdExpiresAt, selected, eventSlug, applyHoldExpiry]);

  useEffect(() => {
    if (!renewedNotice) return;
    const timeout = setTimeout(() => setRenewedNotice(false), 4000);
    return () => clearTimeout(timeout);
  }, [renewedNotice]);

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
              onClick={() => switchSector(item.slug)}
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
                    selected.sectorSlug === sector.slug;
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      disabled={seat.status !== 'available'}
                      aria-label={`Cadeira ${seat.label}, fila ${row.label}`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        selectSeat({
                          sectorSlug: sector.slug,
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

        {holdError && (
          <p role="alert" className="text-sm text-destructive">
            {holdError}
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
          {selected && remainingSeconds !== null && (
            <div className="mt-2 flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Reserva expira em {formatCountdown(remainingSeconds)}
              </p>
              {renewedNotice && (
                <p className="text-sm text-muted-foreground">
                  Reserva renovada
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => releaseHold()}
              >
                Desistir da reserva
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
