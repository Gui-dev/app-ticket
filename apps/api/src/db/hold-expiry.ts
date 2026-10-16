import { sql } from 'drizzle-orm';

import type { Db } from './client.js';

export async function expireExpiredHolds(db: Db): Promise<number> {
  const result = await db.execute(sql`
    update seats
    set status = 'available', hold_user_id = null, hold_expires_at = null
    where status = 'reserved' and hold_expires_at <= now()
  `);
  return result.rowCount ?? 0;
}
