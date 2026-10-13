import { asc, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import {
  artists,
  categories,
  eventArtists,
  events,
  venues,
} from '../../../db/schema.js';
import {
  eventSelect,
  toEventEntity,
} from '../../events/infra/drizzle-events-repository.js';
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';

export class DrizzleArtistsRepository implements ArtistsRepository {
  constructor(private readonly db: Db) {}

  async findBySlug(slug: string): Promise<ArtistDetailEntity | null> {
    const [artistRow] = await this.db
      .select({ id: artists.id, slug: artists.slug, name: artists.name })
      .from(artists)
      .where(eq(artists.slug, slug))
      .limit(1);

    if (!artistRow) return null;

    const eventRows = await this.db
      .select(eventSelect)
      .from(events)
      .innerJoin(categories, eq(events.categoryId, categories.id))
      .innerJoin(venues, eq(events.venueId, venues.id))
      .innerJoin(eventArtists, eq(eventArtists.eventId, events.id))
      .where(eq(eventArtists.artistId, artistRow.id))
      .orderBy(asc(events.startsAt), asc(events.id));

    return {
      slug: artistRow.slug,
      name: artistRow.name,
      events: eventRows.map(toEventEntity),
    };
  }
}
