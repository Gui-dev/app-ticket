import type { PaymentMethod, TransferStatus } from '@ticketvibe/shared';

import type {
  OrderItemRecord,
  OrderRecord,
  OrderSummaryRecord,
} from './order-entity.js';

export interface CreateOrderInput {
  userId: string;
  eventId: string;
  paymentMethod: PaymentMethod;
  provider: string;
  buyerEmail: string | null;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  items: OrderItemRecord[];
}

export interface StaleOrderRef {
  orderId: string;
  userId: string;
  eventId: string;
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  listByUser(input: {
    userId: string;
    limit: number;
  }): Promise<OrderSummaryRecord[]>;
  findPendingByUserEvent(input: {
    userId: string;
    eventId: string;
  }): Promise<OrderRecord | null>;
  findByProviderRef(providerRef: string): Promise<OrderRecord | null>;
  setProviderRef(input: {
    orderId: string;
    providerRef: string;
  }): Promise<void>;
  setTransfer(input: {
    orderId: string;
    status: TransferStatus;
    transferRef?: string;
  }): Promise<void>;
  markFailed(input: { orderId: string; now: Date }): Promise<void>;
  markExpired(input: { orderId: string; now: Date }): Promise<void>;
  listStalePending(input: {
    now: Date;
    olderThan: Date;
  }): Promise<StaleOrderRef[]>;
}
