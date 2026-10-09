import type { EventEntity, EventView } from './event-entity';

export interface EventsRepository {
  findAll(view: EventView): Promise<EventEntity[]>;
}
