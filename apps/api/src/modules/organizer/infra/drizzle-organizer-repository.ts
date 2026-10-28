import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import {
  categories,
  events,
  orderItems,
  orders,
  priceLots,
  seatRows,
  seats,
  sectors,
  tickets,
  user,
  venues,
} from '../../../db/schema.js';
import type {
  CreateEventResult,
  CreateRowResult,
  CreateSectorInput,
  CreateSectorResult,
  DeleteEventResult,
  DeleteLotResult,
  FindEventForOrganizerResult,
  FindLotForOrganizerResult,
  OrganizerEventRecord,
  OrganizerLotRecord,
  OrganizerRepository,
  OrganizerSectorRecord,
  OrganizerVenueRecord,
  SalesReportForOrganizerResult,
  TicketValidationForOrganizerInput,
  TicketValidationForOrganizerResult,
  UpdateEventResult,
  WriteLotResult,
  WriteSectorResult,
} from '../domain/organizer-repository.js';
import { slugify } from '../domain/slugify.js';

function searchVectorFor(input: {
  title: string;
  description: string;
  venueName: string;
  venueCity: string;
}) {
  return sql`setweight(to_tsvector('portuguese', unaccent(${input.title})), 'A')
    || setweight(to_tsvector('portuguese', unaccent(${input.description})), 'B')
    || setweight(to_tsvector('portuguese', unaccent(${input.venueName} || ' ' || ${input.venueCity})), 'C')`;
}

interface OrganizerEventRow {
  events: {
    id: string;
    slug: string;
    title: string;
    description: string;
    startsAt: Date;
    priceFromCents: number;
    cancellationWindowHours: number;
    refundPercent: number;
    organizerId: string | null;
  };
  categories: {
    id: string;
    slug: string;
    name: string;
  };
  venues: {
    id: string;
    slug: string;
    name: string;
    city: string;
    state: string;
  };
}

const effectiveSectorPriceSql = sql<number>`coalesce((select pl.price_cents from price_lots pl where pl.sector_id = "sectors"."id" and pl.starts_at <= now() and pl.ends_at > now() order by pl.starts_at desc limit 1), "sectors"."price_from_cents")`;

const organizerEventSelect = {
  events: {
    id: events.id,
    slug: events.slug,
    title: events.title,
    description: events.description,
    startsAt: events.startsAt,
    priceFromCents: events.priceFromCents,
    cancellationWindowHours: events.cancellationWindowHours,
    refundPercent: events.refundPercent,
    organizerId: events.organizerId,
  },
  categories: {
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
  },
  venues: {
    id: venues.id,
    slug: venues.slug,
    name: venues.name,
    city: venues.city,
    state: venues.state,
  },
};

function toRecord(row: OrganizerEventRow): OrganizerEventRecord {
  return {
    id: row.events.id,
    slug: row.events.slug,
    title: row.events.title,
    description: row.events.description,
    categoryId: row.categories.id,
    categorySlug: row.categories.slug,
    categoryName: row.categories.name,
    venueId: row.venues.id,
    venueSlug: row.venues.slug,
    venueName: row.venues.name,
    venueCity: row.venues.city,
    venueState: row.venues.state,
    startsAt: row.events.startsAt,
    priceFromCents: row.events.priceFromCents,
    cancellationWindowHours: row.events.cancellationWindowHours,
    refundPercent: row.events.refundPercent,
    organizerId: row.events.organizerId,
  };
}

export class DrizzleOrganizerRepository implements OrganizerRepository {
  constructor(private readonly db: Db) {}

