import Fastify, { type FastifyInstance } from 'fastify';
import { createDb, type Db } from './db/client.js';
import type { ArtistsRepository } from './modules/artists/domain/artists-repository.js';
import { DrizzleArtistsRepository } from './modules/artists/infra/drizzle-artists-repository.js';
import { registerArtistRoutes } from './modules/artists/routes/artists.routes.js';
import type { CategoriesRepository } from './modules/categories/domain/categories-repository.js';
import { DrizzleCategoriesRepository } from './modules/categories/infra/drizzle-categories-repository.js';
import { registerCategoryRoutes } from './modules/categories/routes/categories.routes.js';
import type { EventsRepository } from './modules/events/domain/events-repository.js';
import { DrizzleEventsRepository } from './modules/events/infra/drizzle-events-repository.js';
import { registerEventRoutes } from './modules/events/routes/events.routes.js';
import type { VenuesRepository } from './modules/venues/domain/venues-repository.js';
import { DrizzleVenuesRepository } from './modules/venues/infra/drizzle-venues-repository.js';
import { registerVenueRoutes } from './modules/venues/routes/venues.routes.js';

export function buildApp(
  options: {
    eventsRepository?: EventsRepository;
    categoriesRepository?: CategoriesRepository;
    artistsRepository?: ArtistsRepository;
    venuesRepository?: VenuesRepository;
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
  const artistsRepository =
    options.artistsRepository ?? new DrizzleArtistsRepository(getDefaultDb());
  const venuesRepository =
    options.venuesRepository ?? new DrizzleVenuesRepository(getDefaultDb());

  app.addHook('onClose', async () => {
    await defaultDb?.$client.end();
  });

  registerEventRoutes(app, eventsRepository);
  registerCategoryRoutes(app, categoriesRepository);
  registerArtistRoutes(app, artistsRepository);
  registerVenueRoutes(app, venuesRepository);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
