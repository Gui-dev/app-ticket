import type { SuggestResult } from '../domain/event-entity';
import type { EventsRepository } from '../domain/events-repository';

export class SuggestEventsUseCase {
  constructor(private readonly eventsRepository: EventsRepository) {}

  execute(q: string): Promise<SuggestResult> {
    return this.eventsRepository.suggest(q);
  }
}
