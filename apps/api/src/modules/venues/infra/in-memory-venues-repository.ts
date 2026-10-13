import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';

export class InMemoryVenuesRepository implements VenuesRepository {
  constructor(private readonly items: EventDetailEntity[]) {}

  findBySlug(slug: string): Promise<VenueDetailEntity | null> {
    const matching = this.items.filter((item) => item.venueSlug === slug);
    if (matching.length === 0) {
      return Promise.resolve(null);
    }
    const first = matching[0];
    const events = [...matching].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
    );
    return Promise.resolve({
      slug,
      name: first.venueName,
      city: first.venueCity,
      state: first.venueState,
      events,
    });
  }
}
