import { execSync } from 'node:child_process';

export interface OrderRow {
  id: string;
  providerRef: string;
  totalCents: number;
}

function query(sql: string): string {
  return execSync(
    `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -At -c "${sql}"`,
    { encoding: 'utf8' },
  ).trim();
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
  const status = query(`select status from orders where id = '${orderId}'`);
  if (!status) {
    throw new Error(`Pedido ${orderId} não encontrado no banco de dados.`);
  }
  return status;
}
