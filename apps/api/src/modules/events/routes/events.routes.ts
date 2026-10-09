import { type EventDto, listEventsQuerySchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { EventEntity } from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';
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

export function registerEventRoutes(
  app: FastifyInstance,
  eventsRepository: EventsRepository,
): void {
  const useCase = new ListEventsUseCase(eventsRepository);

  app.get('/events', async (request, reply) => {
    const parsed = listEventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_query',
        issues: parsed.error.issues,
      });
    }
    const list = await useCase.execute(parsed.data);
    return { events: list.map(toEventDto) };
  });
}
