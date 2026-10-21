import { eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { tickets } from '../../../db/schema.js';
import type { TicketRecord } from '../domain/ticket-entity.js';
import type { TicketRepository } from '../domain/ticket-repository.js';

export class DrizzleTicketRepository implements TicketRepository {
  constructor(private readonly db: Db) {}

  async findByOrderId(orderId: string): Promise<TicketRecord[]> {
    return this.db
      .select({
        id: tickets.id,
        orderId: tickets.orderId,
        orderItemId: tickets.orderItemId,
        seatId: tickets.seatId,
        code: tickets.code,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .where(eq(tickets.orderId, orderId));
  }
}
