import type {
  OrganizerRepository,
  UpdateEventResult,
} from '../domain/organizer-repository';

export interface UpdateEventInput {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  categorySlug: string;
  venueSlug: string;
  startsAt: Date;
}

export class UpdateEventUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: UpdateEventInput): Promise<UpdateEventResult> {
    const ownership = await this.organizerRepository.findEventForOrganizer({
      eventId: input.eventId,
      userId: input.userId,
    });
    if (ownership.kind !== 'ok') return ownership;
    if (ownership.event.organizerId === null) {
      return { kind: 'forbidden' };
    }
    return this.organizerRepository.updateEvent(input);
  }
}
