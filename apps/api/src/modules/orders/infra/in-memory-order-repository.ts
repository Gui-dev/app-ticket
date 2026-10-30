import { randomUUID } from 'node:crypto';

import type { TransferStatus } from '@ticketvibe/shared';
import type {
  OrderRecord,
  OrderSummaryRecord,
} from '../domain/order-entity.js';
import type {
  CreateOrderInput,
  OrderRepository,
  StaleOrderRef,
} from '../domain/order-repository.js';

interface InMemoryOrderRepositoryOptions {
  eventSlugs: Map<string, string>;
  now?: () => Date;
  initialOrders?: OrderRecord[];
}

const clone = (order: OrderRecord): OrderRecord => ({
  ...order,
  items: order.items.map((item) => ({ ...item })),
});

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, OrderRecord>();
  private readonly eventSlugs: Map<string, string>;
  private readonly now: () => Date;

  constructor(options: InMemoryOrderRepositoryOptions) {
    this.eventSlugs = options.eventSlugs;
    this.now = options.now ?? (() => new Date());
    for (const order of options.initialOrders ?? []) {
      this.orders.set(order.id, clone(order));
    }
  }

  async create(input: CreateOrderInput): Promise<OrderRecord> {
    const order: OrderRecord = {
      id: randomUUID(),
      userId: input.userId,
      eventId: input.eventId,
      eventSlug: this.eventSlugs.get(input.eventId) ?? '',
      status: 'pending',
      paymentMethod: input.paymentMethod,
      provider: input.provider,
      providerRef: null,
      buyerEmail: input.buyerEmail,
      subtotalCents: input.subtotalCents,
      serviceFeeCents: input.serviceFeeCents,
      totalCents: input.totalCents,
      refundCents: null,
      transferStatus: 'none',
      transferRef: null,
      createdAt: this.now(),
      paidAt: null,
      items: input.items.map((item) => ({ ...item })),
    };
    this.orders.set(order.id, order);
    return clone(order);
  }

  async findById(id: string): Promise<OrderRecord | null> {
    const order = this.orders.get(id);
    return order ? clone(order) : null;
  }

  async listByUser(input: {
    userId: string;
    limit: number;
  }): Promise<OrderSummaryRecord[]> {
    return [...this.orders.values()]
      .filter((order) => order.userId === input.userId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .slice(0, input.limit)
      .map((order) => ({
        id: order.id,
        eventSlug: order.eventSlug,
        status: order.status,
        subtotalCents: order.subtotalCents,
        serviceFeeCents: order.serviceFeeCents,
        totalCents: order.totalCents,
        itemCount: order.items.length,
        createdAt: order.createdAt,
      }));
  }

  async findPendingByUserEvent(input: {
    userId: string;
    eventId: string;
  }): Promise<OrderRecord | null> {
    for (const order of this.orders.values()) {
      if (
        order.status === 'pending' &&
        order.userId === input.userId &&
        order.eventId === input.eventId
      ) {
        return clone(order);
      }
    }
    return null;
  }

  async findByProviderRef(providerRef: string): Promise<OrderRecord | null> {
    for (const order of this.orders.values()) {
      if (order.providerRef === providerRef) {
        return clone(order);
      }
    }
    return null;
  }

  async setProviderRef(input: {
    orderId: string;
    providerRef: string;
  }): Promise<void> {
    const order = this.orders.get(input.orderId);
    if (order) {
      order.providerRef = input.providerRef;
    }
  }

  async setTransfer(input: {
    orderId: string;
    status: TransferStatus;
    transferRef?: string;
  }): Promise<void> {
    const order = this.orders.get(input.orderId);
    if (!order) return;
    order.transferStatus = input.status;
    if (input.transferRef !== undefined) {
      order.transferRef = input.transferRef;
    }
  }

  async markFailed(input: { orderId: string; now: Date }): Promise<void> {
    this.terminalize(input.orderId, 'failed');
  }

  async markExpired(input: { orderId: string; now: Date }): Promise<void> {
    this.terminalize(input.orderId, 'expired');
  }

  async listStalePending(input: {
    now: Date;
    olderThan: Date;
  }): Promise<StaleOrderRef[]> {
    const stale: StaleOrderRef[] = [];
    for (const order of this.orders.values()) {
      if (
        order.status === 'pending' &&
        order.createdAt.getTime() < input.olderThan.getTime()
      ) {
        stale.push({
          orderId: order.id,
          userId: order.userId,
          eventId: order.eventId,
        });
      }
    }
    return stale;
  }

  private terminalize(orderId: string, status: 'failed' | 'expired'): void {
    const order = this.orders.get(orderId);
    if (order?.status !== 'pending') return;
    order.status = status;
  }
}
