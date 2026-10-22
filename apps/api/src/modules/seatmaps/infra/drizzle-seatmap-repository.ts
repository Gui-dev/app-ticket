import { and, asc, eq, gt, inArray } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import {
  type ExpiredHoldSeat,
  expireExpiredHolds,
} from '../../../db/hold-expiry.js';
import { events, seatRows, seats, sectors } from '../../../db/schema.js';
import type {
  SeatAvailabilityBroker,
  SeatStatusDelta,
} from '../domain/seat-availability-broker.js';
import type {
  SeatmapEntity,
  SeatmapRow,
  SeatmapSeat,
} from '../domain/seatmap-entity.js';
import type {
  SeatCoordsLookup,
  SeatHoldRecord,
  SeatmapRepository,
} from '../domain/seatmap-repository.js';

const expiredHoldSeatToAvailableDelta = (
  seat: ExpiredHoldSeat,
): SeatStatusDelta => ({
  eventSlug: seat.eventSlug,
  sectorSlug: seat.sectorSlug,
  rowLabel: seat.rowLabel,
  seatLabel: seat.seatLabel,
  status: 'available',
});

export class DrizzleSeatmapRepository implements SeatmapRepository {
  constructor(
    private readonly db: Db,
    private readonly broker: SeatAvailabilityBroker,
  ) {}

