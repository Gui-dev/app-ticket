import { asc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { events, seatRows, seats, sectors } from '../../../db/schema.js';
import type {
  SeatmapEntity,
  SeatmapRow,
  SeatmapSeat,
} from '../domain/seatmap-entity.js';
import type { SeatmapRepository } from '../domain/seatmap-repository.js';

export class DrizzleSeatmapRepository implements SeatmapRepository {
  constructor(private readonly db: Db) {}

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
}
