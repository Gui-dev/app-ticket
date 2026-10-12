import type { SearchFilters } from '@ticketvibe/shared';
import { and, asc, desc, eq, gte, lte, or, type SQL, sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories, events, sectors, venues } from '../../../db/schema.js';
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
  SuggestResult,
} from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';

interface EventRow {
  events: {
    id: string;
    slug: string;
    title: string;
    description: string;
    startsAt: Date;
    priceFromCents: number;
    imageUrl: string | null;
    badgeLabel: string | null;
    featured: boolean;
    isHot: boolean;
  };
  categories: {
    slug: string;
    name: string;
  };
  venues: {
    name: string;
    city: string;
    state: string;
  };
}

const eventSelect = {
  events: {
    id: events.id,
    slug: events.slug,
    title: events.title,
    description: events.description,
    startsAt: events.startsAt,
    priceFromCents: events.priceFromCents,
    imageUrl: events.imageUrl,
    badgeLabel: events.badgeLabel,
    featured: events.featured,
    isHot: events.isHot,
  },
  categories: {
    slug: categories.slug,
    name: categories.name,
  },
  venues: {
    name: venues.name,
    city: venues.city,
    state: venues.state,
  },
};

function buildConditions(
  view: EventView,
  filters: SearchFilters,
): SQL | undefined {
  const conditions: SQL[] = [];

  if (view === 'featured') conditions.push(eq(events.featured, true));
  if (view === 'hot') conditions.push(eq(events.isHot, true));
  if (filters.category) {
    conditions.push(eq(categories.slug, filters.category));
  }
  if (filters.state) conditions.push(eq(venues.state, filters.state));
  if (filters.q) {
    conditions.push(
      sql`${events.searchVector} @@ websearch_to_tsquery('portuguese', unaccent(${filters.q}))`,
    );
  }
  if (filters.from) {
    conditions.push(
      gte(events.startsAt, new Date(`${filters.from}T00:00:00.000Z`)),
    );
  }
  if (filters.to) {
    conditions.push(
      lte(events.startsAt, new Date(`${filters.to}T23:59:59.999Z`)),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function toEventEntity(row: EventRow): EventEntity {
  return {
    id: row.events.id,
    slug: row.events.slug,
    title: row.events.title,
    description: row.events.description,
    categorySlug: row.categories.slug,
    categoryName: row.categories.name,
    venueName: row.venues.name,
    venueCity: row.venues.city,
    venueState: row.venues.state,
    startsAt: row.events.startsAt,
    priceFromCents: row.events.priceFromCents,
    imageUrl: row.events.imageUrl,
    badgeLabel: row.events.badgeLabel,
    featured: row.events.featured,
    isHot: row.events.isHot,
  };
}

export class DrizzleEventsRepository implements EventsRepository {
  constructor(private readonly db: Db) {}

  async findAll(
    view: EventView,
    filters: SearchFilters = {},
  ): Promise<EventEntity[]> {
    const rows = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(buildConditions(view, filters))
      .orderBy(asc(events.startsAt), asc(events.id));

    return rows.map(toEventEntity);
  }

  async findBySlug(slug: string): Promise<EventDetailEntity | null> {
    const [row] = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.slug, slug))
      .limit(1);

    if (!row) return null;

    const sectorRows = await this.db
      .select({
        slug: sectors.slug,
        name: sectors.name,
        priceFromCents: sectors.priceFromCents,
      })
      .from(sectors)
      .where(eq(sectors.eventId, row.events.id))
      .orderBy(asc(sectors.priceFromCents), asc(sectors.slug));

    return {
      ...toEventEntity(row),
      sectors: sectorRows.map((sector) => ({
        slug: sector.slug,
        name: sector.name,
        priceFromCents: sector.priceFromCents,
      })),
    };
  }

  async suggest(q: string): Promise<SuggestResult> {
    const tsQuery = sql`websearch_to_tsquery('portuguese', unaccent(${q}))`;

    const [eventRows, locationRows] = await Promise.all([
      this.db
        .select(eventSelect)
        .from(events)
        .innerJoin(categories, eq(events.categoryId, categories.id))
        .innerJoin(venues, eq(events.venueId, venues.id))
        .where(buildConditions('all', { q }))
        .orderBy(
          desc(sql`ts_rank(${events.searchVector}, ${tsQuery})`),
          asc(events.startsAt),
          asc(events.id),
        )
        .limit(5),
      this.db
        .selectDistinct({ city: venues.city, state: venues.state })
        .from(venues)
        .innerJoin(events, eq(events.venueId, venues.id))
        .where(
          or(
            sql`unaccent(${venues.city}) ilike unaccent(${`%${q}%`})`,
            sql`unaccent(${venues.state}) ilike unaccent(${`%${q}%`})`,
          ),
        )
        .orderBy(asc(venues.city), asc(venues.state))
        .limit(5),
    ]);

    return {
      events: eventRows.map(toEventEntity),
      locations: locationRows.map((row) => ({
        city: row.city,
        state: row.state,
      })),
    };
  }
}
