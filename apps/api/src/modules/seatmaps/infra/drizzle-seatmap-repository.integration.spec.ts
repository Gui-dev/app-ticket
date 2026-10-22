import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import { events, seatRows, seats, sectors } from '../../../db/schema.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleSeatmapRepository } from './drizzle-seatmap-repository.js';
import { InMemorySeatAvailabilityBroker } from './in-memory-seat-availability-broker.js';

const EVENT_SLUG = 'o-fantasma-da-opera';

describe('DrizzleSeatmapRepository (postgres integration)', () => {
  let testDb: Db;
  let repository: DrizzleSeatmapRepository;
  let broker: InMemorySeatAvailabilityBroker;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    broker = new InMemorySeatAvailabilityBroker();
    repository = new DrizzleSeatmapRepository(testDb, broker);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
    broker.published.length = 0;
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  const findSeatId = async (seatLabel: string) => {
    const [seat] = await testDb
      .select({ seatId: seats.id })
      .from(seats)
      .innerJoin(seatRows, eq(seatRows.id, seats.rowId))
      .innerJoin(sectors, eq(sectors.id, seatRows.sectorId))
      .innerJoin(events, eq(events.id, sectors.eventId))
      .where(
        and(
          eq(events.slug, EVENT_SLUG),
          eq(sectors.slug, 'plateia'),
          eq(seatRows.label, 'A'),
          eq(seats.label, seatLabel),
        ),
      );
    if (!seat) throw new Error(`assento A-${seatLabel} não encontrado`);
    return seat.seatId;
  };

  it('publica occupied ao reservar um assento', async () => {
    const seatId = await findSeatId('6');

    const reserved = await repository.reserveSeat({
      seatId,
      userId: 'user-a',
      expiresAt: new Date('2026-10-18T12:05:00.000Z'),
    });

    expect(reserved).toBe(true);
    expect(broker.published).toEqual([
      {
        eventSlug: EVENT_SLUG,
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        status: 'occupied',
      },
    ]);
  });

  it('não publica nada ao renovar hold', async () => {
    const seatId = await findSeatId('6');
    await repository.reserveSeat({
      seatId,
      userId: 'user-a',
      expiresAt: new Date('2026-10-18T12:05:00.000Z'),
    });
    broker.published.length = 0;

    const renewed = await repository.renewSeatHold({
      seatId,
      userId: 'user-a',
      expiresAt: new Date('2026-10-18T12:10:00.000Z'),
    });

    expect(renewed).toBe(true);
    expect(broker.published.length).toBe(0);
  });

  it('publica available ao liberar', async () => {
    const seatId = await findSeatId('6');
    await repository.reserveSeat({
      seatId,
      userId: 'user-a',
      expiresAt: new Date('2026-10-18T12:05:00.000Z'),
    });
    broker.published.length = 0;

    await repository.releaseSeat({ seatId, userId: 'user-a' });

    expect(broker.published).toEqual([
      {
        eventSlug: EVENT_SLUG,
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        status: 'available',
      },
    ]);
  });

  it('sweep publica available só dos assentos expirados', async () => {
    const expiredSeatId = await findSeatId('6');
    const validSeatId = await findSeatId('7');
    await testDb
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: 'user-a',
        holdExpiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(seats.id, expiredSeatId));
    await testDb
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: 'user-a',
        holdExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(seats.id, validSeatId));

    const expired = await expireExpiredHolds(testDb);

    expect(expired).toEqual([
      {
        seatId: expiredSeatId,
        eventSlug: EVENT_SLUG,
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
      },
    ]);
    expect(broker.published).toEqual([]);

    await testDb
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: 'user-a',
        holdExpiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(seats.id, expiredSeatId));
    await repository.expireHolds();

    const kept = await testDb
      .select({ status: seats.status })
      .from(seats)
      .where(eq(seats.id, validSeatId));
    expect(kept[0]).toMatchObject({ status: 'reserved' });
    expect(broker.published).toEqual([
      {
        eventSlug: EVENT_SLUG,
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        status: 'available',
      },
    ]);
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
