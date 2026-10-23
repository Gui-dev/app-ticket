import type {
  DeleteEventResult,
  OrganizerRepository,
} from '../domain/organizer-repository';

export interface DeleteEventInput {
  eventId: string;
  userId: string;
}

export class DeleteEventUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: DeleteEventInput): Promise<DeleteEventResult> {
    const ownership =
      await this.organizerRepository.findEventForOrganizer(input);
    if (ownership.kind !== 'ok') {
      return ownership.kind === 'not_found' ? 'not_found' : 'forbidden';
    }
    if (ownership.event.organizerId === null) {
      return 'forbidden';
    }
    return this.organizerRepository.deleteEvent(input);
  }
}
