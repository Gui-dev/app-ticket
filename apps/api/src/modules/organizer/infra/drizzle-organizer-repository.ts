import { asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import {
  categories,
  events,
  orders,
  priceLots,
  seatRows,
  seats,
  sectors,
  venues,
} from '../../../db/schema.js';
import type {
  CreateEventResult,
  DeleteEventResult,
  FindEventForOrganizerResult,
  OrganizerEventRecord,
  OrganizerRepository,
  UpdateEventResult,
} from '../domain/organizer-repository.js';
import { slugify } from '../domain/slugify.js';

interface OrganizerEventRow {
  events: {
    id: string;
    slug: string;
    title: string;
    description: string;
    startsAt: Date;
    priceFromCents: number;
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

const organizerEventSelect = {
  events: {
    id: events.id,
    slug: events.slug,
    title: events.title,
    description: events.description,
    startsAt: events.startsAt,
    priceFromCents: events.priceFromCents,
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
      })
      .returning({
        id: events.id,
        priceFromCents: events.priceFromCents,
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
      .select({ id: venues.id })
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
