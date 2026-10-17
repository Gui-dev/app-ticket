import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import {
  createExpireSeatHoldsJob,
  SEAT_HOLD_QUEUE_NAME,
} from './expire-seat-holds.js';

describe('expire seat holds job', () => {
  let db: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    db = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(db);
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await seedFixtures(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it('exposes the queue name and runs the shared expiry', async () => {
    expect(SEAT_HOLD_QUEUE_NAME).toBe('seat-hold-expiry');

    const rows = await db.execute<{ id: string }>(sql`
      select sr.id from seat_rows sr
      join sectors s on s.id = sr.sector_id
      join events e on e.id = s.event_id
      where e.slug = 'o-fantasma-da-opera' and sr.label = 'A'
      limit 1
    `);
    const rowA = rows.rows[0];
    expect(rowA).toBeDefined();
    await db.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-expired', hold_expires_at = now() - interval '1 second'
      where row_id = ${rowA.id} and label = '1'
    `);

    const job = createExpireSeatHoldsJob(db);
    await expect(job()).resolves.toBe(1);
    expect(await expireExpiredHolds(db)).toBe(0);
  });
});
