import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from './client.js';
import { expireExpiredHolds } from './hold-expiry.js';
import { seedFixtures } from './seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from './test-helpers.js';

describe('expireExpiredHolds (postgres integration)', () => {
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  it('frees expired reserved seats and keeps active ones', async () => {
    const rows = await testDb.execute<{ id: string }>(sql`
      select sr.id from seat_rows sr
      join sectors s on s.id = sr.sector_id
      join events e on e.id = s.event_id
      where e.slug = 'o-fantasma-da-opera' and sr.label = 'A'
      limit 1
    `);
    const rowA = rows.rows[0];
    expect(rowA).toBeDefined();
    await testDb.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-expired', hold_expires_at = now() - interval '1 second'
      where row_id = ${rowA.id} and label = '1'
    `);
    await testDb.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-active', hold_expires_at = now() + interval '5 minutes'
      where row_id = ${rowA.id} and label = '2'
    `);

    const freed = await expireExpiredHolds(testDb);
    expect(freed).toBe(1);

    const statuses = await testDb.execute<{
      label: string;
      status: string;
      hold_user_id: string | null;
    }>(sql`
      select label, status, hold_user_id from seats where row_id = ${rowA.id} and label in ('1', '2') order by label
    `);
    expect(statuses.rows).toEqual([
      { label: '1', status: 'available', hold_user_id: null },
      { label: '2', status: 'reserved', hold_user_id: 'user-active' },
    ]);
  });
});
