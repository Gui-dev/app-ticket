import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';

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

    const { seatKeys } = await this.seatCaptureGateway.releaseOrderSeats({
      orderId: order.id,
      now,
    });
    for (const seatKey of seatKeys) {
      await this.holdRepository.release(seatKey, order.userId);
    }
    await this.cartRepository.clear({
      userId: order.userId,
      eventSlug: order.eventSlug,
    });

    return { kind: 'terminal', status: input.terminal };
  }
}
