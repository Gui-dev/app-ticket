import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';

export class InMemoryArtistsRepository implements ArtistsRepository {
  constructor(private readonly items: EventDetailEntity[]) {}

  findBySlug(slug: string): Promise<ArtistDetailEntity | null> {
    const withArtist = this.items.filter((item) =>
      item.artists.some((artist) => artist.slug === slug),
    );
    if (withArtist.length === 0) {
      return Promise.resolve(null);
    }
    const name =
      withArtist[0].artists.find((artist) => artist.slug === slug)?.name ??
      slug;
    const events = [...withArtist].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
    );
    return Promise.resolve({ slug, name, events });
  }
}
