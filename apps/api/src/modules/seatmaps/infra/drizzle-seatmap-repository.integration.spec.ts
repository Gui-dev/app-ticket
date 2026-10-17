import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleSeatmapRepository } from './drizzle-seatmap-repository.js';

describe('DrizzleSeatmapRepository (postgres integration)', () => {
  let testDb: Db;
  let repository: DrizzleSeatmapRepository;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    repository = new DrizzleSeatmapRepository(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  it('looks up seats by coords and finds holds by user', async () => {
    const lookup = await repository.findSeatByCoords({
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
    });
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.seat.status).toBe('available');
    expect(lookup.seat.priceFromCents).toBe(12000);

    expect(
      (
        await repository.findSeatByCoords({
          eventSlug: 'inexistente',
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
        })
      ).found,
    ).toBe(false);
    expect(
      (
        await repository.findSeatByCoords({
          eventSlug: 'o-fantasma-da-opera',
          sectorSlug: 'nao-existe',
          rowLabel: 'A',
          seatLabel: '6',
        })
      ).found,
    ).toBe(false);
    expect(
      await repository.findSeatByCoords({
        eventSlug: 'o-fantasma-da-opera',
        sectorSlug: 'plateia',
        rowLabel: 'Z',
        seatLabel: '6',
      }),
    ).toEqual({ found: false, scope: 'seat' });

    await testDb.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-holds', hold_expires_at = now() + interval '5 minutes'
      where row_id = ${lookup.seat.rowId} and label = '6'
    `);
    const holds = await repository.findHoldsByUser({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-holds',
    });
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      priceFromCents: 12000,
    });

    await testDb.execute(sql`
      update seats set status = 'reserved', hold_user_id = 'user-expired', hold_expires_at = now() - interval '1 second'
      where row_id = ${lookup.seat.rowId} and label = '5'
    `);
    const expiredHolds = await repository.findHoldsByUser({
      eventSlug: 'o-fantasma-da-opera',
      userId: 'user-expired',
    });
    expect(expiredHolds).toEqual([]);
  });
});
