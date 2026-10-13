import { asc, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories, events, venues } from '../../../db/schema.js';
import {
  eventSelect,
  toEventEntity,
} from '../../events/infra/drizzle-events-repository.js';
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';

export class DrizzleVenuesRepository implements VenuesRepository {
  constructor(private readonly db: Db) {}

  async findBySlug(slug: string): Promise<VenueDetailEntity | null> {
    const [venueRow] = await this.db
      .select({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        city: venues.city,
        state: venues.state,
      })
      .from(venues)
      .where(eq(venues.slug, slug))
      .limit(1);

    if (!venueRow) return null;

    const eventRows = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.venueId, venueRow.id))
      .orderBy(asc(events.startsAt), asc(events.id));

    return {
      ...venueRow,
      events: eventRows.map(toEventEntity),
    };
  }
}
