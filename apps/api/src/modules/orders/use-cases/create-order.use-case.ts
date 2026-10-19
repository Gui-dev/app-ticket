import {
  orderTotals,
  type PaymentMethod,
  SEAT_HOLD_TTL_SECONDS,
} from '@ticketvibe/shared';

import type {
  CreatePaymentResult,
  PaymentProvider,
} from '../../payments/domain/payment-provider.js';
import type { CartRepository } from '../../seatmaps/domain/cart-repository.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type { HoldRepository } from '../../seatmaps/domain/hold-repository.js';
import type { SeatmapRepository } from '../../seatmaps/domain/seatmap-repository.js';
import type { GetCartUseCase } from '../../seatmaps/use-cases/get-cart.use-case.js';
import {
  type OrderItemRecord,
  type OrderRecord,
  orderMatchesItems,
} from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { SeatCaptureGateway } from '../domain/seat-capture-gateway.js';
import { releaseOrderSeatsAndClearCart } from './release-order-seats-and-clear-cart.js';

export type CreateOrderResult =
  | {
      kind: 'created';
      order: OrderRecord;
      payment: {
        provider: string;
        providerRef: string | null;
        clientSecret: string | null;
      };
    }
  | { kind: 'event_not_found' }
  | { kind: 'empty_cart' }
  | {
      kind: 'seat_unavailable';
      seat: { sectorSlug: string; rowLabel: string; seatLabel: string };
    }
  | { kind: 'payment_failed' };

export class CreateOrderUseCase {
  constructor(
    private readonly getCart: GetCartUseCase,
    private readonly seatmapRepository: SeatmapRepository,
    private readonly holdRepository: HoldRepository,
    private readonly orderRepository: OrderRepository,
    private readonly paymentProvider: PaymentProvider,
    private readonly seatCaptureGateway: SeatCaptureGateway,
    private readonly cartRepository: CartRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    userId: string;
    eventSlug: string;
    paymentMethod: PaymentMethod;
    buyerEmail: string | null;
  }): Promise<CreateOrderResult> {
    const cart = await this.getCart.execute(input.userId, input.eventSlug);
    if (cart.kind === 'event_not_found') return { kind: 'event_not_found' };

    const items: OrderItemRecord[] = [];
    let eventId: string | null = null;
    for (const item of cart.cart.items) {
      const lookup = await this.seatmapRepository.findSeatByCoords({
        eventSlug: input.eventSlug,
        sectorSlug: item.sectorSlug,
        rowLabel: item.rowLabel,
        seatLabel: item.seatLabel,
      });
      if (!lookup.found) {
        return {
          kind: 'seat_unavailable',
          seat: {
            sectorSlug: item.sectorSlug,
            rowLabel: item.rowLabel,
            seatLabel: item.seatLabel,
          },
        };
      }
      eventId ??= lookup.seat.eventId;
      items.push({
        seatId: lookup.seat.seatId,
        rowId: lookup.seat.rowId,
        sectorSlug: lookup.seat.sectorSlug,
        rowLabel: lookup.seat.rowLabel,
        seatLabel: lookup.seat.seatLabel,
        ticketType: item.ticketType,
        priceCents: item.priceCents,
      });
    }
    if (eventId === null) return { kind: 'empty_cart' };

    const totals = orderTotals(items);
    const existing = await this.orderRepository.findPendingByUserEvent({
      userId: input.userId,
      eventId,
    });
    if (existing) {
      if (existing.providerRef && orderMatchesItems(existing, items)) {
        return this.reusePendingOrder(existing);
      }
      await this.orderRepository.markFailed({
        orderId: existing.id,
        now: this.now(),
      });
    }

    let order: OrderRecord;
    try {
      order = await this.orderRepository.create({
        userId: input.userId,
        eventId,
        paymentMethod: input.paymentMethod,
        provider: this.paymentProvider.providerName,
        subtotalCents: totals.subtotalCents,
        serviceFeeCents: totals.serviceFeeCents,
        totalCents: totals.totalCents,
        items,
      });
    } catch (error) {
      const concurrent = await this.orderRepository.findPendingByUserEvent({
        userId: input.userId,
        eventId,
      });
      if (!concurrent) throw error;
      return this.reusePendingOrder(concurrent);
    }

    const expiresAt = new Date(
      this.now().getTime() + SEAT_HOLD_TTL_SECONDS * 1000,
    );
    for (const item of items) {
      const renewed = await this.holdRepository.renew(
        holdSeatKey(eventId, item.rowId, item.seatId),
        input.userId,
        SEAT_HOLD_TTL_SECONDS,
      );
      const mirrored = renewed
        ? await this.seatmapRepository.renewSeatHold({
            seatId: item.seatId,
            userId: input.userId,
            expiresAt,
          })
        : false;
      if (!renewed || !mirrored) {
        await this.abandonOrder(order);
        return {
          kind: 'seat_unavailable',
          seat: {
            sectorSlug: item.sectorSlug,
            rowLabel: item.rowLabel,
            seatLabel: item.seatLabel,
          },
        };
      }
    }

    return this.charge(order, input);
  }

  private async reusePendingOrder(
    order: OrderRecord,
  ): Promise<CreateOrderResult> {
    const clientSecret = order.providerRef
      ? await this.clientSecretFor(order.providerRef)
      : null;
    return {
      kind: 'created',
      order,
      payment: {
        provider: order.provider,
        providerRef: order.providerRef,
        clientSecret,
      },
    };
  }

  private async abandonOrder(order: OrderRecord): Promise<void> {
    const now = this.now();
    await this.orderRepository.markFailed({ orderId: order.id, now });
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
  }

  private async clientSecretFor(providerRef: string): Promise<string | null> {
    try {
      return await this.paymentProvider.retrieveClientSecret(providerRef);
    } catch {
      return null;
    }
  }

  private async charge(
    order: OrderRecord,
    input: { paymentMethod: PaymentMethod; buyerEmail: string | null },
  ): Promise<CreateOrderResult> {
    let payment: CreatePaymentResult;
    try {
      payment = await this.paymentProvider.createPayment({
        orderId: order.id,
        amountCents: order.totalCents,
        method: input.paymentMethod,
        description: `Pedido ${order.id}`,
        buyerEmail: input.buyerEmail,
      });
    } catch {
      await this.orderRepository.markFailed({
        orderId: order.id,
        now: this.now(),
      });
      return { kind: 'payment_failed' };
    }

    await this.orderRepository.setProviderRef({
      orderId: order.id,
      providerRef: payment.providerRef,
    });

    return {
      kind: 'created',
      order: { ...order, providerRef: payment.providerRef },
      payment: {
        provider: this.paymentProvider.providerName,
        providerRef: payment.providerRef,
        clientSecret: payment.clientSecret,
      },
    };
  }
}
