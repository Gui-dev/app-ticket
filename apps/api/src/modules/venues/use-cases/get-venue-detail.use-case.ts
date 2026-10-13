import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';

export class GetVenueDetailUseCase {
  constructor(private readonly venuesRepository: VenuesRepository) {}

  execute(slug: string): Promise<VenueDetailEntity | null> {
    return this.venuesRepository.findBySlug(slug);
  }
}
