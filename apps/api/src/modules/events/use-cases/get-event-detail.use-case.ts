import type { EventDetailEntity } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class GetEventDetailUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  execute(slug: string): Promise<EventDetailEntity | null> {
    return this.eventsRepository.findBySlug(slug);
  }
}