  async listEventsForOrganizer(
    userId: string,
  ): Promise<OrganizerEventRecord[]> {
    const rows: OrganizerEventRow[] = await this.db
      .select(organizerEventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(or(eq(events.organizerId, userId), isNull(events.organizerId)))
      .orderBy(asc(events.startsAt), asc(events.id));

    return rows.map(toRecord);
  }

  async findEventForOrganizer(input: {
    eventId: string;
    userId: string;
  }): Promise<FindEventForOrganizerResult> {
    const row: OrganizerEventRow | undefined = await this.findRow(
      input.eventId,
    );
    if (!row) {
      return { kind: 'not_found' };
    }
    const { organizerId } = row.events;
    if (organizerId !== null && organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    return { kind: 'ok', event: toRecord(row) };
  }

  async createEvent(input: {
    title: string;
    description: string;
    categorySlug: string;
    venueSlug: string;
    startsAt: Date;
    cancellationWindowHours?: number;
    refundPercent?: number;
    organizerId: string;
  }): Promise<CreateEventResult> {
    const [category] = await this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.slug, input.categorySlug))
      .limit(1);
    if (!category) {
      return { kind: 'category_not_found' };
    }

    const [venue] = await this.db
      .select({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      })
      .from(venues)
      .where(eq(venues.slug, input.venueSlug))
      .limit(1);
    if (!venue) {
      return { kind: 'venue_not_found' };
    }

    const slug = await this.uniqueEventSlug(slugify(input.title));

    const [row] = await this.db
      .insert(events)
      .values({
        slug,
        title: input.title,
        description: input.description,
        categoryId: category.id,
        venueId: venue.id,
        organizerId: input.organizerId,
        startsAt: input.startsAt,
        priceFromCents: 0,
        cancellationWindowHours: input.cancellationWindowHours,
        refundPercent: input.refundPercent,
        searchVector: searchVectorFor({
          title: input.title,
          description: input.description,
          venueName: venue.name,
          venueCity: venue.city,
        }),
      })
      .returning({
        id: events.id,
        priceFromCents: events.priceFromCents,
        cancellationWindowHours: events.cancellationWindowHours,
        refundPercent: events.refundPercent,
      });

    return {
      kind: 'ok',
      event: {
        id: row.id,
        slug,
        title: input.title,
        description: input.description,
        categoryId: category.id,
        categorySlug: category.slug,
        categoryName: category.name,
        venueId: venue.id,
        venueSlug: venue.slug,
        venueName: venue.name,
        venueCity: venue.city,
        venueState: venue.state,
        startsAt: input.startsAt,
        priceFromCents: row.priceFromCents,
        cancellationWindowHours: row.cancellationWindowHours,
        refundPercent: row.refundPercent,
        organizerId: input.organizerId,
      },
    };
  }

