import type { SearchFilters } from '@ticketvibe/shared';
import type {
  EventDetailEntity,
  EventEntity,
  EventView,
  SuggestResult,
} from './event-entity';

export interface EventsRepository {
  findAll(view: EventView, filters?: SearchFilters): Promise<EventEntity[]>;
  findBySlug(slug: string): Promise<EventDetailEntity | null>;
  suggest(q: string): Promise<SuggestResult>;
}
