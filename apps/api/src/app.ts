import Fastify, { type FastifyInstance } from 'fastify';
import type { EventsRepository } from './modules/events/domain/events-repository.js';
import { InMemoryEventsRepository } from './modules/events/infra/in-memory-events-repository.js';
import { registerEventRoutes } from './modules/events/routes/events.routes.js';

export function buildApp(
  options: { eventsRepository?: EventsRepository } = {},
): FastifyInstance {
  const app = Fastify({ logger: false });
  const eventsRepository =
    options.eventsRepository ?? new InMemoryEventsRepository([]);

  registerEventRoutes(app, eventsRepository);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