  async updateEvent(input: {
    eventId: string;
    userId: string;
    title: string;
    description: string;
    categorySlug: string;
    venueSlug: string;
    startsAt: Date;
    cancellationWindowHours?: number;
    refundPercent?: number;
  }): Promise<UpdateEventResult> {
    const existing: OrganizerEventRow | undefined = await this.findRow(
      input.eventId,
    );
    if (!existing) {
      return { kind: 'not_found' };
    }
    const { organizerId } = existing.events;
    if (organizerId === null || organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }

    const [category] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, input.categorySlug))
      .limit(1);
    if (!category) {
      return { kind: 'category_not_found' };
    }

    const [venue] = await this.db
      .select({ id: venues.id, name: venues.name, city: venues.city })
      .from(venues)
      .where(eq(venues.slug, input.venueSlug))
      .limit(1);
    if (!venue) {
      return { kind: 'venue_not_found' };
    }

    await this.db
      .update(events)
      .set({
        title: input.title,
        description: input.description,
        categoryId: category.id,
        venueId: venue.id,
        startsAt: input.startsAt,
        cancellationWindowHours: input.cancellationWindowHours,
        refundPercent: input.refundPercent,
        searchVector: searchVectorFor({
          title: input.title,
          description: input.description,
          venueName: venue.name,
          venueCity: venue.city,
        }),
      })
      .where(eq(events.id, input.eventId));

    const updated = await this.findRow(input.eventId);
    if (!updated) {
      return { kind: 'not_found' };
    }
    return { kind: 'ok', event: toRecord(updated) };
  }

  async deleteEvent(input: {
    eventId: string;
    userId: string;
  }): Promise<DeleteEventResult> {
    const [existing] = await this.db
      .select({ organizerId: events.organizerId })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (!existing) {
      return 'not_found';
    }
    if (
      existing.organizerId === null ||
      existing.organizerId !== input.userId
    ) {
      return 'forbidden';
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.eventId, input.eventId));
    if (count > 0) {
      return 'has_orders';
    }

    const sectorIds = (
      await this.db
        .select({ id: sectors.id })
        .from(sectors)
        .where(eq(sectors.eventId, input.eventId))
    ).map((sector) => sector.id);

    await this.db.transaction(async (tx) => {
      if (sectorIds.length > 0) {
        const rowIds = (
          await tx
            .select({ id: seatRows.id })
            .from(seatRows)
            .where(inArray(seatRows.sectorId, sectorIds))
        ).map((row) => row.id);
        if (rowIds.length > 0) {
          await tx.delete(seats).where(inArray(seats.rowId, rowIds));
        }
        await tx
          .delete(priceLots)
          .where(inArray(priceLots.sectorId, sectorIds));
        await tx.delete(seatRows).where(inArray(seatRows.sectorId, sectorIds));
      }
      await tx.delete(sectors).where(eq(sectors.eventId, input.eventId));
      await tx.delete(events).where(eq(events.id, input.eventId));
    });

    return 'ok';
  }

  async salesReportForOrganizer(input: {
    eventId: string;
    userId: string;
    from: Date | null;
    to: Date | null;
  }): Promise<SalesReportForOrganizerResult> {
    const [event] = await this.db
      .select({ organizerId: events.organizerId })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }

    const window = this.paidOrdersWindow(input);
    const [items] = await this.db
      .select({
        ticketsSold: sql<number>`count("order_items"."id")::int`,
        grossCents: sql<number>`coalesce(sum("order_items"."price_cents"), 0)::int`,
        ordersCount: sql<number>`count(distinct "orders"."id")::int`,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(window);
    const [fees] = await this.db
      .select({
        platformFeeCents: sql<number>`coalesce(sum("orders"."service_fee_cents"), 0)::int`,
      })
      .from(orders)
      .where(window);

    const grossCents = items?.grossCents ?? 0;
    const platformFeeCents = fees?.platformFeeCents ?? 0;
    return {
      kind: 'ok',
      report: {
        eventId: input.eventId,
        ticketsSold: items?.ticketsSold ?? 0,
        ordersCount: items?.ordersCount ?? 0,
        grossCents,
        platformFeeCents,
        netCents: grossCents - platformFeeCents,
      },
    };
  }

  async validateTicketForOrganizer(
    input: TicketValidationForOrganizerInput,
  ): Promise<TicketValidationForOrganizerResult> {
    const [event] = await this.db
      .select({ organizerId: events.organizerId })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }

    const [ticket] = await this.db
      .select({
        orderEventId: orders.eventId,
        sectorName: orderItems.sectorName,
        rowLabel: orderItems.rowLabel,
        seatLabel: orderItems.seatLabel,
      })
      .from(tickets)
      .innerJoin(orders, eq(tickets.orderId, orders.id))
      .innerJoin(orderItems, eq(tickets.orderItemId, orderItems.id))
      .where(eq(tickets.code, input.code))
      .limit(1);
    if (!ticket || ticket.orderEventId !== input.eventId) {
      return { kind: 'invalid' };
    }

    const [marked] = await this.db
      .update(tickets)
      .set({ usedAt: sql`now()`, validatedBy: input.userId })
      .where(and(eq(tickets.code, input.code), isNull(tickets.usedAt)))
      .returning({ id: tickets.id });

    if (marked) {
      return {
        kind: 'ok',
        record: {
          result: 'valid',
          usedAt: null,
          usedBy: null,
          sectorName: ticket.sectorName,
          rowLabel: ticket.rowLabel,
          seatLabel: ticket.seatLabel,
        },
      };
    }

    const [current] = await this.db
      .select({ usedAt: tickets.usedAt, usedByName: user.name })
      .from(tickets)
      .leftJoin(user, eq(tickets.validatedBy, user.id))
      .where(eq(tickets.code, input.code))
      .limit(1);
    if (!current || current.usedAt === null) {
      return { kind: 'invalid' };
    }
    return {
      kind: 'ok',
      record: {
        result: 'already_used',
        usedAt: current.usedAt,
        usedBy: current.usedByName ?? null,
        sectorName: ticket.sectorName,
        rowLabel: ticket.rowLabel,
        seatLabel: ticket.seatLabel,
      },
    };
  }

  private paidOrdersWindow(input: {
    eventId: string;
    from: Date | null;
    to: Date | null;
  }) {
    return and(
      eq(orders.eventId, input.eventId),
      eq(orders.status, 'paid'),
      input.from === null ? undefined : gte(orders.paidAt, input.from),
      input.to === null ? undefined : lt(orders.paidAt, input.to),
    );
  }

  async listVenues(): Promise<OrganizerVenueRecord[]> {
    return this.db
      .select({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      })
      .from(venues)
      .orderBy(asc(venues.name), asc(venues.slug));
  }

  async findVenue(venueId: string): Promise<OrganizerVenueRecord | null> {
    const [venue] = await this.db
      .select({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    return venue ?? null;
  }

  async createVenue(input: {
    name: string;
    city: string;
    state: string;
  }): Promise<OrganizerVenueRecord> {
    const slug = await this.uniqueVenueSlug(slugify(input.name));
    const [venue] = await this.db
      .insert(venues)
      .values({
        slug,
        name: input.name,
        city: input.city,
        state: input.state,
      })
      .returning({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      });
    return venue;
  }

  async updateVenue(input: {
    venueId: string;
    name: string;
    city: string;
    state: string;
  }): Promise<OrganizerVenueRecord | null> {
    const [venue] = await this.db
      .update(venues)
      .set({ name: input.name, city: input.city, state: input.state })
      .where(eq(venues.id, input.venueId))
      .returning({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      });
    return venue ?? null;
  }

  async listSectorsForEvent(eventId: string): Promise<OrganizerSectorRecord[]> {
    const sectorRows = await this.db
      .select({
        id: sectors.id,
        slug: sectors.slug,
        name: sectors.name,
        priceFromCents: sectors.priceFromCents,
      })
      .from(sectors)
      .where(eq(sectors.eventId, eventId))
      .orderBy(asc(sectors.priceFromCents), asc(sectors.slug));
    if (sectorRows.length === 0) {
      return [];
    }

    const rowRows = await this.db
      .select({
        id: seatRows.id,
        sectorId: seatRows.sectorId,
        label: seatRows.label,
        position: seatRows.position,
        seatCount: sql<number>`count(${seats.id})::int`,
      })
      .from(seatRows)
      .leftJoin(seats, eq(seats.rowId, seatRows.id))
      .where(
        inArray(
          seatRows.sectorId,
          sectorRows.map((sector) => sector.id),
        ),
      )
      .groupBy(
        seatRows.id,
        seatRows.sectorId,
        seatRows.label,
        seatRows.position,
      )
      .orderBy(asc(seatRows.position), asc(seatRows.id));

    const lotRows = await this.db
      .select({
        id: priceLots.id,
        sectorId: priceLots.sectorId,
        name: priceLots.name,
        priceCents: priceLots.priceCents,
        startsAt: priceLots.startsAt,
        endsAt: priceLots.endsAt,
      })
      .from(priceLots)
      .where(
        inArray(
          priceLots.sectorId,
          sectorRows.map((s) => s.id),
        ),
      )
      .orderBy(asc(priceLots.startsAt), asc(priceLots.id));

    return sectorRows.map((sector) => {
      const rows = rowRows.filter((row) => row.sectorId === sector.id);
      return {
        id: sector.id,
        slug: sector.slug,
        name: sector.name,
        priceFromCents: sector.priceFromCents,
        seatsTotal: rows.reduce((total, row) => total + row.seatCount, 0),
        rows: rows.map((row) => ({
          id: row.id,
          label: row.label,
          seatCount: row.seatCount,
        })),
        lots: lotRows
          .filter((lot) => lot.sectorId === sector.id)
          .map(
            (lot): OrganizerLotRecord => ({
              id: lot.id,
              name: lot.name,
              priceCents: lot.priceCents,
              startsAt: lot.startsAt,
              endsAt: lot.endsAt,
            }),
          ),
      };
    });
  }

  async createSector(input: CreateSectorInput): Promise<CreateSectorResult> {
    const [event] = await this.db
      .select({ organizerId: events.organizerId })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }

    const slug = await this.uniqueSectorSlug(
      input.eventId,
      slugify(input.name),
    );
    if (!slug) {
      return { kind: 'sector_conflict' };
    }

    const sector = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(sectors)
        .values({
          eventId: input.eventId,
          slug,
          name: input.name,
          priceFromCents: input.priceFromCents,
        })
        .returning({
          id: sectors.id,
          slug: sectors.slug,
          name: sectors.name,
          priceFromCents: sectors.priceFromCents,
        });

      const rows: { id: string; label: string; seatCount: number }[] = [];
      for (const [index, row] of input.rows.entries()) {
        const [insertedRow] = await tx
          .insert(seatRows)
          .values({
            sectorId: inserted.id,
            label: row.label,
            position: index + 1,
          })
          .returning({ id: seatRows.id });
        await tx.insert(seats).values(
          Array.from({ length: row.seatCount }, (_, seatIndex) => ({
            rowId: insertedRow.id,
            label: String(seatIndex + 1),
            position: seatIndex + 1,
          })),
        );
        rows.push({
          id: insertedRow.id,
          label: row.label,
          seatCount: row.seatCount,
        });
      }

      return {
        ...inserted,
        seatsTotal: input.rows.reduce((total, row) => total + row.seatCount, 0),
        rows,
        lots: [] as OrganizerSectorRecord['lots'],
      } satisfies OrganizerSectorRecord;
    });

    await this.recalculateEventPriceFrom(input.eventId);
    return { kind: 'ok', sector };
  }

  async deleteSector(input: {
    sectorId: string;
    userId: string;
  }): Promise<WriteSectorResult> {
    const [existing] = await this.db
      .select({
        eventId: sectors.eventId,
        organizerId: events.organizerId,
      })
      .from(sectors)
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(sectors.id, input.sectorId))
      .limit(1);
    if (!existing) {
      return 'not_found';
    }
    if (
      existing.organizerId === null ||
      existing.organizerId !== input.userId
    ) {
      return 'forbidden';
    }
    if (await this.sectorHasOrders(input.sectorId)) {
      return 'has_orders';
    }

    const rowIds = (
      await this.db
        .select({ id: seatRows.id })
        .from(seatRows)
        .where(eq(seatRows.sectorId, input.sectorId))
    ).map((row) => row.id);

    await this.db.transaction(async (tx) => {
      if (rowIds.length > 0) {
        await tx.delete(seats).where(inArray(seats.rowId, rowIds));
      }
      await tx.delete(priceLots).where(eq(priceLots.sectorId, input.sectorId));
      await tx.delete(seatRows).where(eq(seatRows.sectorId, input.sectorId));
      await tx.delete(sectors).where(eq(sectors.id, input.sectorId));
    });

    await this.recalculateEventPriceFrom(existing.eventId);
    return 'ok';
  }

  async createRow(input: {
    sectorId: string;
    userId: string;
    label: string;
    seatCount: number;
  }): Promise<CreateRowResult> {
    const [sector] = await this.db
      .select({
        id: sectors.id,
        eventId: sectors.eventId,
        slug: sectors.slug,
        name: sectors.name,
        priceFromCents: sectors.priceFromCents,
        organizerId: events.organizerId,
      })
      .from(sectors)
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(sectors.id, input.sectorId))
      .limit(1);
    if (!sector) {
      return { kind: 'not_found' };
    }
    if (sector.organizerId === null || sector.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }

    const [duplicate] = await this.db
      .select({ id: seatRows.id })
      .from(seatRows)
      .where(
        and(
          eq(seatRows.sectorId, input.sectorId),
          eq(seatRows.label, input.label),
        ),
      )
      .limit(1);
    if (duplicate) {
      return { kind: 'label_conflict' };
    }

    const [{ max }] = await this.db
      .select({ max: sql<number | null>`max(${seatRows.position})` })
      .from(seatRows)
      .where(eq(seatRows.sectorId, input.sectorId));

    await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(seatRows)
        .values({
          sectorId: input.sectorId,
          label: input.label,
          position: (max ?? 0) + 1,
        })
        .returning({ id: seatRows.id });
      await tx.insert(seats).values(
        Array.from({ length: input.seatCount }, (_, seatIndex) => ({
          rowId: inserted.id,
          label: String(seatIndex + 1),
          position: seatIndex + 1,
        })),
      );
    });

    const rows = await this.seatCountBySector(input.sectorId);
    const lots = await this.db
      .select({
        id: priceLots.id,
        name: priceLots.name,
        priceCents: priceLots.priceCents,
        startsAt: priceLots.startsAt,
        endsAt: priceLots.endsAt,
      })
      .from(priceLots)
      .where(eq(priceLots.sectorId, input.sectorId))
      .orderBy(asc(priceLots.startsAt), asc(priceLots.id));
    return {
      kind: 'ok',
      sector: {
        id: sector.id,
        slug: sector.slug,
        name: sector.name,
        priceFromCents: sector.priceFromCents,
        seatsTotal: rows.reduce((total, row) => total + row.seatCount, 0),
        rows,
        lots: lots,
      },
    };
  }

  async deleteRow(input: {
    rowId: string;
    userId: string;
  }): Promise<WriteSectorResult> {
    const [row] = await this.db
      .select({
        rowId: seatRows.id,
        eventId: sectors.eventId,
        organizerId: events.organizerId,
      })
      .from(seatRows)
      .innerJoin(sectors, eq(seatRows.sectorId, sectors.id))
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(seatRows.id, input.rowId))
      .limit(1);
    if (!row) {
      return 'not_found';
    }
    if (row.organizerId === null || row.organizerId !== input.userId) {
      return 'forbidden';
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(eq(orderItems.rowId, input.rowId));
    if (count > 0) {
      return 'has_orders';
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(seats).where(eq(seats.rowId, input.rowId));
      await tx.delete(seatRows).where(eq(seatRows.id, input.rowId));
    });
    return 'ok';
  }

  async recalculateEventPriceFrom(eventId: string): Promise<void> {
    const [row] = await this.db
      .select({
        min: sql<number | null>`min(${effectiveSectorPriceSql})`,
      })
      .from(sectors)
      .where(eq(sectors.eventId, eventId));
    if (row?.min === null || row?.min === undefined) {
      return;
    }
    await this.db
      .update(events)
      .set({ priceFromCents: row.min })
      .where(eq(events.id, eventId));
  }

  async listLotsBySector(sectorId: string): Promise<OrganizerLotRecord[]> {
    return this.db
      .select({
        id: priceLots.id,
        name: priceLots.name,
        priceCents: priceLots.priceCents,
        startsAt: priceLots.startsAt,
        endsAt: priceLots.endsAt,
      })
      .from(priceLots)
      .where(eq(priceLots.sectorId, sectorId))
      .orderBy(asc(priceLots.startsAt), asc(priceLots.id));
  }

  async findLotForOrganizer(input: {
    lotId: string;
    userId: string;
  }): Promise<FindLotForOrganizerResult> {
    const [lot] = await this.db
      .select({
        id: priceLots.id,
        sectorId: priceLots.sectorId,
        name: priceLots.name,
        priceCents: priceLots.priceCents,
        startsAt: priceLots.startsAt,
        endsAt: priceLots.endsAt,
        organizerId: events.organizerId,
      })
      .from(priceLots)
      .innerJoin(sectors, eq(priceLots.sectorId, sectors.id))
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(priceLots.id, input.lotId))
      .limit(1);
    if (!lot) {
      return { kind: 'not_found' };
    }
    if (lot.organizerId === null || lot.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    return {
      kind: 'ok',
      lot: {
        id: lot.id,
        sectorId: lot.sectorId,
        name: lot.name,
        priceCents: lot.priceCents,
        startsAt: lot.startsAt,
        endsAt: lot.endsAt,
      },
    };
  }

  async createLot(input: {
    sectorId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult> {
    const [sector] = await this.db
      .select({
        eventId: sectors.eventId,
        organizerId: events.organizerId,
      })
      .from(sectors)
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(sectors.id, input.sectorId))
      .limit(1);
    if (!sector) {
      return { kind: 'not_found' };
    }
    if (sector.organizerId === null || sector.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      return { kind: 'invalid_period' };
    }

    const inserted = await this.db.transaction(async (tx) => {
      const [overlap] = await tx
        .select({ id: priceLots.id })
        .from(priceLots)
        .where(
          and(
            eq(priceLots.sectorId, input.sectorId),
            sql`(${priceLots.startsAt}, ${priceLots.endsAt}) overlaps (${input.startsAt}, ${input.endsAt})`,
          ),
        )
        .limit(1);
      if (overlap) {
        return null;
      }
      const [lot] = await tx
        .insert(priceLots)
        .values({
          sectorId: input.sectorId,
          name: input.name,
          priceCents: input.priceCents,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .returning({
          id: priceLots.id,
          name: priceLots.name,
          priceCents: priceLots.priceCents,
          startsAt: priceLots.startsAt,
          endsAt: priceLots.endsAt,
        });
      return lot;
    });
    if (!inserted) {
      return { kind: 'overlapping' };
    }
    await this.recalculateEventPriceFrom(sector.eventId);
    return { kind: 'ok', lot: inserted };
  }

  async updateLot(input: {
    lotId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult> {
    const [lot] = await this.db
      .select({
        id: priceLots.id,
        sectorId: priceLots.sectorId,
        eventId: sectors.eventId,
        organizerId: events.organizerId,
      })
      .from(priceLots)
      .innerJoin(sectors, eq(priceLots.sectorId, sectors.id))
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(priceLots.id, input.lotId))
      .limit(1);
    if (!lot) {
      return { kind: 'not_found' };
    }
    if (lot.organizerId === null || lot.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      return { kind: 'invalid_period' };
    }

    const updated = await this.db.transaction(async (tx) => {
      const [overlap] = await tx
        .select({ id: priceLots.id })
        .from(priceLots)
        .where(
          and(
            eq(priceLots.sectorId, lot.sectorId),
            ne(priceLots.id, input.lotId),
            sql`(${priceLots.startsAt}, ${priceLots.endsAt}) overlaps (${input.startsAt}, ${input.endsAt})`,
          ),
        )
        .limit(1);
      if (overlap) {
        return null;
      }
      const [row] = await tx
        .update(priceLots)
        .set({
          name: input.name,
          priceCents: input.priceCents,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .where(eq(priceLots.id, input.lotId))
        .returning({
          id: priceLots.id,
          name: priceLots.name,
          priceCents: priceLots.priceCents,
          startsAt: priceLots.startsAt,
          endsAt: priceLots.endsAt,
        });
      return row;
    });
    if (!updated) {
      return { kind: 'overlapping' };
    }
    await this.recalculateEventPriceFrom(lot.eventId);
    return { kind: 'ok', lot: updated };
  }

  async deleteLot(input: {
    lotId: string;
    userId: string;
  }): Promise<DeleteLotResult> {
    const [lot] = await this.db
      .select({
        id: priceLots.id,
        eventId: sectors.eventId,
        organizerId: events.organizerId,
      })
      .from(priceLots)
      .innerJoin(sectors, eq(priceLots.sectorId, sectors.id))
      .innerJoin(events, eq(sectors.eventId, events.id))
      .where(eq(priceLots.id, input.lotId))
      .limit(1);
    if (!lot) {
      return 'not_found';
    }
    if (lot.organizerId === null || lot.organizerId !== input.userId) {
      return 'forbidden';
    }
    await this.db.delete(priceLots).where(eq(priceLots.id, input.lotId));
    await this.recalculateEventPriceFrom(lot.eventId);
    return 'ok';
  }

  private async seatCountBySector(
    sectorId: string,
  ): Promise<{ id: string; label: string; seatCount: number }[]> {
    const rowRows = await this.db
      .select({
        id: seatRows.id,
        label: seatRows.label,
        position: seatRows.position,
        seatCount: sql<number>`count(${seats.id})::int`,
      })
      .from(seatRows)
      .leftJoin(seats, eq(seats.rowId, seatRows.id))
      .where(eq(seatRows.sectorId, sectorId))
      .groupBy(seatRows.id, seatRows.label, seatRows.position)
      .orderBy(asc(seatRows.position), asc(seatRows.id));
    return rowRows.map((row) => ({
      id: row.id,
      label: row.label,
      seatCount: row.seatCount,
    }));
  }

  private async sectorHasOrders(sectorId: string): Promise<boolean> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderItems)
      .innerJoin(seatRows, eq(orderItems.rowId, seatRows.id))
      .where(eq(seatRows.sectorId, sectorId));
    return count > 0;
  }

  private async findRow(
    eventId: string,
  ): Promise<OrganizerEventRow | undefined> {
    const [row] = await this.db
      .select(organizerEventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.id, eventId))
      .limit(1);
    return row;
  }

  private async uniqueSectorSlug(
    eventId: string,
    base: string,
  ): Promise<string | null> {
    const stem = base === '' ? 'setor' : base;
    const [existing] = await this.db
      .select({ id: sectors.id })
      .from(sectors)
      .where(and(eq(sectors.eventId, eventId), eq(sectors.slug, stem)))
      .limit(1);
    return existing ? null : stem;
  }

  private async uniqueVenueSlug(base: string): Promise<string> {
    const stem = base === '' ? 'local' : base;
    let candidate = stem;
    let suffix = 2;
    for (;;) {
      const [existing] = await this.db
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.slug, candidate))
        .limit(1);
      if (!existing) {
        return candidate;
      }
      candidate = `${stem}-${suffix}`;
      suffix += 1;
    }
  }

  private async uniqueEventSlug(title: string): Promise<string> {
    const stem = title === '' ? 'evento' : title;
    let candidate = stem;
    let suffix = 2;
    for (;;) {
      const [existing] = await this.db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.slug, candidate))
        .limit(1);
      if (!existing) {
        return candidate;
      }
      candidate = `${stem}-${suffix}`;
      suffix += 1;
    }
  }
}
