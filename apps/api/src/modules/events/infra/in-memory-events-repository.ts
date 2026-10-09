import type { EventEntity, EventView } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class InMemoryEventsRepository implements EventsRepository {
  constructor(private readonly items: EventEntity[]) {}

  findAll(view: EventView): Promise<EventEntity[]> {
    let filtered = this.items;

    if (view === 'featured') {
      filtered = this.items.filter((item) => item.featured);
    } else if (view === 'hot') {
      filtered = this.items.filter((item) => item.isHot);
    }

    const sorted = [...filtered].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );

    return Promise.resolve(sorted);
  }
}
