import type {
  OrganizerEventRecord,
  OrganizerRepository,
} from '../domain/organizer-repository';

export class ListOrganizerEventsUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(userId: string): Promise<OrganizerEventRecord[]> {
    return this.organizerRepository.listEventsForOrganizer(userId);
  }
}
