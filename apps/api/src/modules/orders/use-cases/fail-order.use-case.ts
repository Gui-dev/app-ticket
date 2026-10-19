import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { releaseOrderSeatsAndClearCart } from './release-order-seats-and-clear-cart.js';

export type FailOrderResult =
  | { kind: 'terminal'; status: 'failed' | 'expired' }
  | { kind: 'ignored' };

export class FailOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly seatCaptureGateway: SeatCaptureGateway,
    private readonly holdRepository: HoldRepository,
    private readonly cartRepository: CartRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    providerRef: string;
    terminal: 'failed' | 'expired';
  }): Promise<FailOrderResult> {
    const order = await this.orderRepository.findByProviderRef(
      input.providerRef,
    );
    if (order?.status !== 'pending') return { kind: 'ignored' };

    const now = this.now();
    if (input.terminal === 'failed') {
      await this.orderRepository.markFailed({ orderId: order.id, now });
    } else {
      await this.orderRepository.markExpired({ orderId: order.id, now });
    }

    await releaseOrderSeatsAndClearCart({
      seatCaptureGateway: this.seatCaptureGateway,
      holdRepository: this.holdRepository,
      cartRepository: this.cartRepository,
      order: {
        orderId: order.id,
        userId: order.userId,
        eventSlug: order.eventSlug,
      },
      now,
    });

    return { kind: 'terminal', status: input.terminal };
  }
}
