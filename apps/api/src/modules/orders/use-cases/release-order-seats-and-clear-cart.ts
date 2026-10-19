import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';

export async function releaseOrderSeatsAndClearCart(input: {
  seatCaptureGateway: SeatCaptureGateway;
  holdRepository: HoldRepository;
  cartRepository: CartRepository;
  order: { orderId: string; userId: string; eventSlug: string };
  now: Date;
}): Promise<void> {
  const { seatKeys } = await input.seatCaptureGateway.releaseOrderSeats({
    orderId: input.order.orderId,
    now: input.now,
  });
  for (const seatKey of seatKeys) {
    await input.holdRepository.release(seatKey, input.order.userId);
  }
  await input.cartRepository.clear({
    userId: input.order.userId,
    eventSlug: input.order.eventSlug,
  });
}