  async findSeatmap(eventSlug: string): Promise<SeatmapEntity | null> {
    const [event] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, eventSlug))
      .limit(1);
    if (!event) return null;

    const sectorRows = await this.db
      .select({
        id: sectors.id,
        slug: sectors.slug,
        name: sectors.name,
        priceFromCents: sectors.priceFromCents,
      })
      .from(sectors)
      .where(eq(sectors.eventId, event.id))
      .orderBy(asc(sectors.priceFromCents), asc(sectors.slug));

    const sectorIds = sectorRows.map((sector) => sector.id);
    const rowRecords = sectorIds.length
      ? await this.db
          .select()
          .from(seatRows)
          .where(inArray(seatRows.sectorId, sectorIds))
          .orderBy(asc(seatRows.sectorId), asc(seatRows.position))
      : [];

    const rowIds = rowRecords.map((row) => row.id);
    const seatRecords = rowIds.length
      ? await this.db
          .select()
          .from(seats)
          .where(inArray(seats.rowId, rowIds))
          .orderBy(asc(seats.rowId), asc(seats.position))
      : [];

    const seatsByRow = new Map<string, SeatmapSeat[]>();
    for (const seat of seatRecords) {
      const list = seatsByRow.get(seat.rowId) ?? [];
      list.push({ label: seat.label, status: seat.status });
      seatsByRow.set(seat.rowId, list);
    }

    const rowsBySector = new Map<string, SeatmapRow[]>();
    for (const row of rowRecords) {
      const rows = rowsBySector.get(row.sectorId) ?? [];
      rows.push({ label: row.label, seats: seatsByRow.get(row.id) ?? [] });
      rowsBySector.set(row.sectorId, rows);
    }

    return {
      eventSlug,
      sectors: sectorRows.map((sector) => ({
        slug: sector.slug,
        name: sector.name,
        priceFromCents: sector.priceFromCents,
        rows: rowsBySector.get(sector.id) ?? [],
      })),
    };
  }

  async findSeatByCoords(input: {
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<SeatCoordsLookup> {
    const rows = await this.db
      .select({
        eventId: events.id,
        sectorId: sectors.id,
        rowId: seatRows.id,
        seatId: seats.id,
        seatStatus: seats.status,
        sectorName: sectors.name,
        sectorSlug: sectors.slug,
        priceFromCents: sectors.priceFromCents,
        rowLabel: seatRows.label,
        seatLabel: seats.label,
      })
      .from(events)
      .leftJoin(
        sectors,
        and(eq(sectors.eventId, events.id), eq(sectors.slug, input.sectorSlug)),
      )
      .leftJoin(
        seatRows,
        and(
          eq(seatRows.sectorId, sectors.id),
          eq(seatRows.label, input.rowLabel),
        ),
      )
      .leftJoin(
        seats,
        and(eq(seats.rowId, seatRows.id), eq(seats.label, input.seatLabel)),
      )
      .where(eq(events.slug, input.eventSlug))
      .limit(1);

    const row = rows[0];
    if (!row) return { found: false, scope: 'event' };
    if (!row.sectorId) return { found: false, scope: 'sector' };
    if (!row.rowId || !row.seatId || !row.seatStatus) {
      return { found: false, scope: 'seat' };
    }
    return {
      found: true,
      seat: {
        seatId: row.seatId,
        rowId: row.rowId,
        eventId: row.eventId,
        status: row.seatStatus,
        sectorSlug: row.sectorSlug ?? input.sectorSlug,
        sectorName: row.sectorName ?? '',
        priceFromCents: row.priceFromCents ?? 0,
        rowLabel: row.rowLabel ?? input.rowLabel,
        seatLabel: row.seatLabel ?? input.seatLabel,
      },
    };
  }

  async findHoldsByUser(input: {
    eventSlug: string;
    userId: string;
  }): Promise<SeatHoldRecord[]> {
    const rows = await this.db
      .select({
        sectorSlug: sectors.slug,
        rowLabel: seatRows.label,
        seatLabel: seats.label,
        priceFromCents: sectors.priceFromCents,
        expiresAt: seats.holdExpiresAt,
      })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .innerJoin(events, eq(events.id, sectors.eventId))
      .where(
        and(
          eq(seats.holdUserId, input.userId),
          gt(seats.holdExpiresAt, new Date()),
          eq(events.slug, input.eventSlug),
        ),
      );

    return rows
      .filter((row) => row.expiresAt !== null)
      .map((row) => ({
        sectorSlug: row.sectorSlug,
        rowLabel: row.rowLabel,
        seatLabel: row.seatLabel,
        priceFromCents: row.priceFromCents,
        expiresAt: row.expiresAt as Date,
      }));
  }

  private async findSeatIdentity(
    seatId: string,
  ): Promise<Pick<
    SeatStatusDelta,
    'eventSlug' | 'sectorSlug' | 'rowLabel' | 'seatLabel'
  > | null> {
    const [identity] = await this.db
      .select({
        eventSlug: events.slug,
        sectorSlug: sectors.slug,
        rowLabel: seatRows.label,
        seatLabel: seats.label,
      })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .innerJoin(events, eq(events.id, sectors.eventId))
      .where(eq(seats.id, seatId))
      .limit(1);
    return identity ?? null;
  }

  async expireHolds(): Promise<void> {
    const expired = await expireExpiredHolds(this.db);
    if (expired.length > 0) {
      this.broker.publish(expired.map(expiredHoldSeatToAvailableDelta));
    }
  }

  async reserveSeat(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.db
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: input.userId,
        holdExpiresAt: input.expiresAt,
      })
      .where(and(eq(seats.id, input.seatId), eq(seats.status, 'available')));
    const reserved = (result.rowCount ?? 0) > 0;
    if (reserved) {
      const identity = await this.findSeatIdentity(input.seatId);
      if (identity) {
        this.broker.publish([{ ...identity, status: 'occupied' }]);
      }
    }
    return reserved;
  }

  async renewSeatHold(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.db
      .update(seats)
      .set({ holdExpiresAt: input.expiresAt })
      .where(
        and(eq(seats.id, input.seatId), eq(seats.holdUserId, input.userId)),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async releaseSeat(input: { seatId: string; userId: string }): Promise<void> {
    const result = await this.db
      .update(seats)
      .set({ status: 'available', holdUserId: null, holdExpiresAt: null })
      .where(
        and(eq(seats.id, input.seatId), eq(seats.holdUserId, input.userId)),
      );
    const released = (result.rowCount ?? 0) > 0;
    if (released) {
      const identity = await this.findSeatIdentity(input.seatId);
      if (identity) {
        this.broker.publish([{ ...identity, status: 'available' }]);
      }
    }
  }
}
