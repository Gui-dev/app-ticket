import { seatAvailabilityMessageSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { SeatAvailabilityFanout } from '../infra/seat-availability-fanout.js';
import type { GetSeatmapUseCase } from '../use-cases/get-seatmap.use-case.js';

interface SeatAvailabilityRoutesDeps {
  getSeatmap: GetSeatmapUseCase;
  fanout: SeatAvailabilityFanout;
}

const WS_OPEN_READY_STATE = 1;

export function registerSeatAvailabilityRoutes(
  app: FastifyInstance,
  deps: SeatAvailabilityRoutesDeps,
): void {
  app.register((instance) => {
    instance.get(
      '/events/:slug/seat-availability',
      { websocket: true },
      (socket, request) => {
        const slug = (request.params as { slug: string }).slug;
        let unregister: (() => void) | null = null;
        let closed = false;
        socket.once('close', () => {
          closed = true;
          unregister?.();
          unregister = null;
        });
        void (async () => {
          try {
            const result = await deps.getSeatmap.execute(slug);
            if (closed || socket.readyState !== WS_OPEN_READY_STATE) return;
            if (!result) {
              socket.close(4004, 'event_not_found');
              return;
            }
            unregister = deps.fanout.register(slug, socket);
            socket.send(
              JSON.stringify(
                seatAvailabilityMessageSchema.parse({
                  type: 'connected',
                  eventSlug: slug,
                }),
              ),
            );
          } catch {
            socket.close(1011, 'internal_error');
          }
        })();
      },
    );
  });
}
