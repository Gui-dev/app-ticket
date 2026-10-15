import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from './client.js';
import {
  artists,
  eventArtists,
  events,
  seatRows,
  seats,
  sectors,
} from './schema.js';
import { seedFixtures } from './seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from './test-helpers.js';

describe('seedFixtures (postgres integration)', () => {
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

  it('seeds artists linked to their events', async () => {
    const artistRows = await testDb.select().from(artists);
    expect(artistRows.map((row) => row.slug).sort()).toEqual([
      'andrew-lloyd-webber',
      'comediantes-afiados',
    ]);

    const linkRows = await testDb
      .select({
        artistSlug: artists.slug,
        eventSlug:
          sql`(select slug from events where events.id = ${eventArtists.eventId})`.as(
            'event_slug',
          ),
      })
      .from(eventArtists)
      .innerJoin(artists, sql`${eventArtists.artistId} = ${artists.id}`);

    const links = linkRows.map((row) => `${row.artistSlug}:${row.eventSlug}`);
    expect(links.sort()).toEqual([
      'andrew-lloyd-webber:o-fantasma-da-opera',
      'comediantes-afiados:melhor-de-standup-grand-finale',
      'comediantes-afiados:standup-noite-de-verdades',
    ]);
  });

  async function findSectorId(
    db: Db,
    eventSlug: string,
    sectorSlug: string,
  ): Promise<string> {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.slug, eventSlug))
      .limit(1);
    if (!event) throw new Error(`missing event ${eventSlug}`);
    const [sector] = await db
      .select()
      .from(sectors)
      .where(and(eq(sectors.eventId, event.id), eq(sectors.slug, sectorSlug)))
      .limit(1);
    if (!sector) throw new Error(`missing sector ${sectorSlug}`);
    return sector.id;
  }

  async function seatStatus(
    db: Db,
    sectorId: string,
    rowLabel: string,
    seatLabel: string,
  ): Promise<string> {
    const [row] = await db
      .select()
      .from(seatRows)
      .where(
        and(eq(seatRows.sectorId, sectorId), eq(seatRows.label, rowLabel)),
      );
    const [seat] = await db
      .select()
      .from(seats)
      .where(and(eq(seats.rowId, row.id), eq(seats.label, seatLabel)));
    return seat.status;
  }

  it('seeds seat rows and seats for seated sectors', async () => {
    const allRows = await testDb.select().from(seatRows);
    const allSeats = await testDb.select().from(seats);
    expect(allRows).toHaveLength(69);
    expect(allSeats).toHaveLength(800);

    const plateiaId = await findSectorId(
      testDb,
      'o-fantasma-da-opera',
      'plateia',
    );
    const plateiaRows = await testDb
      .select()
      .from(seatRows)
      .where(eq(seatRows.sectorId, plateiaId))
      .orderBy(asc(seatRows.position));
    expect(plateiaRows.map((row) => row.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
    ]);
  });

  it('applies occupied and unavailable seat marks', async () => {
    const plateiaId = await findSectorId(
      testDb,
      'o-fantasma-da-opera',
      'plateia',
    );
    const balcaoId = await findSectorId(
      testDb,
      'o-fantasma-da-opera',
      'balcao',
    );
    expect(await seatStatus(testDb, plateiaId, 'A', '6')).toBe('available');
    expect(await seatStatus(testDb, plateiaId, 'B', '7')).toBe('occupied');
    expect(await seatStatus(testDb, plateiaId, 'H', '12')).toBe('unavailable');
    expect(await seatStatus(testDb, balcaoId, 'A', '5')).toBe('occupied');
  });

  it('keeps standing sectors without rows', async () => {
    const [corrida] = await testDb
      .select()
      .from(events)
      .where(eq(events.slug, 'corrida-de-rua-sp'))
      .limit(1);
    const corridaSectors = await testDb
      .select()
      .from(sectors)
      .where(eq(sectors.eventId, corrida.id));
    const rows = await testDb
      .select()
      .from(seatRows)
      .where(
        inArray(
          seatRows.sectorId,
          corridaSectors.map((sector) => sector.id),
        ),
      );
    expect(rows).toHaveLength(0);
  });
});
