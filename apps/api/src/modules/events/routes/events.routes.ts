import {
  type EventDetailDto,
  listEventsQuerySchema,
  suggestQuerySchema,
  suggestResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { EventDetailEntity } from '../domain/event-entity.js';
import type { EventsRepository } from '../domain/events-repository.js';
import { toEventDto } from '../mappers/event-dto.js';
import { GetEventDetailUseCase } from '../use-cases/get-event-detail.use-case.js';
import { ListEventsUseCase } from '../use-cases/list-events.use-case.js';
import { SuggestEventsUseCase } from '../use-cases/suggest-events.use-case.js';

function toEventDetailDto(entity: EventDetailEntity): EventDetailDto {
  return {
    ...toEventDto(entity),
    sectors: entity.sectors.map((sector) => ({
      slug: sector.slug,
      name: sector.name,
      priceFromCents: sector.priceFromCents,
      seatsAvailable: sector.seatsAvailable,
    })),
    artists: entity.artists.map((artist) => ({
      slug: artist.slug,
      name: artist.name,
    })),
  };
}

export function registerEventRoutes(
  app: FastifyInstance,
  eventsRepository: EventsRepository,
): void {
  const listUseCase = new ListEventsUseCase(eventsRepository);
  const detailUseCase = new GetEventDetailUseCase(eventsRepository);
  const suggestUseCase = new SuggestEventsUseCase(eventsRepository);

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

  app.get('/events/suggest', async (request, reply) => {
    const parsed = suggestQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_query',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const result = await suggestUseCase.execute(parsed.data.q);

    const payload = suggestResponseSchema.parse({
      events: result.events.map((event) => ({
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        venueName: event.venueName,
        venueCity: event.venueCity,
        venueState: event.venueState,
        priceFromCents: event.priceFromCents,
      })),
      locations: result.locations,
    });

    return reply.send(payload);
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
