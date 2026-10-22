'use client';

import {
  bestSeatResponseSchema,
  cartItemRequestSchema,
  cartSchema,
  holdRequestSchema,
  holdResponseSchema,
  SEAT_HOLD_RENEW_AFTER_SECONDS,
  type SeatAvailabilityMessage,
  type SeatmapDto,
  seatmapResponseSchema,
  type TicketType,
  ticketPriceCents,
} from '@ticketvibe/shared';
import { cn } from 'cn';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CartPanel, type CartPanelItem } from '@/components/cart-panel';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ensureAnonymousSession } from '@/lib/auth-client';
import { formatBRL } from '@/lib/format';
import {
  applySeatStatuses,
  useSeatAvailability,
} from '@/lib/use-seat-availability';

interface SeatMapProps {
  eventSlug: string;
}

interface SeatCandidate {
  sectorSlug: string;
  sectorName: string;
  rowLabel: string;
  seatLabel: string;
  priceFromCents: number;
}

interface SelectedSeat extends SeatCandidate {
  expiresAt: string;
  ticketType: TicketType;
  addedAtMs: number;
}

class HoldConflictError extends Error {}
class CartLimitError extends Error {}

function cartSeatKey(seat: {
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
}): string {
  return `${seat.sectorSlug}:${seat.rowLabel}:${seat.seatLabel}`;
}

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
): SeatCandidate | null {
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

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

async function postHold(
  eventSlug: string,
  seat: SeatCandidate,
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
  seat: SeatCandidate,
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

async function putCartItem(
  eventSlug: string,
  seat: SeatCandidate,
  ticketType: TicketType,
): Promise<Response> {
  const body = cartItemRequestSchema.parse({
    sectorSlug: seat.sectorSlug,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
    ticketType,
  });
  return fetch(`/api/events/${encodeURIComponent(eventSlug)}/cart/items`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

export function SeatMap({ eventSlug }: SeatMapProps) {
  const [seatmap, setSeatmap] = useState<SeatmapDto | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [items, setItems] = useState<SelectedSeat[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [renewedNotice, setRenewedNotice] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [giveUpPending, setGiveUpPending] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bestPending, setBestPending] = useState(false);
  const [bestError, setBestError] = useState<string | null>(null);
  const itemsRef = useRef<SelectedSeat[]>([]);
  const pendingKeysRef = useRef<Set<string>>(new Set());
  const renewingRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(new Set());
  const cancelledDuringPendingRef = useRef<Set<string>>(new Set());
  const typesFetchedRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const applyItems = useCallback((next: SelectedSeat[]) => {
    itemsRef.current = next;
    setItems(next);
    if (next.length === 0) {
      setRemainingSeconds(null);
      return;
    }
    setRemainingSeconds(
      Math.min(...next.map((item) => secondsUntil(item.expiresAt))),
    );
  }, []);

  const fetchTypes = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/cart`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return;
      const cart = cartSchema.parse(await response.json());
      const typeByKey = new Map(
        cart.items.map((item) => [cartSeatKey(item), item.ticketType]),
      );
      if (typeByKey.size === 0) return;
      applyItems(
        itemsRef.current.map((item) => {
          const ticketType = typeByKey.get(cartSeatKey(item));
          return ticketType ? { ...item, ticketType } : item;
        }),
      );
      typesFetchedRef.current = true;
    } catch {}
  }, [eventSlug, applyItems]);

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
      hasLoadedRef.current = true;
      setError(false);

      const nowMs = Date.now();
      const next: SelectedSeat[] = [];
      for (const hold of payload.holds) {
        const key = cartSeatKey(hold);
        if (dismissedRef.current.has(key)) continue;
        const restored = toSelectedSeat(payload.seatmap, hold);
        if (!restored) continue;
        const existing = itemsRef.current.find(
          (item) => cartSeatKey(item) === key,
        );
        next.push(
          existing
            ? { ...existing, expiresAt: hold.expiresAt }
            : {
                ...restored,
                expiresAt: hold.expiresAt,
                ticketType: 'inteira' as const,
                addedAtMs: nowMs,
              },
        );
      }
      for (const local of itemsRef.current) {
        if (next.some((item) => cartSeatKey(item) === cartSeatKey(local))) {
          continue;
        }
        if (nowMs - local.addedAtMs < POLL_MS) next.push(local);
      }
      applyItems(next);
      if (!typesFetchedRef.current && payload.holds.length > 0) {
        void fetchTypes();
      }
    } catch {
      setLoading(false);
      if (!hasLoadedRef.current) setError(true);
    }
  }, [eventSlug, applyItems, fetchTypes]);

  useEffect(() => {
    fetchSeatmap();
  }, [fetchSeatmap]);

  const wsOpen = useSeatAvailability({
    eventSlug,
    onMessage: useCallback(
      (message: SeatAvailabilityMessage) => {
        if (message.type === 'connected') {
          void fetchSeatmap();
          return;
        }
        setSeatmap((prev) =>
          prev ? applySeatStatuses(prev, message.changes) : prev,
        );
      },
      [fetchSeatmap],
    ),
  });

  useEffect(() => {
    if (wsOpen) return;
    const interval = setInterval(() => {
      fetchSeatmap();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [wsOpen, fetchSeatmap]);

  async function sendHold(seat: SeatCandidate): Promise<string> {
    let response = await postHold(eventSlug, seat);
    if (response.status === 401) {
      await ensureAnonymousSession();
      response = await postHold(eventSlug, seat);
    }
    if (response.status === 409) {
      let code: unknown;
      try {
        code = (await response.json()).error;
      } catch {
        code = undefined;
      }
      if (code === 'cart_limit') throw new CartLimitError();
      throw new HoldConflictError();
    }
    if (!response.ok) throw new Error('hold_request_failed');
    const payload = holdResponseSchema.parse(await response.json());
    return payload.hold.expiresAt;
  }

  async function ensureHold(seat: SeatCandidate) {
    const key = cartSeatKey(seat);
    if (pendingKeysRef.current.has(key)) return;
    pendingKeysRef.current.add(key);
    setHoldPending(true);
    setHoldError(null);
    try {
      const expiresAt = await sendHold(seat);
      if (cancelledDuringPendingRef.current.delete(key)) {
        return;
      }
      dismissedRef.current.delete(key);
      const existing = itemsRef.current.find(
        (item) => cartSeatKey(item) === key,
      );
      applyItems(
        existing
          ? itemsRef.current.map((item) =>
              cartSeatKey(item) === key ? { ...item, expiresAt } : item,
            )
          : [
              ...itemsRef.current,
              {
                ...seat,
                expiresAt,
                ticketType: 'inteira' as const,
                addedAtMs: Date.now(),
              },
            ],
      );
    } catch (err) {
      setHoldError(
        err instanceof CartLimitError
          ? 'Você já reservou o número máximo de assentos.'
          : err instanceof HoldConflictError
            ? 'Este assento acabou de ser reservado por outro comprador.'
            : 'Não foi possível reservar o assento. Tente novamente.',
      );
      fetchSeatmap();
    } finally {
      cancelledDuringPendingRef.current.delete(key);
      pendingKeysRef.current.delete(key);
      setHoldPending(pendingKeysRef.current.size > 0);
    }
  }

  function removeItem(seat: SelectedSeat) {
    const key = cartSeatKey(seat);
    dismissedRef.current.add(key);
    if (pendingKeysRef.current.has(key)) {
      cancelledDuringPendingRef.current.add(key);
    }
    pendingKeysRef.current.delete(key);
    setHoldPending(pendingKeysRef.current.size > 0);
    applyItems(itemsRef.current.filter((item) => cartSeatKey(item) !== key));
    setRenewedNotice(false);
    setHoldError(null);
    postRelease(eventSlug, seat)
      .catch(() => {})
      .finally(() => {
        fetchSeatmap();
      });
  }

  function selectSeat(seat: SeatCandidate) {
    const existing = itemsRef.current.find(
      (item) => cartSeatKey(item) === cartSeatKey(seat),
    );
    if (existing) {
      removeItem(existing);
      return;
    }
    ensureHold(seat);
  }

  async function giveUpAll() {
    if (giveUpPending) return;
    setGiveUpPending(true);
    try {
      const current = itemsRef.current;
      for (const item of current) {
        dismissedRef.current.add(cartSeatKey(item));
      }
      pendingKeysRef.current.clear();
      setHoldPending(false);
      setRemainingSeconds(null);
      setRenewedNotice(false);
      setHoldError(null);
      await Promise.all(
        current.map((item) => postRelease(eventSlug, item).catch(() => {})),
      );
      await fetchSeatmap();
      applyItems([]);
    } finally {
      setGiveUpPending(false);
    }
  }

  async function changeType(seat: CartPanelItem, ticketType: TicketType) {
    const key = cartSeatKey(seat);
    const current = itemsRef.current.find((item) => cartSeatKey(item) === key);
    if (!current) return;
    const previous = current.ticketType;
    applyItems(
      itemsRef.current.map((item) =>
        cartSeatKey(item) === key ? { ...item, ticketType } : item,
      ),
    );
    try {
      let response = await putCartItem(eventSlug, current, ticketType);
      if (response.status === 401) {
        await ensureAnonymousSession();
        response = await putCartItem(eventSlug, current, ticketType);
      }
      if (!response.ok) throw new Error('cart_item_failed');
      setHoldError(null);
    } catch {
      applyItems(
        itemsRef.current.map((item) =>
          cartSeatKey(item) === key ? { ...item, ticketType: previous } : item,
        ),
      );
      setHoldError('Não foi possível atualizar o tipo de ingresso.');
    }
  }

  function switchSector(slug: string) {
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
      const candidate: SeatCandidate = {
        sectorSlug: sector.slug,
        sectorName: sector.name,
        rowLabel: payload.seat.rowLabel,
        seatLabel: payload.seat.seatLabel,
        priceFromCents: payload.seat.priceFromCents,
      };
      const inCart = itemsRef.current.some(
        (item) => cartSeatKey(item) === cartSeatKey(candidate),
      );
      if (!inCart) ensureHold(candidate);
    } catch {
      setBestError('Não foi possível escolher o melhor lugar agora.');
    } finally {
      setBestPending(false);
    }
  }

  const renewSeat = useCallback(
    (seat: SelectedSeat) => {
      const key = cartSeatKey(seat);
      renewingRef.current.add(key);
      postHold(eventSlug, seat)
        .then(async (response) => {
          if (!response.ok) return;
          const payload = holdResponseSchema.parse(await response.json());
          applyItems(
            itemsRef.current.map((item) =>
              cartSeatKey(item) === key
                ? { ...item, expiresAt: payload.hold.expiresAt }
                : item,
            ),
          );
          setRenewedNotice(true);
        })
        .catch(() => {})
        .finally(() => {
          renewingRef.current.delete(key);
        });
    },
    [eventSlug, applyItems],
  );

  useEffect(() => {
    if (items.length === 0) {
      setRemainingSeconds(null);
      return;
    }

    const tick = () => {
      const nowMs = Date.now();
      const current = itemsRef.current;
      if (current.length === 0) {
        setRemainingSeconds(null);
        return;
      }
      const live = current.filter((item) => Date.parse(item.expiresAt) > nowMs);
      if (live.length !== current.length) {
        applyItems(live);
        setRenewedNotice(false);
        setHoldError('Sua reserva expirou. Selecione o assento novamente.');
        if (live.length === 0) {
          setRemainingSeconds(null);
          return;
        }
      }
      const secondsLeft = Math.min(
        ...live.map((item) => secondsUntil(item.expiresAt)),
      );
      setRemainingSeconds(secondsLeft);
      if (secondsLeft <= SEAT_HOLD_RENEW_AFTER_SECONDS) {
        for (const item of live) {
          const left = secondsUntil(item.expiresAt);
          if (
            left > 0 &&
            left <= SEAT_HOLD_RENEW_AFTER_SECONDS &&
            !renewingRef.current.has(cartSeatKey(item))
          ) {
            renewSeat(item);
          }
        }
      }
    };

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [items, applyItems, renewSeat]);

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
  const cartItems: CartPanelItem[] = items.map((item) => ({
    sectorSlug: item.sectorSlug,
    sectorName: item.sectorName,
    rowLabel: item.rowLabel,
    seatLabel: item.seatLabel,
    ticketType: item.ticketType,
    priceCents: ticketPriceCents(item.ticketType, item.priceFromCents),
  }));
  const totalCents = cartItems.reduce((sum, item) => sum + item.priceCents, 0);

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
                  const isSelected = items.some(
                    (item) =>
                      item.sectorSlug === sector.slug &&
                      item.rowLabel === row.label &&
                      item.seatLabel === seat.label,
                  );
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      disabled={!isSelected && seat.status !== 'available'}
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
                          !isSelected &&
                          'cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60',
                        seat.status === 'unavailable' &&
                          !isSelected &&
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

        <CartPanel
          items={cartItems}
          totalCents={totalCents}
          remainingSeconds={remainingSeconds}
          renewedNotice={renewedNotice}
          pending={holdPending || giveUpPending}
          error={holdError}
          checkoutHref={`/events/${eventSlug}/checkout`}
          onTypeChange={changeType}
          onRemove={(seat) => {
            const target = itemsRef.current.find(
              (item) => cartSeatKey(item) === cartSeatKey(seat),
            );
            if (target) removeItem(target);
          }}
          onGiveUpAll={() => {
            void giveUpAll();
          }}
        />
      </div>
    </section>
  );
}
