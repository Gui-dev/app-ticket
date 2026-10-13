import type { ArtistDetailDto, ArtistDetailResponse } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import { toEventDto } from '../../events/mappers/event-dto.js';
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';
import { GetArtistDetailUseCase } from '../use-cases/get-artist-detail.use-case.js';

function toArtistDetailDto(entity: ArtistDetailEntity): ArtistDetailDto {
  return {
    slug: entity.slug,
    name: entity.name,
    events: entity.events.map(toEventDto),
  };
}

export function registerArtistRoutes(
  app: FastifyInstance,
  artistsRepository: ArtistsRepository,
): void {
  const detailUseCase = new GetArtistDetailUseCase(artistsRepository);

  app.get<{ Params: { slug: string } }>(
    '/artists/:slug',
    async (request, reply) => {
      const artist = await detailUseCase.execute(request.params.slug);
      if (!artist) {
        return reply.code(404).send({ error: 'artist_not_found' });
      }
      const payload: ArtistDetailResponse = {
        artist: toArtistDetailDto(artist),
      };
      return reply.send(payload);
    },
  );
}
