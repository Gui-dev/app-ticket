import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';

export class GetArtistDetailUseCase {
  constructor(private readonly artistsRepository: ArtistsRepository) {}

  execute(slug: string): Promise<ArtistDetailEntity | null> {
    return this.artistsRepository.findBySlug(slug);
  }
}
