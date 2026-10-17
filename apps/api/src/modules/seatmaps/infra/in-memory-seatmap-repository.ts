import type { SeatmapEntity, SeatmapSeat } from '../domain/seatmap-entity.js';
import type {
  SeatCoordsLookup,
  SeatHoldRecord,
  SeatmapRepository,
} from '../domain/seatmap-repository.js';

interface SeededUserHold extends SeatHoldRecord {
  eventSlug: string;
  userId: string;
}

export class InMemorySeatmapRepository implements SeatmapRepository {
  private readonly seatmaps = new Map<string, SeatmapEntity>();
  private readonly seatHolds = new Map<
    string,
    { userId: string; expiresAt: Date }
  >();
  private userHolds: SeededUserHold[];

  constructor(
    seed: SeatmapEntity[] = [],
    holds: SeededUserHold[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const seatmap of seed) {
      this.seatmaps.set(seatmap.eventSlug, structuredClone(seatmap));
    }
    this.userHolds = holds;
  }

  async findSeatmap(eventSlug: string): Promise<SeatmapEntity | null> {
    return this.seatmaps.get(eventSlug) ?? null;
  }

  async findSeatByCoords(input: {
    eventSlug: string;
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  }): Promise<SeatCoordsLookup> {
    const seatmap = this.seatmaps.get(input.eventSlug);
    if (!seatmap) return { found: false, scope: 'event' };
    const sector = seatmap.sectors.find(
      (item) => item.slug === input.sectorSlug,
    );
    if (!sector) return { found: false, scope: 'sector' };
    const row = sector.rows.find((item) => item.label === input.rowLabel);
    const seat = row?.seats.find((item) => item.label === input.seatLabel);
    if (!row || !seat) return { found: false, scope: 'seat' };
    return {
      found: true,
      seat: {
        seatId: `${input.eventSlug}:${input.sectorSlug}:${input.rowLabel}:${input.seatLabel}`,
        rowId: `${input.eventSlug}:${input.sectorSlug}:${input.rowLabel}`,
        eventId: input.eventSlug,
        status: seat.status,
        sectorSlug: sector.slug,
        sectorName: sector.name,
        priceFromCents: sector.priceFromCents,
        rowLabel: row.label,
        seatLabel: seat.label,
      },
    };
  }

  async findHoldsByUser(input: {
    eventSlug: string;
    userId: string;
  }): Promise<SeatHoldRecord[]> {
    return this.userHolds
      .filter(
        (hold) =>
          hold.eventSlug === input.eventSlug &&
          hold.userId === input.userId &&
          hold.expiresAt.getTime() > this.now().getTime(),
      )
      .map(
        ({ sectorSlug, rowLabel, seatLabel, priceFromCents, expiresAt }) => ({
          sectorSlug,
          rowLabel,
          seatLabel,
          priceFromCents,
          expiresAt,
        }),
      );
  }

  async expireHolds(): Promise<void> {
    const nowMs = this.now().getTime();
    this.userHolds = this.userHolds.filter(
      (hold) => hold.expiresAt.getTime() > nowMs,
    );
  }

  private *seats(): Generator<{ id: string; seat: SeatmapSeat }> {
    for (const seatmap of this.seatmaps.values()) {
      for (const sector of seatmap.sectors) {
        for (const row of sector.rows) {
          for (const seat of row.seats) {
            yield {
              id: `${seatmap.eventSlug}:${sector.slug}:${row.label}:${seat.label}`,
              seat,
            };
          }
        }
      }
    }
  }

  async reserveSeat(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    for (const { id, seat } of this.seats()) {
      if (id === input.seatId && seat.status === 'available') {
        seat.status = 'reserved';
        this.seatHolds.set(input.seatId, {
          userId: input.userId,
          expiresAt: input.expiresAt,
        });
        return true;
      }
    }
    return false;
  }

  async renewSeatHold(input: {
    seatId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const hold = this.seatHolds.get(input.seatId);
    if (!hold || hold.userId !== input.userId) return false;
    hold.expiresAt = input.expiresAt;
    return true;
  }

  async releaseSeat(input: { seatId: string; userId: string }): Promise<void> {
    const hold = this.seatHolds.get(input.seatId);
    if (!hold || hold.userId !== input.userId) return;
    for (const { id, seat } of this.seats()) {
      if (id === input.seatId) {
        seat.status = 'available';
        this.seatHolds.delete(input.seatId);
        return;
      }
    }
  }
}
