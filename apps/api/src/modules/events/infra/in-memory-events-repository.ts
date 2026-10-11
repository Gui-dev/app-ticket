import type { SearchFilters } from '@ticketvibe/shared';
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
} from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

function matchesQuery(event: EventEntity, query: string): boolean {
  const haystack = `${event.title} ${event.description} ${event.venueName} ${event.venueCity}`;
  const haystackLower = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystackLower.includes(term));
}

export class InMemoryEventsRepository implements EventsRepository {
  constructor(private readonly items: EventDetailEntity[]) {}

  findAll(
    view: EventView,
    filters: SearchFilters = {},
  ): Promise<EventEntity[]> {
    let filtered = this.items;

    if (view === 'featured') {
      filtered = filtered.filter((item) => item.featured);
    } else if (view === 'hot') {
      filtered = filtered.filter((item) => item.isHot);
    }
    if (filters.category) {
      filtered = filtered.filter(
        (item) => item.categorySlug === filters.category,
      );
    }
    if (filters.state) {
      filtered = filtered.filter((item) => item.venueState === filters.state);
    }
    if (filters.q) {
      filtered = filtered.filter((item) => matchesQuery(item, filters.q ?? ''));
    }
    if (filters.from) {
      const from = new Date(`${filters.from}T00:00:00.000Z`);
      filtered = filtered.filter((item) => item.startsAt >= from);
    }
    if (filters.to) {
      const to = new Date(`${filters.to}T23:59:59.999Z`);
      filtered = filtered.filter((item) => item.startsAt <= to);
    }

    const sorted = [...filtered].sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
    );

    return Promise.resolve(sorted);
  }

  findBySlug(slug: string): Promise<EventDetailEntity | null> {
    const item = this.items.find((entry) => entry.slug === slug);
    if (!item) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...item,
      sectors: [...item.sectors].sort(
        (a, b) =>
          a.priceFromCents - b.priceFromCents || a.slug.localeCompare(b.slug),
      ),
    });
  }
}
