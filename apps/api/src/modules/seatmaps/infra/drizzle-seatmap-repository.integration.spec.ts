import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import {
  categories,
  events,
  priceLots,
  seatRows,
  seats,
  sectors,
  venues,
} from '../../../db/schema.js';
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

  it('confere existência de evento pelo slug', async () => {
    expect(await repository.existsBySlug(EVENT_SLUG)).toBe(true);
    expect(await repository.existsBySlug('evento-inexistente')).toBe(false);
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

describe('DrizzleSeatmapRepository preço efetivo (postgres integration)', () => {
  const EVENT_SLUG_LOTS = 'show-lote-vigente';
  const HOUR = 3_600_000;

  let testDb: Db;
  let repository: DrizzleSeatmapRepository;
  let pistaSectorId: string;
  let pistaRowId: string;

  async function seedEventWithLots() {
    const [category] = await testDb
      .insert(categories)
      .values({ slug: 'shows', name: 'Shows' })
      .returning();
    const [venue] = await testDb
      .insert(venues)
      .values({ slug: 'arena-sp', name: 'Arena SP', city: 'SP', state: 'SP' })
      .returning();
    const [event] = await testDb
      .insert(events)
      .values({
        slug: EVENT_SLUG_LOTS,
        title: 'Show Lote Vigente',
        description: 'Descrição longa o suficiente para o evento fixture.',
        categoryId: category.id,
        venueId: venue.id,
        organizerId: null,
        startsAt: new Date(Date.now() + 7 * 24 * HOUR),
        priceFromCents: 0,
      })
      .returning();

    const [pista] = await testDb
      .insert(sectors)
      .values({
        eventId: event.id,
        slug: 'pista',
        name: 'Pista',
        priceFromCents: 10000,
      })
      .returning();
    pistaSectorId = pista.id;
    await testDb.insert(sectors).values({
      eventId: event.id,
      slug: 'camarote',
      name: 'Camarote',
      priceFromCents: 11000,
    });

    const [row] = await testDb
      .insert(seatRows)
      .values({ sectorId: pista.id, label: 'A', position: 1 })
      .returning();
    pistaRowId = row.id;
    await testDb
      .insert(seats)
      .values({ rowId: row.id, label: '1', position: 1 });

    await testDb.insert(priceLots).values([
      {
        sectorId: pista.id,
        name: 'Lote Passado',
        priceCents: 8000,
        startsAt: new Date(Date.now() - 48 * HOUR),
        endsAt: new Date(Date.now() - 24 * HOUR),
      },
      {
        sectorId: pista.id,
        name: 'Lote Ativo',
        priceCents: 12000,
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 24 * HOUR),
      },
      {
        sectorId: pista.id,
        name: 'Lote Futuro',
        priceCents: 15000,
        startsAt: new Date(Date.now() + 48 * HOUR),
        endsAt: new Date(Date.now() + 72 * HOUR),
      },
    ]);
  }

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    repository = new DrizzleSeatmapRepository(
      testDb,
      new InMemorySeatAvailabilityBroker(),
    );
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedEventWithLots();
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  it('getSeatmap traz o preço do lote em vigência e ordena pelo preço efetivo', async () => {
    const seatmap = await repository.findSeatmap(EVENT_SLUG_LOTS);
    expect(seatmap).not.toBeNull();
    if (!seatmap) return;
    expect(
      seatmap.sectors.map((sector) => ({
        slug: sector.slug,
        priceFromCents: sector.priceFromCents,
      })),
    ).toEqual([
      { slug: 'camarote', priceFromCents: 11000 },
      { slug: 'pista', priceFromCents: 12000 },
    ]);
  });

  it('lote passado e lote futuro não contam como vigência', async () => {
    await testDb
      .delete(priceLots)
      .where(
        and(
          eq(priceLots.sectorId, pistaSectorId),
          eq(priceLots.name, 'Lote Ativo'),
        ),
      );

    const seatmap = await repository.findSeatmap(EVENT_SLUG_LOTS);
    const pista = seatmap?.sectors.find((sector) => sector.slug === 'pista');
    expect(pista?.priceFromCents).toBe(10000);
  });

  it('hold por coordenadas traz o preço vigente', async () => {
    const lookup = await repository.findSeatByCoords({
      eventSlug: EVENT_SLUG_LOTS,
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.seat.priceFromCents).toBe(12000);
  });

  it('carrinho traz o preço vigente do assento reservado', async () => {
    await testDb
      .update(seats)
      .set({
        status: 'reserved',
        holdUserId: 'user-carrinho',
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .where(eq(seats.rowId, pistaRowId));

    const holds = await repository.findHoldsByUser({
      eventSlug: EVENT_SLUG_LOTS,
      userId: 'user-carrinho',
    });
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
      priceFromCents: 12000,
    });
  });

  it('removido o lote ativo, o setor volta ao preço base', async () => {
    const [activeLot] = await testDb
      .select({ id: priceLots.id })
      .from(priceLots)
      .where(
        and(
          eq(priceLots.sectorId, pistaSectorId),
          eq(priceLots.name, 'Lote Ativo'),
        ),
      );
    await testDb.delete(priceLots).where(eq(priceLots.id, activeLot.id));

    const seatmap = await repository.findSeatmap(EVENT_SLUG_LOTS);
    const pista = seatmap?.sectors.find((sector) => sector.slug === 'pista');
    expect(pista?.priceFromCents).toBe(10000);
    expect(seatmap?.sectors.map((sector) => sector.slug)).toEqual([
      'pista',
      'camarote',
    ]);

    const lookup = await repository.findSeatByCoords({
      eventSlug: EVENT_SLUG_LOTS,
      sectorSlug: 'pista',
      rowLabel: 'A',
      seatLabel: '1',
    });
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.seat.priceFromCents).toBe(10000);
  });
});
