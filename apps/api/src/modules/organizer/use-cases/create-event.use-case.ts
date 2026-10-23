import type {
  CreateEventResult,
  OrganizerRepository,
} from '../domain/organizer-repository';

export interface CreateEventInput {
  title: string;
  description: string;
  categorySlug: string;
  venueSlug: string;
  startsAt: Date;
  organizerId: string;
}

export class CreateEventUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: CreateEventInput): Promise<CreateEventResult> {
    return this.organizerRepository.createEvent(input);
  }
}
