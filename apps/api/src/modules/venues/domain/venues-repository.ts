import type { VenueDetailEntity } from './venue-entity.js';

export interface VenuesRepository {
  findBySlug(slug: string): Promise<VenueDetailEntity | null>;
}
