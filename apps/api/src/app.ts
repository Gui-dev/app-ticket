import Fastify, { type FastifyInstance } from 'fastify';
import { createDb, type Db } from './db/client.js';
import type { CategoriesRepository } from './modules/categories/domain/categories-repository.js';
import { DrizzleCategoriesRepository } from './modules/categories/infra/drizzle-categories-repository.js';
import { registerCategoryRoutes } from './modules/categories/routes/categories.routes.js';
import type { EventsRepository } from './modules/events/domain/events-repository.js';
import { DrizzleEventsRepository } from './modules/events/infra/drizzle-events-repository.js';
import { registerEventRoutes } from './modules/events/routes/events.routes.js';

export function buildApp(
  options: {
    eventsRepository?: EventsRepository;
    categoriesRepository?: CategoriesRepository;
  } = {},
): FastifyInstance {
  const app = Fastify({ logger: false });

  let defaultDb: Db | null = null;
  const getDefaultDb = (): Db => {
    if (!defaultDb) defaultDb = createDb();
    return defaultDb;
  };

  const eventsRepository =
    options.eventsRepository ?? new DrizzleEventsRepository(getDefaultDb());
  const categoriesRepository =
    options.categoriesRepository ??
    new DrizzleCategoriesRepository(getDefaultDb());

  app.addHook('onClose', async () => {
    await defaultDb?.$client.end();
  });

  registerEventRoutes(app, eventsRepository);
  registerCategoryRoutes(app, categoriesRepository);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
