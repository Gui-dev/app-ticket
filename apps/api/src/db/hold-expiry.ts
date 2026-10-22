import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from './client.js';
import { events, seatRows, seats, sectors } from './schema.js';

export interface ExpiredHoldSeat {
  seatId: string;
  eventSlug: string;
  sectorSlug: string;
  rowLabel: string;
  seatLabel: string;
}

export async function expireExpiredHolds(db: Db): Promise<ExpiredHoldSeat[]> {
  return db.transaction(async (tx) => {
    const eligible = await tx
      .select({
        seatId: seats.id,
        eventSlug: events.slug,
        sectorSlug: sectors.slug,
        rowLabel: seatRows.label,
        seatLabel: seats.label,
      })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .innerJoin(events, eq(events.id, sectors.eventId))
      .where(and(eq(seats.status, 'reserved'), sql`hold_expires_at <= now()`))
      .for('update', { skipLocked: true });

    const eligibleIds = eligible.map((row) => row.seatId);
    if (eligibleIds.length === 0) return [];

    const updated = await tx
      .update(seats)
      .set({ status: 'available', holdUserId: null, holdExpiresAt: null })
      .where(
        and(
          inArray(seats.id, eligibleIds),
          eq(seats.status, 'reserved'),
          sql`hold_expires_at <= now()`,
        ),
      )
      .returning({ id: seats.id });

    const updatedIds = new Set(updated.map((row) => row.id));
    return eligible.filter((row) => updatedIds.has(row.seatId));
  });
}
