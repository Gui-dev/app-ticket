import type { VenueDetailDto, VenueDetailResponse } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import { toEventDto } from '../../events/mappers/event-dto.js';
import type { VenueDetailEntity } from '../domain/venue-entity.js';
import type { VenuesRepository } from '../domain/venues-repository.js';
import { GetVenueDetailUseCase } from '../use-cases/get-venue-detail.use-case.js';

function toVenueDetailDto(entity: VenueDetailEntity): VenueDetailDto {
  return {
    slug: entity.slug,
    name: entity.name,
    city: entity.city,
    state: entity.state,
    events: entity.events.map(toEventDto),
  };
}

export function registerVenueRoutes(
  app: FastifyInstance,
  venuesRepository: VenuesRepository,
): void {
  const detailUseCase = new GetVenueDetailUseCase(venuesRepository);

  app.get<{ Params: { slug: string } }>(
    '/venues/:slug',
    async (request, reply) => {
      const venue = await detailUseCase.execute(request.params.slug);
      if (!venue) {
        return reply.code(404).send({ error: 'venue_not_found' });
      }
      const payload: VenueDetailResponse = { venue: toVenueDetailDto(venue) };
      return reply.send(payload);
    },
  );
}
