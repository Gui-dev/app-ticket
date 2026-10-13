import type {
  ArtistDetailDto,
  ArtistDetailResponse,
  EventDto,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { EventEntity } from '../../events/domain/event-entity.js';
import type { ArtistDetailEntity } from '../domain/artist-entity.js';
import type { ArtistsRepository } from '../domain/artists-repository.js';
import { GetArtistDetailUseCase } from '../use-cases/get-artist-detail.use-case.js';

function toEventDto(entity: EventEntity): EventDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    category: { slug: entity.categorySlug, name: entity.categoryName },
    venue: {
      slug: entity.venueSlug,
      name: entity.venueName,
      city: entity.venueCity,
      state: entity.venueState,
    },
    startsAt: entity.startsAt.toISOString(),
    priceFromCents: entity.priceFromCents,
    imageUrl: entity.imageUrl,
    badgeLabel: entity.badgeLabel,
  };
}

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
