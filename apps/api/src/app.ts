import { Queue } from 'bullmq';
import Fastify, { type FastifyInstance } from 'fastify';
import { createDb, type Db } from './db/client.js';
import type { ArtistsRepository } from './modules/artists/domain/artists-repository.js';
import { DrizzleArtistsRepository } from './modules/artists/infra/drizzle-artists-repository.js';
import { registerArtistRoutes } from './modules/artists/routes/artists.routes.js';
import { createAuth } from './modules/auth/auth.js';
import { sendEmail } from './modules/auth/email.js';
import {
  createGetSession,
  type GetSessionFn,
} from './modules/auth/get-session.js';
import { registerAuthRoutes } from './modules/auth/routes/auth.routes.js';
import type { CategoriesRepository } from './modules/categories/domain/categories-repository.js';
import { DrizzleCategoriesRepository } from './modules/categories/infra/drizzle-categories-repository.js';
import { registerCategoryRoutes } from './modules/categories/routes/categories.routes.js';
import type { EventsRepository } from './modules/events/domain/events-repository.js';
import { DrizzleEventsRepository } from './modules/events/infra/drizzle-events-repository.js';
import { registerEventRoutes } from './modules/events/routes/events.routes.js';
import type { PaymentEventRepository } from './modules/orders/domain/payment-event-repository.js';
import { DrizzlePaymentEventRepository } from './modules/orders/infra/drizzle-payment-event-repository.js';
import { createPaymentProvider } from './modules/payments/create-payment-provider.js';
import type { PaymentEventQueue } from './modules/payments/domain/payment-event-queue.js';
import type { PaymentProvider } from './modules/payments/domain/payment-provider.js';
import { BullMqPaymentEventQueue } from './modules/payments/infra/bullmq-payment-event-queue.js';
import {
  PAYMENTS_QUEUE_NAME,
  type PaymentEventJobData,
} from './modules/payments/jobs/process-payment-event.js';
import { registerWebhookRoutes } from './modules/payments/routes/webhook.routes.js';
import type { CartRepository } from './modules/seatmaps/domain/cart-repository.js';
import type { HoldRepository } from './modules/seatmaps/domain/hold-repository.js';
import type { SeatmapRepository } from './modules/seatmaps/domain/seatmap-repository.js';
import { DrizzleSeatmapRepository } from './modules/seatmaps/infra/drizzle-seatmap-repository.js';
import { RedisCartRepository } from './modules/seatmaps/infra/redis-cart-repository.js';
import { RedisHoldRepository } from './modules/seatmaps/infra/redis-hold-repository.js';
import { registerCartRoutes } from './modules/seatmaps/routes/cart.routes.js';
import { registerHoldRoutes } from './modules/seatmaps/routes/holds.routes.js';
import { registerSeatmapRoutes } from './modules/seatmaps/routes/seatmap.routes.js';
import { FindBestSeatUseCase } from './modules/seatmaps/use-cases/find-best-seat.use-case.js';
import { GetCartUseCase } from './modules/seatmaps/use-cases/get-cart.use-case.js';
import { GetSeatmapUseCase } from './modules/seatmaps/use-cases/get-seatmap.use-case.js';
import { HoldSeatUseCase } from './modules/seatmaps/use-cases/hold-seat.use-case.js';
import { ReleaseHoldUseCase } from './modules/seatmaps/use-cases/release-hold.use-case.js';
import { SetCartItemUseCase } from './modules/seatmaps/use-cases/set-cart-item.use-case.js';
import type { VenuesRepository } from './modules/venues/domain/venues-repository.js';
import { DrizzleVenuesRepository } from './modules/venues/infra/drizzle-venues-repository.js';
import { registerVenueRoutes } from './modules/venues/routes/venues.routes.js';
import { createRedis, type RedisClient } from './redis/client.js';

