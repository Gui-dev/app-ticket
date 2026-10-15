import {
  bestSeatQuerySchema,
  bestSeatResponseSchema,
  seatmapResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { FindBestSeatUseCase } from '../use-cases/find-best-seat.use-case.js';
import type { GetSeatmapUseCase } from '../use-cases/get-seatmap.use-case.js';

interface SeatmapRoutesDeps {
  getSeatmap: GetSeatmapUseCase;
  findBestSeat: FindBestSeatUseCase;
}

export function registerSeatmapRoutes(
  app: FastifyInstance,
  deps: SeatmapRoutesDeps,
): void {
  app.get('/events/:slug/seatmap', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const seatmap = await deps.getSeatmap.execute(slug);
    if (!seatmap) {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const sectors = seatmap.sectors.filter((sector) => sector.rows.length > 0);
    const payload = seatmapResponseSchema.parse({
      seatmap: { eventSlug: seatmap.eventSlug, sectors },
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
