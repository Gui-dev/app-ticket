import {
  type EventDetailDto,
  type EventDto,
  listEventsQuerySchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { EventDetailEntity, EventEntity } from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';
import { GetEventDetailUseCase } from '../use-cases/get-event-detail.use-case.js';
import { ListEventsUseCase } from '../use-cases/list-events.use-case.js';

function toEventDto(entity: EventEntity): EventDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    category: { slug: entity.categorySlug, name: entity.categoryName },
    venue: {
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

function toEventDetailDto(entity: EventDetailEntity): EventDetailDto {
  return {
    ...toEventDto(entity),
    sectors: entity.sectors.map((sector) => ({
      slug: sector.slug,
      name: sector.name,
      priceFromCents: sector.priceFromCents,
    })),
  };
}

export function registerEventRoutes(
  app: FastifyInstance,
  eventsRepository: EventsRepository,
): void {
  const listUseCase = new ListEventsUseCase(eventsRepository);
  const detailUseCase = new GetEventDetailUseCase(eventsRepository);

  app.get('/events', async (request, reply) => {
    const parsed = listEventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_query',
        issues: parsed.error.issues,
      });
    }
    const list = await listUseCase.execute(parsed.data);
    return { events: list.map(toEventDto) };
  });

  app.get<{ Params: { slug: string } }>(
    '/events/:slug',
    async (request, reply) => {
      const event = await detailUseCase.execute(request.params.slug);
      if (!event) {
        return reply.code(404).send({ error: 'event_not_found' });
      }
      return { event: toEventDetailDto(event) };
    },
  );
}
