import { SEAT_HOLD_TTL_SECONDS } from '@ticketvibe/shared';

import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { releaseOrderSeatsAndClearCart } from './release-order-seats-and-clear-cart.js';

export class ExpirePendingOrdersUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly seatCaptureGateway: SeatCaptureGateway,
    private readonly holdRepository: HoldRepository,
    private readonly cartRepository: CartRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<{ expired: number }> {
    const now = this.now();
    const olderThan = new Date(now.getTime() - SEAT_HOLD_TTL_SECONDS * 1000);
    const stale = await this.orderRepository.listStalePending({
      now,
      olderThan,
    });

    for (const ref of stale) {
      await this.orderRepository.markExpired({ orderId: ref.orderId, now });
      const order = await this.orderRepository.findById(ref.orderId);
      if (order) {
        await releaseOrderSeatsAndClearCart({
          seatCaptureGateway: this.seatCaptureGateway,
          holdRepository: this.holdRepository,
          cartRepository: this.cartRepository,
          order: {
            orderId: ref.orderId,
            userId: ref.userId,
            eventSlug: order.eventSlug,
          },
          now,
        });
      }
    }

    return { expired: stale.length };
  }
}
