import {
  type OrganizerEventDto,
  type OrganizerSectorDto,
  organizerEventCreateSchema,
  organizerEventDetailResponseSchema,
  organizerEventDtoSchema,
  organizerEventListResponseSchema,
  organizerEventResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import { guardOrganizer } from '../../auth/role-guard.js';
import type {
  OrganizerEventRecord,
  OrganizerRepository,
  OrganizerSectorRecord,
} from '../domain/organizer-repository.js';
import { CreateEventUseCase } from '../use-cases/create-event.use-case.js';
import { DeleteEventUseCase } from '../use-cases/delete-event.use-case.js';
import { GetOrganizerEventDetailUseCase } from '../use-cases/get-organizer-event-detail.use-case.js';
import { ListOrganizerEventsUseCase } from '../use-cases/list-organizer-events.use-case.js';
import { UpdateEventUseCase } from '../use-cases/update-event.use-case.js';

interface OrganizerRoutesDeps {
  getSession: GetSessionFn;
  organizerRepository: OrganizerRepository;
}

const eventIdSchema = organizerEventDtoSchema.shape.id;

function toEventDto(event: OrganizerEventRecord): OrganizerEventDto {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    category: { slug: event.categorySlug, name: event.categoryName },
    venue: {
      slug: event.venueSlug,
      name: event.venueName,
      city: event.venueCity,
      state: event.venueState,
    },
    startsAt: event.startsAt.toISOString(),
    priceFromCents: event.priceFromCents,
    platform: event.organizerId === null,
  };
}

function toSectorDto(sector: OrganizerSectorRecord): OrganizerSectorDto {
  return {
    id: sector.id,
    slug: sector.slug,
    name: sector.name,
    priceFromCents: sector.priceFromCents,
    seatsTotal: sector.seatsTotal,
    rows: sector.rows.map((row) => ({
      id: row.id,
      label: row.label,
      seatCount: row.seatCount,
    })),
    lots: sector.lots.map((lot) => ({
      id: lot.id,
      name: lot.name,
      priceCents: lot.priceCents,
      startsAt: lot.startsAt.toISOString(),
      endsAt: lot.endsAt.toISOString(),
    })),
  };
}

export function registerOrganizerRoutes(
  app: FastifyInstance,
  deps: OrganizerRoutesDeps,
): void {
  const listEvents = new ListOrganizerEventsUseCase(deps.organizerRepository);
  const eventDetail = new GetOrganizerEventDetailUseCase(
    deps.organizerRepository,
  );
  const createEvent = new CreateEventUseCase(deps.organizerRepository);
  const updateEvent = new UpdateEventUseCase(deps.organizerRepository);
  const deleteEvent = new DeleteEventUseCase(deps.organizerRepository);

  app.get('/organizer/session', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    return reply.code(200).send({
      user: {
        id: session.userId,
        email: session.email ?? null,
        role: session.role,
      },
    });
  });

  app.get('/organizer/events', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const events = await listEvents.execute(session.userId);
    return reply.code(200).send(
      organizerEventListResponseSchema.parse({
        events: events.map(toEventDto),
      }),
    );
  });

  app.post('/organizer/events', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const parsed = organizerEventCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await createEvent.execute({
      title: parsed.data.title,
      description: parsed.data.description,
      categorySlug: parsed.data.categorySlug,
      venueSlug: parsed.data.venueSlug,
      startsAt: new Date(parsed.data.startsAt),
      organizerId: session.userId,
    });
    if (result.kind === 'category_not_found') {
      return reply.code(404).send({ error: 'category_not_found' });
    }
    if (result.kind === 'venue_not_found') {
      return reply.code(404).send({ error: 'venue_not_found' });
    }
    return reply.code(201).send(
      organizerEventResponseSchema.parse({
        event: toEventDto(result.event),
      }),
    );
  });

  app.get('/organizer/events/:id', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { id } = request.params as { id: string };
    if (!eventIdSchema.safeParse(id).success) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const result = await eventDetail.execute({
      eventId: id,
      userId: session.userId,
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'event_forbidden' });
    }
    return reply.code(200).send(
      organizerEventDetailResponseSchema.parse({
        event: {
          ...toEventDto(result.event),
          sectors: result.sectors.map(toSectorDto),
        },
      }),
    );
  });

  app.patch('/organizer/events/:id', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { id } = request.params as { id: string };
    if (!eventIdSchema.safeParse(id).success) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const parsed = organizerEventCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await updateEvent.execute({
      eventId: id,
      userId: session.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      categorySlug: parsed.data.categorySlug,
      venueSlug: parsed.data.venueSlug,
      startsAt: new Date(parsed.data.startsAt),
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (
      result.kind === 'category_not_found' ||
      result.kind === 'venue_not_found'
    ) {
      return reply.code(404).send({ error: result.kind });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'event_forbidden' });
    }
    return reply.code(200).send(
      organizerEventResponseSchema.parse({
        event: toEventDto(result.event),
      }),
    );
  });

  app.delete('/organizer/events/:id', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { id } = request.params as { id: string };
    if (!eventIdSchema.safeParse(id).success) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const result = await deleteEvent.execute({
      eventId: id,
      userId: session.userId,
    });
    if (result === 'not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (result === 'forbidden') {
      return reply.code(403).send({ error: 'event_forbidden' });
    }
    if (result === 'has_orders') {
      return reply.code(409).send({ error: 'event_has_orders' });
    }
    return reply.code(200).send({ ok: true });
  });
}
