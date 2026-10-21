import type { TicketRecord } from './ticket-entity.js';

export interface TicketRepository {
  findByOrderId(orderId: string): Promise<TicketRecord[]>;
}
