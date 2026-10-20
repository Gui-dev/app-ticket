import { and, asc, eq, lt, type SQL } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { events, orderItems, orders } from '../../../db/schema.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type {
  CreateOrderInput,
  OrderRepository,
  StaleOrderRef,
} from '../domain/order-repository.js';

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateOrderInput): Promise<OrderRecord> {
    const orderId = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          userId: input.userId,
          eventId: input.eventId,
          paymentMethod: input.paymentMethod,
          provider: input.provider,
          buyerEmail: input.buyerEmail,
          subtotalCents: input.subtotalCents,
          serviceFeeCents: input.serviceFeeCents,
          totalCents: input.totalCents,
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        input.items.map((item) => ({
          orderId: order.id,
          seatId: item.seatId,
          rowId: item.rowId,
          sectorSlug: item.sectorSlug,
          sectorName: item.sectorName,
          rowLabel: item.rowLabel,
          seatLabel: item.seatLabel,
          ticketType: item.ticketType,
          priceCents: item.priceCents,
        })),
      );

      return order.id;
    });

    const created = await this.load(eq(orders.id, orderId));
    if (!created) {
      throw new Error(`Order ${orderId} missing after insert`);
    }
    return created;
  }

  async findById(id: string): Promise<OrderRecord | null> {
    return this.load(eq(orders.id, id));
  }

  async findPendingByUserEvent(input: {
    userId: string;
    eventId: string;
  }): Promise<OrderRecord | null> {
    return this.load(
      and(
        eq(orders.userId, input.userId),
        eq(orders.eventId, input.eventId),
        eq(orders.status, 'pending'),
      ),
    );
  }

  async findByProviderRef(providerRef: string): Promise<OrderRecord | null> {
    return this.load(eq(orders.providerRef, providerRef));
  }

  async setProviderRef(input: {
    orderId: string;
    providerRef: string;
  }): Promise<void> {
    await this.db
      .update(orders)
      .set({ providerRef: input.providerRef })
      .where(eq(orders.id, input.orderId));
  }

  async markFailed(input: { orderId: string; now: Date }): Promise<void> {
    await this.db
      .update(orders)
      .set({ status: 'failed' })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'pending')));
  }

  async markExpired(input: { orderId: string; now: Date }): Promise<void> {
    await this.db
      .update(orders)
      .set({ status: 'expired' })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'pending')));
  }

  async listStalePending(input: {
    now: Date;
    olderThan: Date;
  }): Promise<StaleOrderRef[]> {
    return this.db
      .select({
        orderId: orders.id,
        userId: orders.userId,
        eventId: orders.eventId,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'pending'),
          lt(orders.createdAt, input.olderThan),
        ),
      );
  }

  private async load(condition: SQL | undefined): Promise<OrderRecord | null> {
    const [order] = await this.db
      .select({
        id: orders.id,
        userId: orders.userId,
        eventId: orders.eventId,
        eventSlug: events.slug,
        status: orders.status,
        paymentMethod: orders.paymentMethod,
        provider: orders.provider,
        providerRef: orders.providerRef,
        buyerEmail: orders.buyerEmail,
        subtotalCents: orders.subtotalCents,
        serviceFeeCents: orders.serviceFeeCents,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
      })
      .from(orders)
      .innerJoin(events, eq(events.id, orders.eventId))
      .where(condition)
      .limit(1);
    if (!order) return null;

    const items = await this.db
      .select({
        seatId: orderItems.seatId,
        rowId: orderItems.rowId,
        sectorSlug: orderItems.sectorSlug,
        sectorName: orderItems.sectorName,
        rowLabel: orderItems.rowLabel,
        seatLabel: orderItems.seatLabel,
        ticketType: orderItems.ticketType,
        priceCents: orderItems.priceCents,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.seatLabel));

    return { ...order, items };
  }
}
