import {
  bestSeatQuerySchema,
  bestSeatResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { FindBestSeatUseCase } from '../use-cases/find-best-seat.use-case.js';
import type { GetSeatmapUseCase } from '../use-cases/get-seatmap.use-case.js';

interface SeatmapRoutesDeps {
  getSeatmap: GetSeatmapUseCase;
  findBestSeat: FindBestSeatUseCase;
  getSession: GetSessionFn;
}

export function registerSeatmapRoutes(
  app: FastifyInstance,
  deps: SeatmapRoutesDeps,
): void {
  app.get('/events/:slug/seatmap', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const session = await deps.getSession(request.headers);
    const result = await deps.getSeatmap.execute(slug, session?.userId);
    if (!result) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const sectors = result.seatmap.sectors
      .filter((sector) => sector.rows.length > 0)
      .map((sector) => ({
        ...sector,
        rows: sector.rows.map((row) => ({
          ...row,
          seats: row.seats.map((seat) => ({
            label: seat.label,
            status:
              seat.status === 'reserved' ? ('occupied' as const) : seat.status,
          })),
        })),
      }));
    const payload = seatmapResponseSchema.parse({
      seatmap: { eventSlug: result.seatmap.eventSlug, sectors },
      holds: result.holds.map((hold) => ({
        sectorSlug: hold.sectorSlug,
        rowLabel: hold.rowLabel,
        seatLabel: hold.seatLabel,
        expiresAt: hold.expiresAt.toISOString(),
      })),
    });
    return reply.send(payload);
  });

  app.get('/events/:slug/best-seat', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { sector?: string };
    const parsed = bestSeatQuerySchema.safeParse({
      sector: query.sector ?? '',
    });
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const result = await deps.findBestSeat.execute(slug, parsed.data.sector);
    if (result.kind === 'event_not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    if (result.kind === 'sector_not_found') {
      return reply.code(404).send({ error: 'sector_not_found' });
    }
    if (result.kind === 'no_available_seat') {
      return reply.code(404).send({ error: 'no_available_seat' });
    }
    return reply.send(bestSeatResponseSchema.parse({ seat: result.seat }));
  });
}
