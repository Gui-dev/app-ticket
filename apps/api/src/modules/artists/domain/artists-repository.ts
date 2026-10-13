import type { ArtistDetailEntity } from './artist-entity.js';

export interface ArtistsRepository {
  findBySlug(slug: string): Promise<ArtistDetailEntity | null>;
}
