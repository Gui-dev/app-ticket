import { eq, inArray } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { orderItems, orders, seats } from '../../../db/schema.js';
import { holdSeatKey } from '../../seatmaps/domain/hold-entity.js';
import { decideOrderCapture } from '../domain/order-entity.js';
import type {
  ConfirmPaidResult,
  SeatCaptureGateway,
} from '../domain/seat-capture-gateway.js';

export class DrizzleSeatCaptureGateway implements SeatCaptureGateway {
  constructor(private readonly db: Db) {}

  async confirmOrderPayment(input: {
    providerRef: string;
    now: Date;
  }): Promise<ConfirmPaidResult> {
    return this.db.transaction(async (tx): Promise<ConfirmPaidResult> => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.providerRef, input.providerRef))
        .for('update');
      if (!order) return { kind: 'order_not_found' };
      if (order.status !== 'pending') {
        return { kind: 'already', status: order.status };
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
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
        decideOrderCapture({ userId: order.userId }, locked, input.now) ===
        'lost'
      ) {
        await tx
          .update(orders)
          .set({ status: 'failed' })
          .where(eq(orders.id, order.id));
        return { kind: 'seats_lost' };
      }

      await tx
        .update(seats)
        .set({ status: 'occupied', holdUserId: null, holdExpiresAt: null })
        .where(inArray(seats.id, seatIds));
      await tx
        .update(orders)
        .set({ status: 'paid', paidAt: input.now })
        .where(eq(orders.id, order.id));
      return { kind: 'paid' };
    });
  }

  async releaseOrderSeats(input: {
    orderId: string;
    now: Date;
  }): Promise<{ seatKeys: string[] }> {
    return this.db.transaction(async (tx): Promise<{ seatKeys: string[] }> => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .for('update');
      if (!order) return { seatKeys: [] };
      if (order.status !== 'pending' && order.status !== 'failed') {
        return { seatKeys: [] };
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      const seatIds = items.map((item) => item.seatId);
      if (seatIds.length === 0) return { seatKeys: [] };

      const locked = await tx
        .select()
        .from(seats)
        .where(inArray(seats.id, seatIds))
        .for('update');
      const lockedById = new Map(locked.map((seat) => [seat.id, seat]));

      const seatKeys: string[] = [];
      for (const item of items) {
        const seat = lockedById.get(item.seatId);
        if (seat?.status !== 'reserved' || seat.holdUserId !== order.userId) {
          continue;
        }
        await tx
          .update(seats)
          .set({ status: 'available', holdUserId: null, holdExpiresAt: null })
          .where(eq(seats.id, seat.id));
        seatKeys.push(holdSeatKey(order.eventId, item.rowId, item.seatId));
      }
      return { seatKeys };
    });
  }
}
