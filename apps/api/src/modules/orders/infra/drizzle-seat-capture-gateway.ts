import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import {
  events,
  orderItems,
  orders,
  seats,
  tickets,
} from '../../../db/schema.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import type {
  SeatAvailabilityBroker,
  SeatStatusDelta,
} from '../../seatmaps/domain/seat-availability-broker.js';
import { decideOrderCapture } from '../domain/order-entity.js';
import type {
  CancelPaidResult,
  ConfirmPaidResult,
  SeatCaptureGateway,
} from '../domain/seat-capture-gateway.js';
import { generateTicketCode } from '../domain/ticket-entity.js';

type PaidTransactionResult = ConfirmPaidResult & { deltas: SeatStatusDelta[] };
type ReleaseTransactionResult = {
  seatKeys: string[];
  deltas: SeatStatusDelta[];
};
type CancelTransactionResult = { deltas: SeatStatusDelta[] } & CancelPaidResult;

const itemDelta = (
  order: { eventSlug: string },
  item: {
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
  },
  status: SeatStatusDelta['status'],
): SeatStatusDelta => ({
  eventSlug: order.eventSlug,
  sectorSlug: item.sectorSlug,
  rowLabel: item.rowLabel,
  seatLabel: item.seatLabel,
  status,
});

export class DrizzleSeatCaptureGateway implements SeatCaptureGateway {
  constructor(
    private readonly db: Db,
    private readonly broker: SeatAvailabilityBroker,
  ) {}

  async confirmOrderPayment(input: {
    providerRef: string;
    now: Date;
  }): Promise<ConfirmPaidResult> {
    const result = (await this.db.transaction(
      async (tx): Promise<PaidTransactionResult> => {
        const [order] = await tx
          .select({ order: orders, eventSlug: events.slug })
          .from(orders)
          .innerJoin(events, eq(events.id, orders.eventId))
          .where(eq(orders.providerRef, input.providerRef))
          .for('update');
        if (!order) return { kind: 'order_not_found', deltas: [] };
        if (order.order.status !== 'pending') {
          return { kind: 'already', status: order.order.status, deltas: [] };
        }

        const orderRecord = order.order;
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRecord.id));
        const seatIds = items.map((item) => item.seatId);
        const locked = seatIds.length
          ? await tx
              .select({
                seatId: seats.id,
                status: seats.status,
                holdUserId: seats.holdUserId,
                holdExpiresAt: seats.holdExpiresAt,
              })
              .from(seats)
              .where(inArray(seats.id, seatIds))
              .for('update')
          : [];

        if (
          decideOrderCapture(
            { userId: orderRecord.userId },
            locked,
            input.now,
          ) === 'lost'
        ) {
          await tx
            .update(orders)
            .set({ status: 'failed' })
            .where(eq(orders.id, orderRecord.id));
          return { kind: 'seats_lost', deltas: [] };
        }

        await tx
          .update(seats)
          .set({ status: 'occupied', holdUserId: null, holdExpiresAt: null })
          .where(inArray(seats.id, seatIds));
        await tx
          .update(orders)
          .set({ status: 'paid', paidAt: input.now })
          .where(eq(orders.id, orderRecord.id));
        await tx.insert(tickets).values(
          items.map((item) => ({
            orderId: orderRecord.id,
            orderItemId: item.id,
            seatId: item.seatId,
            code: generateTicketCode(),
          })),
        );
        return {
          kind: 'paid',
          deltas: items.map((item) =>
            itemDelta({ eventSlug: order.eventSlug }, item, 'occupied'),
          ),
        };
      },
    )) satisfies PaidTransactionResult;

    const { deltas, ...confirmResult } = result;
    if (confirmResult.kind === 'paid' && deltas.length > 0) {
      this.broker.publish(deltas);
    }
    return confirmResult;
  }

  async cancelPaidOrder(input: {
    orderId: string;
    refundCents: number;
  }): Promise<CancelPaidResult> {
    const result = (await this.db.transaction(
      async (tx): Promise<CancelTransactionResult> => {
        const [order] = await tx
          .select({ order: orders, eventSlug: events.slug })
          .from(orders)
          .innerJoin(events, eq(events.id, orders.eventId))
          .where(eq(orders.id, input.orderId))
          .for('update');
        if (!order || order.order.status !== 'paid') {
          return { kind: 'not_paid', deltas: [] };
        }
        const orderRecord = order.order;
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRecord.id));
        const seatIds = items.map((item) => item.seatId);
        if (seatIds.length > 0) {
          await tx
            .update(seats)
            .set({ status: 'available', holdUserId: null, holdExpiresAt: null })
            .where(inArray(seats.id, seatIds));
        }
        await tx
          .update(orders)
          .set({ status: 'refunded', refundCents: input.refundCents })
          .where(and(eq(orders.id, orderRecord.id), eq(orders.status, 'paid')));
        return {
          kind: 'refunded',
          deltas: items.map((item) =>
            itemDelta({ eventSlug: order.eventSlug }, item, 'available'),
          ),
        };
      },
    )) satisfies CancelTransactionResult;

    if (result.kind === 'refunded' && result.deltas.length > 0) {
      this.broker.publish(result.deltas);
    }
    return { kind: result.kind };
  }

  async releaseOrderSeats(input: {
    orderId: string;
    now: Date;
  }): Promise<{ seatKeys: string[] }> {
    const result = (await this.db.transaction(
      async (tx): Promise<ReleaseTransactionResult> => {
        const [order] = await tx
          .select({ order: orders, eventSlug: events.slug })
          .from(orders)
          .innerJoin(events, eq(events.id, orders.eventId))
          .where(eq(orders.id, input.orderId))
          .for('update');
        if (!order) return { seatKeys: [], deltas: [] };
        if (order.order.status === 'paid') {
          return { seatKeys: [], deltas: [] };
        }

        const orderRecord = order.order;
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRecord.id))
          .orderBy(asc(orderItems.seatLabel));
        const seatIds = items.map((item) => item.seatId);
        if (seatIds.length === 0) return { seatKeys: [], deltas: [] };

        const locked = await tx
          .select()
          .from(seats)
          .where(inArray(seats.id, seatIds))
          .for('update');
        const lockedById = new Map(locked.map((seat) => [seat.id, seat]));

        const seatKeys: string[] = [];
        const deltas: SeatStatusDelta[] = [];
        for (const item of items) {
          const seat = lockedById.get(item.seatId);
          if (
            seat?.status !== 'reserved' ||
            seat.holdUserId !== orderRecord.userId
          ) {
            continue;
          }
          await tx
            .update(seats)
            .set({ status: 'available', holdUserId: null, holdExpiresAt: null })
            .where(eq(seats.id, seat.id));
          seatKeys.push(
            holdSeatKey(orderRecord.eventId, item.rowId, item.seatId),
          );
          deltas.push(
            itemDelta({ eventSlug: order.eventSlug }, item, 'available'),
          );
        }
        return { seatKeys, deltas };
      },
    )) satisfies ReleaseTransactionResult;

    if (result.deltas.length > 0) {
      this.broker.publish(result.deltas);
    }
    return { seatKeys: result.seatKeys };
  }
}
