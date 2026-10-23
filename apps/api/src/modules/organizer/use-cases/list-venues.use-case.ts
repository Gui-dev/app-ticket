import type {
  OrganizerRepository,
  OrganizerVenueRecord,
} from '../domain/organizer-repository';

export class ListVenuesUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(): Promise<OrganizerVenueRecord[]> {
    return this.organizerRepository.listVenues();
  }
}
