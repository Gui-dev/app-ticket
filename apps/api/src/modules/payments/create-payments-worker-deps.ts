import type { Db } from '../../db/client.js';
import type { RedisClient } from '../../redis/client.js';
import { DrizzleEventsRepository } from '../events/infra/drizzle-events-repository.js';
import { DrizzleOrderRepository } from '../orders/infra/drizzle-order-repository.js';
import { DrizzleSeatCaptureGateway } from '../orders/infra/drizzle-seat-capture-gateway.js';
import { ConfirmOrderPaymentUseCase } from '../orders/use-cases/confirm-order-payment.use-case.js';
import { ExpirePendingOrdersUseCase } from '../orders/use-cases/expire-pending-orders.use-case.js';
import { FailOrderUseCase } from '../orders/use-cases/fail-order.use-case.js';
import { RedisCartRepository } from '../seatmaps/infra/redis-cart-repository.js';
import { RedisHoldRepository } from '../seatmaps/infra/redis-hold-repository.js';
import { createRedisSeatAvailabilityBroker } from '../seatmaps/infra/redis-seat-availability-broker.js';
import { createPaymentProvider } from './create-payment-provider.js';
import { DrizzleStripeAccountStore } from './infra/drizzle-stripe-account-store.js';
import { TransferOrganizerShareUseCase } from './use-cases/transfer-organizer-share.use-case.js';

export function createPaymentsWorkerDeps(input: {
  db: Db;
  redis: RedisClient;
}): {
  confirmOrderPayment: ConfirmOrderPaymentUseCase;
  failOrder: FailOrderUseCase;
  expirePendingOrders: ExpirePendingOrdersUseCase;
  transferOrganizerShare: TransferOrganizerShareUseCase;
} {
  const orderRepository = new DrizzleOrderRepository(input.db);
  const seatCaptureGateway = new DrizzleSeatCaptureGateway(
    input.db,
    createRedisSeatAvailabilityBroker(input.redis),
  );
  const holdRepository = new RedisHoldRepository(input.redis);
  const cartRepository = new RedisCartRepository(input.redis);
  const paymentProvider = createPaymentProvider();

  return {
    confirmOrderPayment: new ConfirmOrderPaymentUseCase(
      orderRepository,
      seatCaptureGateway,
      paymentProvider,
      holdRepository,
      cartRepository,
    ),
    failOrder: new FailOrderUseCase(
      orderRepository,
      seatCaptureGateway,
      holdRepository,
      cartRepository,
    ),
    expirePendingOrders: new ExpirePendingOrdersUseCase(
      orderRepository,
      seatCaptureGateway,
      holdRepository,
      cartRepository,
    ),
    transferOrganizerShare: new TransferOrganizerShareUseCase(
      orderRepository,
      new DrizzleEventsRepository(input.db),
      paymentProvider,
      new DrizzleStripeAccountStore(input.db),
    ),
  };
}