export function buildApp(
  options: {
    eventsRepository?: EventsRepository;
    categoriesRepository?: CategoriesRepository;
    artistsRepository?: ArtistsRepository;
    venuesRepository?: VenuesRepository;
    seatmapRepository?: SeatmapRepository;
    auth?: ReturnType<typeof createAuth>;
    holdSeat?: HoldSeatUseCase;
    releaseHold?: ReleaseHoldUseCase;
    getSession?: GetSessionFn;
    holdRepository?: HoldRepository;
    getCart?: GetCartUseCase;
    setCartItem?: SetCartItemUseCase;
    cartRepository?: CartRepository;
    paymentProvider?: PaymentProvider;
    paymentEventRepository?: PaymentEventRepository;
    paymentEventQueue?: PaymentEventQueue;
  } = {},
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      (request as { rawBody?: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

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
  const seatmapRepository =
    options.seatmapRepository ?? new DrizzleSeatmapRepository(getDefaultDb());
  const paymentProvider = options.paymentProvider ?? createPaymentProvider();
  const paymentEventRepository =
    options.paymentEventRepository ??
    new DrizzlePaymentEventRepository(getDefaultDb());

  let defaultRedis: RedisClient | null = null;
  const getRedis = (): RedisClient => {
    if (!defaultRedis) {
      defaultRedis = createRedis();
      defaultRedis.connect().catch(() => {});
    }
    return defaultRedis;
  };

  const getHoldRepository = (): HoldRepository => {
    if (options.holdRepository) return options.holdRepository;
    return new RedisHoldRepository(getRedis());
  };

  const getCartRepository = (): CartRepository => {
    if (options.cartRepository) return options.cartRepository;
    return new RedisCartRepository(getRedis());
  };

  const lazyHoldRepository: HoldRepository = {
    claim: (seatKey, userId, ttlSeconds) =>
      getHoldRepository().claim(seatKey, userId, ttlSeconds),
    renew: (seatKey, userId, ttlSeconds) =>
      getHoldRepository().renew(seatKey, userId, ttlSeconds),
    release: (seatKey, userId) => getHoldRepository().release(seatKey, userId),
    owns: (seatKey, userId) => getHoldRepository().owns(seatKey, userId),
  };

  const lazyCartRepository: CartRepository = {
    setType: (input) => getCartRepository().setType(input),
    getTypes: (input) => getCartRepository().getTypes(input),
    refreshTtl: (input) => getCartRepository().refreshTtl(input),
    clear: (input) => getCartRepository().clear(input),
  };

  let paymentsConnection: RedisClient | null = null;
  let paymentsQueue: Queue<PaymentEventJobData> | null = null;
  let lazyPaymentEventQueue: PaymentEventQueue | null = null;

  const getPaymentEventQueue = (): PaymentEventQueue => {
    if (!lazyPaymentEventQueue) {
      paymentsConnection = createRedis();
      paymentsConnection.options.maxRetriesPerRequest = null;
      paymentsConnection.connect().catch(() => {});
      paymentsQueue = new Queue<PaymentEventJobData>(PAYMENTS_QUEUE_NAME, {
        connection: paymentsConnection,
      });
      lazyPaymentEventQueue = new BullMqPaymentEventQueue(paymentsQueue);
    }
    return lazyPaymentEventQueue;
  };

  const paymentEventQueue: PaymentEventQueue = options.paymentEventQueue ?? {
    enqueue: (data) => getPaymentEventQueue().enqueue(data),
  };

  app.addHook('onClose', async () => {
    await defaultDb?.$client.end();
  });

  app.addHook('onClose', async () => {
    await defaultRedis?.quit().catch(() => {});
  });

  app.addHook('onClose', async () => {
    try {
      await paymentsQueue?.close();
    } finally {
      paymentsConnection?.disconnect();
    }
  });

  registerEventRoutes(app, eventsRepository);
  registerCategoryRoutes(app, categoriesRepository);
  registerArtistRoutes(app, artistsRepository);
  registerVenueRoutes(app, venuesRepository);

  const authInstance =
    options.auth ?? createAuth(getDefaultDb(), { sendEmail });
  registerAuthRoutes(app, authInstance);

  const getSession = options.getSession ?? createGetSession(authInstance);

  registerSeatmapRoutes(app, {
    getSeatmap: new GetSeatmapUseCase(seatmapRepository),
    findBestSeat: new FindBestSeatUseCase(seatmapRepository),
    getSession,
  });

  registerHoldRoutes(app, {
    getSession,
    holdSeat:
      options.holdSeat ??
      new HoldSeatUseCase(
        seatmapRepository,
        lazyHoldRepository,
        lazyCartRepository,
      ),
    releaseHold:
      options.releaseHold ??
      new ReleaseHoldUseCase(seatmapRepository, lazyHoldRepository),
  });

  registerCartRoutes(app, {
    getSession,
    getCart:
      options.getCart ??
      new GetCartUseCase(seatmapRepository, lazyCartRepository),
    setCartItem:
      options.setCartItem ??
      new SetCartItemUseCase(
        seatmapRepository,
        lazyHoldRepository,
        lazyCartRepository,
      ),
  });

  registerWebhookRoutes(app, {
    paymentProvider,
    paymentEventRepository,
    paymentEventQueue,
  });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
