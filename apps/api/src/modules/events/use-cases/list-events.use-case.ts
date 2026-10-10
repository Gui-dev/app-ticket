import type { ListEventsQuery } from '@ticketvibe/shared';
import type { EventEntity } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class ListEventsUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  async execute(query: ListEventsQuery): Promise<EventEntity[]> {
    const { view = 'all', ...filters } = query;
    return this.eventsRepository.findAll(view, filters);
  }
}
