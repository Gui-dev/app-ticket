import {
  type OrganizerEventDto,
  type OrganizerLotDto,
  type OrganizerSectorDto,
  type OrganizerVenueDto,
  organizerEventCreateSchema,
  organizerEventDetailResponseSchema,
  organizerEventDtoSchema,
  organizerEventListResponseSchema,
  organizerEventResponseSchema,
  organizerLotCreateSchema,
  organizerLotDtoSchema,
  organizerRowCreateSchema,
  organizerSalesReportQuerySchema,
  organizerSalesReportResponseSchema,
  organizerSectorCreateSchema,
  organizerSectorDtoSchema,
  organizerVenueCreateSchema,
  organizerVenueListResponseSchema,
  organizerVenueResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import { guardOrganizer } from '../../auth/role-guard.js';
import type {
  OrganizerEventRecord,
  OrganizerLotRecord,
  OrganizerRepository,
  OrganizerSectorRecord,
  OrganizerVenueRecord,
} from '../domain/organizer-repository.js';
import { CreateEventUseCase } from '../use-cases/create-event.use-case.js';
import { CreateLotUseCase } from '../use-cases/create-lot.use-case.js';
import { CreateRowUseCase } from '../use-cases/create-row.use-case.js';
import { CreateSectorUseCase } from '../use-cases/create-sector.use-case.js';
import { CreateVenueUseCase } from '../use-cases/create-venue.use-case.js';
import { DeleteEventUseCase } from '../use-cases/delete-event.use-case.js';
import { DeleteLotUseCase } from '../use-cases/delete-lot.use-case.js';
import { DeleteRowUseCase } from '../use-cases/delete-row.use-case.js';
import { DeleteSectorUseCase } from '../use-cases/delete-sector.use-case.js';
import { GetOrganizerEventDetailUseCase } from '../use-cases/get-organizer-event-detail.use-case.js';
import { GetSalesReportUseCase } from '../use-cases/get-organizer-sales-report.use-case.js';
import { ListOrganizerEventsUseCase } from '../use-cases/list-organizer-events.use-case.js';
import { ListVenuesUseCase } from '../use-cases/list-venues.use-case.js';
import { UpdateEventUseCase } from '../use-cases/update-event.use-case.js';
import { UpdateLotUseCase } from '../use-cases/update-lot.use-case.js';
import { UpdateVenueUseCase } from '../use-cases/update-venue.use-case.js';

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

function toLotDto(lot: OrganizerLotRecord): OrganizerLotDto {
  return {
    id: lot.id,
    name: lot.name,
    priceCents: lot.priceCents,
    startsAt: lot.startsAt.toISOString(),
    endsAt: lot.endsAt.toISOString(),
  };
}

function toVenueDto(venue: OrganizerVenueRecord): OrganizerVenueDto {
  return {
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    city: venue.city,
    state: venue.state,
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
  const listVenues = new ListVenuesUseCase(deps.organizerRepository);
  const createVenue = new CreateVenueUseCase(deps.organizerRepository);
  const updateVenue = new UpdateVenueUseCase(deps.organizerRepository);
  const createSector = new CreateSectorUseCase(deps.organizerRepository);
  const deleteSector = new DeleteSectorUseCase(deps.organizerRepository);
  const createRow = new CreateRowUseCase(deps.organizerRepository);
  const deleteRow = new DeleteRowUseCase(deps.organizerRepository);
  const createLot = new CreateLotUseCase(deps.organizerRepository);
  const updateLot = new UpdateLotUseCase(deps.organizerRepository);
  const deleteLot = new DeleteLotUseCase(deps.organizerRepository);
  const salesReport = new GetSalesReportUseCase(deps.organizerRepository);

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

  app.get('/organizer/venues', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const venues = await listVenues.execute();
    return reply.code(200).send(
      organizerVenueListResponseSchema.parse({
        venues: venues.map(toVenueDto),
      }),
    );
  });

  app.post('/organizer/venues', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const parsed = organizerVenueCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const venue = await createVenue.execute(parsed.data);
    return reply.code(201).send(
      organizerVenueResponseSchema.parse({
        venue: toVenueDto(venue),
      }),
    );
  });

  app.patch('/organizer/venues/:id', async (request, reply) => {
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
      return reply.code(404).send({ error: 'venue_not_found' });
    }
    const parsed = organizerVenueCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const venue = await updateVenue.execute({ venueId: id, ...parsed.data });
    if (!venue) {
      return reply.code(404).send({ error: 'venue_not_found' });
    }
    return reply.code(200).send(
      organizerVenueResponseSchema.parse({
        venue: toVenueDto(venue),
      }),
    );
  });

  app.post('/organizer/events/:id/sectors', async (request, reply) => {
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
    const parsed = organizerSectorCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await createSector.execute({
      eventId: id,
      userId: session.userId,
      name: parsed.data.name,
      priceFromCents: parsed.data.priceFromCents,
      rows: parsed.data.rows,
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'event_forbidden' });
    }
    if (result.kind === 'sector_conflict') {
      return reply.code(409).send({ error: 'sector_conflict' });
    }
    if (result.kind === 'label_conflict') {
      return reply.code(409).send({ error: 'row_label_conflict' });
    }
    return reply.code(201).send({
      sector: organizerSectorDtoSchema.parse(toSectorDto(result.sector)),
    });
  });

  app.delete('/organizer/sectors/:sectorId', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { sectorId } = request.params as { sectorId: string };
    if (!organizerSectorDtoSchema.shape.id.safeParse(sectorId).success) {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    const result = await deleteSector.execute({
      sectorId,
      userId: session.userId,
    });
    if (result === 'not_found') {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    if (result === 'forbidden') {
      return reply.code(403).send({ error: 'sector_forbidden' });
    }
    if (result === 'has_orders') {
      return reply.code(409).send({ error: 'sector_has_orders' });
    }
    return reply.code(200).send({ ok: true });
  });

  app.post('/organizer/sectors/:sectorId/lots', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { sectorId } = request.params as { sectorId: string };
    if (!organizerSectorDtoSchema.shape.id.safeParse(sectorId).success) {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    const parsed = organizerLotCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await createLot.execute({
      sectorId,
      userId: session.userId,
      name: parsed.data.name,
      priceCents: parsed.data.priceCents,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'sector_forbidden' });
    }
    if (result.kind === 'invalid_period') {
      return reply.code(400).send({ error: 'invalid_period' });
    }
    if (result.kind === 'overlapping') {
      return reply.code(409).send({ error: 'lot_overlaps' });
    }
    return reply.code(201).send({
      lot: organizerLotDtoSchema.parse(toLotDto(result.lot)),
    });
  });

  app.patch('/organizer/lots/:lotId', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { lotId } = request.params as { lotId: string };
    if (!organizerLotDtoSchema.shape.id.safeParse(lotId).success) {
      return reply.code(404).send({ error: 'lot_not_found' });
    }
    const parsed = organizerLotCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await updateLot.execute({
      lotId,
      userId: session.userId,
      name: parsed.data.name,
      priceCents: parsed.data.priceCents,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'lot_not_found' });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'lot_forbidden' });
    }
    if (result.kind === 'invalid_period') {
      return reply.code(400).send({ error: 'invalid_period' });
    }
    if (result.kind === 'overlapping') {
      return reply.code(409).send({ error: 'lot_overlaps' });
    }
    return reply.code(200).send({
      lot: organizerLotDtoSchema.parse(toLotDto(result.lot)),
    });
  });

  app.delete('/organizer/lots/:lotId', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { lotId } = request.params as { lotId: string };
    if (!organizerLotDtoSchema.shape.id.safeParse(lotId).success) {
      return reply.code(404).send({ error: 'lot_not_found' });
    }
    const result = await deleteLot.execute({
      lotId,
      userId: session.userId,
    });
    if (result === 'not_found') {
      return reply.code(404).send({ error: 'lot_not_found' });
    }
    if (result === 'forbidden') {
      return reply.code(403).send({ error: 'lot_forbidden' });
    }
    return reply.code(200).send({ ok: true });
  });

  app.post('/organizer/sectors/:sectorId/rows', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { sectorId } = request.params as { sectorId: string };
    if (!organizerSectorDtoSchema.shape.id.safeParse(sectorId).success) {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    const parsed = organizerRowCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await createRow.execute({
      sectorId,
      userId: session.userId,
      label: parsed.data.label,
      seatCount: parsed.data.seatCount,
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'sector_forbidden' });
    }
    if (result.kind === 'label_conflict') {
      return reply.code(409).send({ error: 'row_label_conflict' });
    }
    return reply.code(201).send({
      sector: organizerSectorDtoSchema.parse(toSectorDto(result.sector)),
    });
  });

  app.delete('/organizer/rows/:rowId', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    const { rowId } = request.params as { rowId: string };
    if (!organizerSectorDtoSchema.shape.id.safeParse(rowId).success) {
      return reply.code(404).send({ error: 'row_not_found' });
    }
    const result = await deleteRow.execute({
      rowId,
      userId: session.userId,
    });
    if (result === 'not_found') {
      return reply.code(404).send({ error: 'row_not_found' });
    }
    if (result === 'forbidden') {
      return reply.code(403).send({ error: 'row_forbidden' });
    }
    if (result === 'has_orders') {
      return reply.code(409).send({ error: 'row_has_orders' });
    }
    return reply.code(200).send({ ok: true });
  });

  app.get('/organizer/events/:id/report', async (request, reply) => {
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
    const parsed = organizerSalesReportQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query' });
    }
    if (
      parsed.data.from !== undefined &&
      parsed.data.to !== undefined &&
      parsed.data.from >= parsed.data.to
    ) {
      return reply.code(400).send({ error: 'invalid_query' });
    }
    const result = await salesReport.execute({
      eventId: id,
      userId: session.userId,
      from: parsed.data.from ? new Date(parsed.data.from) : null,
      to: parsed.data.to ? new Date(parsed.data.to) : null,
    });
    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (result.kind === 'forbidden') {
      return reply.code(403).send({ error: 'event_forbidden' });
    }
    return reply.code(200).send(
      organizerSalesReportResponseSchema.parse({
        report: {
          eventId: id,
          from: parsed.data.from ?? null,
          to: parsed.data.to ?? null,
          ticketsSold: result.report.ticketsSold,
          ordersCount: result.report.ordersCount,
          grossCents: result.report.grossCents,
          platformFeeCents: result.report.platformFeeCents,
          netCents: result.report.netCents,
        },
      }),
    );
  });
}
