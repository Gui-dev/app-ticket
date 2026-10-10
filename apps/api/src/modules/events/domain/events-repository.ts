import type { SearchFilters } from '@ticketvibe/shared';
import type { EventEntity, EventView } from './event-entity';

export interface EventsRepository {
  findAll(view: EventView, filters?: SearchFilters): Promise<EventEntity[]>;
}
