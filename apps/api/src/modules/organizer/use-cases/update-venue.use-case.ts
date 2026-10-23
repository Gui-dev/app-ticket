import type {
  OrganizerRepository,
  OrganizerVenueRecord,
} from '../domain/organizer-repository';

export interface UpdateVenueInput {
  venueId: string;
  name: string;
  city: string;
  state: string;
}

export class UpdateVenueUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: UpdateVenueInput): Promise<OrganizerVenueRecord | null> {
    return this.organizerRepository.updateVenue(input);
  }
}
