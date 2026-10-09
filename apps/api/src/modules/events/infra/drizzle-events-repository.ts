import { asc, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories, events, venues } from '../../../db/schema.js';
import type { EventEntity, EventView } from '../domain/event-entity.js';
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

function buildViewCondition(view: EventView) {
  if (view === 'featured') return eq(events.featured, true);
  if (view === 'hot') return eq(events.isHot, true);
  return undefined;
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

  async findAll(view: EventView): Promise<EventEntity[]> {
    const condition = buildViewCondition(view);
    const rows = await this.db
      .select({
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
      })
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(condition)
      .orderBy(asc(events.startsAt));

    return rows.map(toEventEntity);
  }
}
