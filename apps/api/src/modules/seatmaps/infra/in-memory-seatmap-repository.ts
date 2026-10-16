import type { SeatmapEntity } from '../domain/seatmap-entity.js';
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
  private userHolds: SeededUserHold[];

  constructor(
    seed: SeatmapEntity[] = [],
    holds: SeededUserHold[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const seatmap of seed) {
      this.seatmaps.set(seatmap.eventSlug, seatmap);
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
      .map(({ sectorSlug, rowLabel, seatLabel, expiresAt }) => ({
        sectorSlug,
        rowLabel,
        seatLabel,
        expiresAt,
      }));
  }

  async expireHolds(): Promise<void> {
    const nowMs = this.now().getTime();
    this.userHolds = this.userHolds.filter(
      (hold) => hold.expiresAt.getTime() > nowMs,
    );
  }
}
