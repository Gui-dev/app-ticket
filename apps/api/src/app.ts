import Fastify, { type FastifyInstance } from 'fastify';
import { createDb, type Db } from './db/client.js';
import type { EventsRepository } from './modules/events/domain/events-repository.js';
import { DrizzleEventsRepository } from './modules/events/infra/drizzle-events-repository.js';
import { registerEventRoutes } from './modules/events/routes/events.routes.js';

export function buildApp(
  options: { eventsRepository?: EventsRepository } = {},
): FastifyInstance {
  const app = Fastify({ logger: false });

  let defaultDb: Db | null = null;
  let eventsRepository = options.eventsRepository;
  if (!eventsRepository) {
    defaultDb = createDb();
    eventsRepository = new DrizzleEventsRepository(defaultDb);
  }

  app.addHook('onClose', async () => {
    await defaultDb?.$client.end();
  });

  registerEventRoutes(app, eventsRepository);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
