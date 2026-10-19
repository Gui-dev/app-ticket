import { query } from './db';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrderRow {
  id: string;
  providerRef: string;
  totalCents: number;
}

export function readLatestOrder(): OrderRow {
  const output = query(
    "select id || '|' || coalesce(provider_ref, '') || '|' || total_cents from orders order by created_at desc limit 1",
  );
  if (!output) {
    throw new Error('Nenhum pedido encontrado no banco de dados.');
  }
  const [id, providerRef, totalCents] = output.split('|');
  return { id, providerRef, totalCents: Number(totalCents) };
}

export function readOrderStatus(orderId: string): string {
  if (!UUID_PATTERN.test(orderId)) {
    throw new Error(`Identificador de pedido inválido: ${orderId}`);
  }
  const status = query(`select status from orders where id = '${orderId}'`);
  if (!status) {
    throw new Error(`Pedido ${orderId} não encontrado no banco de dados.`);
  }
  return status;
}

export function deleteOrdersByBuyer(emails: string[]): void {
  if (emails.length === 0) return;
  const list = emails.map((email) => `'${email}'`).join(', ');
  query(
    `delete from orders where user_id in (select id from "user" where email in (${list}))`,
  );
}

export function deletePaymentEvents(eventIds: string[]): void {
  if (eventIds.length === 0) return;
  const list = eventIds.map((id) => `'${id}'`).join(', ');
  query(`delete from payment_events where provider_event_id in (${list})`);
}
