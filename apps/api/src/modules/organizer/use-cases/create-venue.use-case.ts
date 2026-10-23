import type {
  OrganizerRepository,
  OrganizerVenueRecord,
} from '../domain/organizer-repository';

export interface CreateVenueInput {
  name: string;
  city: string;
  state: string;
}

export class CreateVenueUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: CreateVenueInput): Promise<OrganizerVenueRecord> {
    return this.organizerRepository.createVenue(input);
  }
}
