import { seatAvailabilityMessageSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { SeatmapRepository } from '../domain/seatmap-repository.js';
import type { SeatAvailabilityFanout } from '../infra/seat-availability-fanout.js';

interface SeatAvailabilityRoutesDeps {
  seatmapRepository: SeatmapRepository;
  fanout: SeatAvailabilityFanout;
}

const WS_OPEN_READY_STATE = 1;
const WS_HEARTBEAT_MS = 30_000;

export function registerSeatAvailabilityRoutes(
  app: FastifyInstance,
  deps: SeatAvailabilityRoutesDeps,
): void {
  app.register((instance) => {
    const heartbeat = setInterval(() => deps.fanout.sweep(), WS_HEARTBEAT_MS);
    heartbeat.unref();
    instance.addHook('onClose', async () => {
      clearInterval(heartbeat);
      deps.fanout.terminateAll();
    });
    instance.get(
      '/events/:slug/seat-availability',
      { websocket: true },
      (socket, request) => {
        const slug = (request.params as { slug: string }).slug;
        let unregister: (() => void) | null = null;
        let closed = false;
        socket.on('pong', () => deps.fanout.markAlive(socket));
        socket.once('close', () => {
          closed = true;
          unregister?.();
          unregister = null;
        });
        void (async () => {
          try {
            const exists = await deps.seatmapRepository.existsBySlug(slug);
            if (closed || socket.readyState !== WS_OPEN_READY_STATE) return;
            if (!exists) {
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
          } catch (error) {
            console.error('[seat-availability] lookup failed', error);
            socket.close(1011, 'internal_error');
          }
        })();
      },
    );
  });
}
