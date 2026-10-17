import {
  holdRequestSchema,
  holdResponseSchema,
  releaseResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { HoldSeatUseCase } from '../use-cases/hold-seat.use-case.js';
import type { ReleaseHoldUseCase } from '../use-cases/release-hold.use-case.js';

interface HoldRoutesDeps {
  getSession: GetSessionFn;
  holdSeat: HoldSeatUseCase;
  releaseHold: ReleaseHoldUseCase;
}

export function registerHoldRoutes(
  app: FastifyInstance,
  deps: HoldRoutesDeps,
): void {
  app.post('/events/:slug/holds', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = holdRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.holdSeat.execute({
      userId: session.userId,
      eventSlug: slug,
      sectorSlug: parsed.data.sectorSlug,
      rowLabel: parsed.data.rowLabel,
      seatLabel: parsed.data.seatLabel,
    });
    switch (result.kind) {
      case 'event_not_found':
      case 'sector_not_found':
      case 'seat_not_found':
        return reply.code(404).send({ error: result.kind });
      case 'cart_limit':
        return reply.code(409).send({ error: 'cart_limit' });
      case 'seat_unavailable':
        return reply.code(409).send({ error: 'seat_unavailable' });
      case 'seat_held':
        return reply.code(409).send({ error: 'seat_held' });
      case 'held': {
        const payload = holdResponseSchema.parse({
          hold: {
            sectorSlug: result.hold.sectorSlug,
            rowLabel: result.hold.rowLabel,
            seatLabel: result.hold.seatLabel,
            expiresAt: result.hold.expiresAt.toISOString(),
          },
        });
        return reply.code(result.renewed ? 200 : 201).send(payload);
      }
    }
  });

  app.post('/events/:slug/holds/release', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = holdRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.releaseHold.execute({
      userId: session.userId,
      eventSlug: slug,
      sectorSlug: parsed.data.sectorSlug,
      rowLabel: parsed.data.rowLabel,
      seatLabel: parsed.data.seatLabel,
    });
    switch (result.kind) {
      case 'event_not_found':
      case 'sector_not_found':
      case 'seat_not_found':
      case 'hold_not_found':
        return reply.code(404).send({ error: 'hold_not_found' });
      case 'released':
        return reply.send(releaseResponseSchema.parse({ released: true }));
    }
  });
}
