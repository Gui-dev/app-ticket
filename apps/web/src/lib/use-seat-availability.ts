'use client';

import {
  type SeatAvailabilityMessage,
  type SeatmapDto,
  type SeatStatusChange,
  seatAvailabilityMessageSchema,
} from '@ticketvibe/shared';
import { useEffect, useRef, useState } from 'react';

export function applySeatStatuses(
  seatmap: SeatmapDto,
  changes: SeatStatusChange[],
): SeatmapDto {
  const changesBySector = new Map<
    string,
    Map<string, Map<string, SeatStatusChange['status']>>
  >();
  for (const change of changes) {
    let byRow = changesBySector.get(change.sectorSlug);
    if (!byRow) {
      byRow = new Map();
      changesBySector.set(change.sectorSlug, byRow);
    }
    let bySeat = byRow.get(change.rowLabel);
    if (!bySeat) {
      bySeat = new Map();
      byRow.set(change.rowLabel, bySeat);
    }
    bySeat.set(change.seatLabel, change.status);
  }

  let touched = false;

  const sectors = seatmap.sectors.map((sector) => {
    const byRow = changesBySector.get(sector.slug);
    if (!byRow) return sector;

    let sectorTouched = false;
    const rows = sector.rows.map((row) => {
      const bySeat = byRow.get(row.label);
      if (!bySeat) return row;

      let rowTouched = false;
      const seats = row.seats.map((seat) => {
        const status = bySeat.get(seat.label);
        if (status === undefined || status === seat.status) return seat;
        rowTouched = true;
        return { ...seat, status };
      });
      if (!rowTouched) return row;

      sectorTouched = true;
      return { ...row, seats };
    });
    if (!sectorTouched) return sector;

    touched = true;
    return { ...sector, rows };
  });

  if (!touched) return seatmap;
  return { ...seatmap, sectors };
}

export function seatAvailabilityWsUrl(eventSlug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const wsBaseUrl = baseUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  return `${wsBaseUrl}/events/${encodeURIComponent(eventSlug)}/seat-availability`;
}

const UNKNOWN_EVENT_CLOSE_CODE = 4004;

export function useSeatAvailability(input: {
  eventSlug: string;
  onMessage: (message: SeatAvailabilityMessage) => void;
}): boolean {
  const { eventSlug, onMessage } = input;
  const [open, setOpen] = useState(false);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (typeof WebSocket === 'undefined') {
      setOpen(false);
      return;
    }

    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;

    function connect() {
      socket = new WebSocket(seatAvailabilityWsUrl(eventSlug));
      socket.onopen = () => {
        attempt = 0;
        setOpen(true);
      };
      socket.onmessage = (event) => {
        const raw = event.data;
        if (typeof raw !== 'string') return;
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }
        const parsed = seatAvailabilityMessageSchema.safeParse(payload);
        if (parsed.success) onMessageRef.current(parsed.data);
      };
      socket.onclose = (event) => {
        setOpen(false);
        if (disposed) return;
        if (event.code === UNKNOWN_EVENT_CLOSE_CODE) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        reconnectTimer = setTimeout(() => {
          if (!disposed) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const closing = socket;
      socket = null;
      if (closing) {
        closing.onopen = null;
        closing.onmessage = null;
        closing.onclose = null;
        closing.onerror = null;
        closing.close();
      }
    };
  }, [eventSlug]);

  return open;
}
