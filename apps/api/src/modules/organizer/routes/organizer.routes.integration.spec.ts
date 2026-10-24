import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  categories,
  events,
  orderItems,
  orders,
  priceLots,
  seatRows,
  seats,
  sectors,
  user,
  venues,
} from '../../../db/schema.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import type { GetSessionFn, UserRole } from '../../auth/get-session.js';
import { DrizzleOrganizerRepository } from '../infra/drizzle-organizer-repository.js';

describe('organizer routes (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    if (headers['x-test-anonymous'] === 'true') {
      return { userId, email: null, isAnonymous: true, role: 'buyer' };
    }
    const [row] = await testDb
      .select({ email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, userId));
    if (!row) return null;
    return { userId, email: row.email, role: row.role as UserRole };
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);

    app = buildApp({
      getSession,
      organizerRepository: new DrizzleOrganizerRepository(testDb),
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await testDb.insert(user).values([
      { id: 'user-a', name: 'User A', email: 'user-a@example.com' },
      { id: 'user-b', name: 'User B', email: 'user-b@example.com' },
      {
        id: 'user-anon',
        name: 'Anon',
        email: 'user-anon@example.com',
        isAnonymous: true,
      },
    ]);
  });

  afterAll(async () => {
    await resetDatabase(testDb);
    await app.close();
    await testDb.$client.end();
  });

  async function promoteOrganizers(...ids: string[]) {
    for (const id of ids) {
      await testDb
        .update(user)
        .set({ role: 'organizer' })
        .where(eq(user.id, id));
    }
  }

  async function seedCatalog() {
    const [category] = await testDb
      .insert(categories)
      .values({ slug: 'shows', name: 'Shows' })
      .returning();
    const [venue] = await testDb
      .insert(venues)
      .values({
        slug: 'arena-sp',
        name: 'Arena SP',
        city: 'São Paulo',
        state: 'SP',
      })
      .returning();
    return { category, venue };
  }

  async function insertEvent(
    values: {
      slug: string;
      organizerId: string | null;
      title?: string;
      startsAt?: Date;
    },
    catalog: {
      category: { id: string };
      venue: { id: string };
    },
  ) {
    const [row] = await testDb
      .insert(events)
      .values({
        slug: values.slug,
        title: values.title ?? values.slug,
        description: 'Descrição longa o suficiente para o evento fixture.',
        categoryId: catalog.category.id,
        venueId: catalog.venue.id,
        organizerId: values.organizerId,
        startsAt: values.startsAt ?? new Date('2026-12-01T20:00:00.000Z'),
        priceFromCents: 0,
      })
      .returning();
    return row;
  }

  const CREATE_PAYLOAD = {
    title: 'Show do Organizador',
    description: 'Show com pista aberta e presença confirmada.',
    categorySlug: 'shows',
    venueSlug: 'arena-sp',
    startsAt: '2026-12-01T20:00:00.000Z',
  };

  const EDIT_PAYLOAD = {
    title: 'Show Remarcado',
    description: 'Descrição remarcada com data e local novos.',
    categorySlug: 'shows',
    venueSlug: 'arena-sp',
    startsAt: '2026-12-20T22:00:00.000Z',
  };

  it('organizador vê a própria sessão', async () => {
    await testDb
      .update(user)
      .set({ role: 'organizer' })
      .where(eq(user.id, 'user-a'));

    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: 'user-a', email: 'user-a@example.com', role: 'organizer' },
    });
  });

  it('comprador é negado com 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
      headers: { 'x-test-user-id': 'user-b' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'not_organizer' });
  });

  it('sessão anônima é negada com 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
      headers: {
        'x-test-user-id': 'user-anon',
        'x-test-anonymous': 'true',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'not_organizer' });
  });

  it('sem sessão é 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_authenticated' });
  });

  it('organizador lista próprios eventos e os da plataforma', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    await insertEvent(
      {
        slug: 'meu-show',
        organizerId: 'user-a',
        title: 'Meu Show',
        startsAt: new Date('2026-12-10T20:00:00.000Z'),
      },
      { category, venue },
    );
    await insertEvent(
      {
        slug: 'show-alheio',
        organizerId: 'user-b',
        title: 'Show Alheio',
        startsAt: new Date('2026-12-02T20:00:00.000Z'),
      },
      { category, venue },
    );
    await insertEvent(
      {
        slug: 'show-plataforma',
        organizerId: null,
        title: 'Show da Plataforma',
        startsAt: new Date('2026-12-05T20:00:00.000Z'),
      },
      { category, venue },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events.map((event: { slug: string }) => event.slug)).toEqual([
      'show-plataforma',
      'meu-show',
    ]);
    expect(
      body.events.map((event: { platform: boolean }) => event.platform),
    ).toEqual([true, false]);
  });

  it('organizador cria evento e slug único para título repetido', async () => {
    await promoteOrganizers('user-a');
    await seedCatalog();

    const first = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
      payload: CREATE_PAYLOAD,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
      payload: CREATE_PAYLOAD,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().event.slug).toBe('show-do-organizador');
    expect(second.json().event.slug).toBe('show-do-organizador-2');
    expect(first.json().event.platform).toBe(false);
    expect(first.json().event.priceFromCents).toBe(0);

    const persisted = await testDb
      .select({ slug: events.slug, organizerId: events.organizerId })
      .from(events)
      .where(eq(events.organizerId, 'user-a'));
    expect(persisted).toHaveLength(2);
    expect(persisted.map((row) => row.slug).sort()).toEqual([
      'show-do-organizador',
      'show-do-organizador-2',
    ]);

    const searchable = await testDb.execute(
      sql`select count(*)::int as total from events where organizer_id = 'user-a' and search_vector @@ websearch_to_tsquery('portuguese', unaccent(${CREATE_PAYLOAD.title}))`,
    );
    expect(searchable.rows[0]?.total).toBe(2);
  });

  it('organizador edita evento próprio', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );

    const update = await app.inject({
      method: 'PATCH',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: EDIT_PAYLOAD,
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().event.title).toBe('Show Remarcado');
    expect(update.json().event.slug).toBe('meu-show');

    const detail = await app.inject({
      method: 'GET',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().event.title).toBe('Show Remarcado');
    expect(detail.json().event.sectors).toEqual([]);

    const searchable = await testDb.execute(
      sql`select count(*)::int as total from events where id = ${event.id} and search_vector @@ websearch_to_tsquery('portuguese', unaccent(${EDIT_PAYLOAD.title}))`,
    );
    expect(searchable.rows[0]?.total).toBe(1);
  });

  it('dados da plataforma são de leitura', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'plataforma', organizerId: null, title: 'Show da Plataforma' },
      { category, venue },
    );

    const read = await app.inject({
      method: 'GET',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().event.platform).toBe(true);

    const update = await app.inject({
      method: 'PATCH',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: EDIT_PAYLOAD,
    });
    expect(update.statusCode).toBe(403);
    expect(update.json()).toEqual({ error: 'event_forbidden' });

    const remove = await app.inject({
      method: 'DELETE',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(remove.statusCode).toBe(403);
    expect(remove.json()).toEqual({ error: 'event_forbidden' });
  });

  it('outro organizador não acessa evento alheio', async () => {
    await promoteOrganizers('user-a', 'user-b');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'show-alheio', organizerId: 'user-b', title: 'Show Alheio' },
      { category, venue },
    );

    const read = await app.inject({
      method: 'GET',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(read.statusCode).toBe(403);
    expect(read.json()).toEqual({ error: 'event_forbidden' });

    const update = await app.inject({
      method: 'PATCH',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: EDIT_PAYLOAD,
    });
    expect(update.statusCode).toBe(403);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(remove.statusCode).toBe(403);
  });

  it('evento com pedidos não é excluído', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const withOrders = await insertEvent(
      { slug: 'com-pedidos', organizerId: 'user-a' },
      { category, venue },
    );
    await testDb.insert(sectors).values({
      eventId: withOrders.id,
      slug: 'pista',
      name: 'Pista',
      priceFromCents: 1000,
    });
    await testDb.insert(orders).values({
      userId: 'user-a',
      eventId: withOrders.id,
      status: 'paid',
      paymentMethod: 'card',
      provider: 'stripe',
      subtotalCents: 1000,
      serviceFeeCents: 0,
      totalCents: 1000,
    });

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/organizer/events/${withOrders.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: 'event_has_orders' });

    const [stillThere] = await testDb
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, withOrders.id));
    expect(stillThere?.id).toBe(withOrders.id);

    const clean = await insertEvent(
      {
        slug: 'limpo',
        organizerId: 'user-a',
        startsAt: new Date('2026-12-03T20:00:00.000Z'),
      },
      { category, venue },
    );
    const [sector] = await testDb
      .insert(sectors)
      .values({
        eventId: clean.id,
        slug: 'pista',
        name: 'Pista',
        priceFromCents: 1000,
      })
      .returning();
    const [row] = await testDb
      .insert(seatRows)
      .values({ sectorId: sector.id, label: 'A', position: 1 })
      .returning();
    await testDb
      .insert(seats)
      .values({ rowId: row.id, label: 'A1', position: 1 });
    await testDb.insert(priceLots).values({
      sectorId: sector.id,
      name: 'Lote Único',
      priceCents: 1000,
      startsAt: new Date('2026-11-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-20T00:00:00.000Z'),
    });

    const ok = await app.inject({
      method: 'DELETE',
      url: `/organizer/events/${clean.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });

    const remainingEvents = await testDb
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, clean.id));
    expect(remainingEvents).toHaveLength(0);

    const remainingRows = await testDb
      .select({ sectorId: sectors.id })
      .from(sectors)
      .where(eq(sectors.eventId, clean.id));
    expect(remainingRows).toHaveLength(0);
    const remainingRows2 = await testDb
      .select({ id: seatRows.id })
      .from(seatRows)
      .where(eq(seatRows.sectorId, sector.id));
    expect(remainingRows2).toHaveLength(0);
    const remainingRows3 = await testDb
      .select({ rowId: seats.rowId })
      .from(seats)
      .where(eq(seats.rowId, row.id));
    expect(remainingRows3).toHaveLength(0);
    const remainingRows4 = await testDb
      .select({ sectorId: priceLots.sectorId })
      .from(priceLots)
      .where(eq(priceLots.sectorId, sector.id));
    expect(remainingRows4).toHaveLength(0);
  });

  const VENUE_PAYLOAD = {
    name: 'Teatro Municipal',
    city: 'Curitiba',
    state: 'pr',
  };

  const SECTOR_PAYLOAD = {
    name: 'Palco',
    priceFromCents: 5000,
    rows: [
      { label: 'A', seatCount: 3 },
      { label: 'B', seatCount: 1 },
    ],
  };

  async function seedPaidSeat(input: {
    eventId: string;
    seatId: string;
    rowId: string;
    sectorSlug: string;
  }) {
    const [order] = await testDb
      .insert(orders)
      .values({
        userId: 'user-a',
        eventId: input.eventId,
        status: 'paid',
        paymentMethod: 'card',
        provider: 'stripe',
        subtotalCents: 5000,
        serviceFeeCents: 0,
        totalCents: 5000,
      })
      .returning();
    await testDb.insert(orderItems).values({
      orderId: order.id,
      seatId: input.seatId,
      rowId: input.rowId,
      sectorSlug: input.sectorSlug,
      rowLabel: 'A',
      seatLabel: '1',
      ticketType: 'inteira',
      priceCents: 5000,
    });
  }

  async function createSector(
    eventId: string,
    payload: {
      name?: string;
      priceFromCents?: number;
      rows?: { label: string; seatCount: number }[];
    } = {},
  ) {
    return app.inject({
      method: 'POST',
      url: `/organizer/events/${eventId}/sectors`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        name: 'Palco',
        priceFromCents: 5000,
        rows: [
          { label: 'A', seatCount: 3 },
          { label: 'B', seatCount: 1 },
        ],
        ...payload,
      },
    });
  }

  async function fetchSeats(sectorId: string) {
    return testDb
      .select({
        id: seats.id,
        rowId: seats.rowId,
        label: seats.label,
        position: seats.position,
        rowLabel: seatRows.label,
      })
      .from(seats)
      .innerJoin(seatRows, eq(seats.rowId, seatRows.id))
      .where(eq(seatRows.sectorId, sectorId))
      .orderBy(asc(seatRows.position), asc(seats.position));
  }

  it('catálogo de locais é compartilhado', async () => {
    await promoteOrganizers('user-a');
    await seedCatalog();

    const list = await app.inject({
      method: 'GET',
      url: '/organizer/venues',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().venues).toEqual([
      {
        id: expect.any(String),
        slug: 'arena-sp',
        name: 'Arena SP',
        city: 'São Paulo',
        state: 'SP',
      },
    ]);

    const created = await app.inject({
      method: 'POST',
      url: '/organizer/venues',
      headers: { 'x-test-user-id': 'user-a' },
      payload: VENUE_PAYLOAD,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().venue.slug).toBe('teatro-municipal');
    expect(created.json().venue.state).toBe('PR');

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/organizer/venues/${created.json().venue.id}`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: { ...VENUE_PAYLOAD, name: 'Teatro Municipal Novo', state: 'PR' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().venue.slug).toBe('teatro-municipal');
    expect(renamed.json().venue.name).toBe('Teatro Municipal Novo');

    const after = await app.inject({
      method: 'GET',
      url: '/organizer/venues',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(after.statusCode).toBe(200);
    expect(
      after.json().venues.map((venue: { slug: string }) => venue.slug),
    ).toEqual(['arena-sp', 'teatro-municipal']);
  });

  it('setor com filas e cadeiras é criado', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );

    const created = await createSector(event.id);
    expect(created.statusCode).toBe(201);
    expect(created.json().sector.slug).toBe('palco');
    expect(created.json().sector.seatsTotal).toBe(4);
    expect(
      created.json().sector.rows.map((row: { label: string }) => row.label),
    ).toEqual(['A', 'B']);
    expect(created.json().sector.lots).toEqual([]);

    const persistedPrice = await testDb
      .select({ priceFromCents: events.priceFromCents })
      .from(events)
      .where(eq(events.id, event.id));
    expect(persistedPrice[0]?.priceFromCents).toBe(5000);

    const seatsInDb = await testDb
      .select({
        label: seats.label,
        position: seats.position,
        rowLabel: seatRows.label,
        status: seats.status,
      })
      .from(seats)
      .innerJoin(seatRows, eq(seats.rowId, seatRows.id))
      .where(eq(seatRows.sectorId, created.json().sector.id))
      .orderBy(asc(seatRows.position), asc(seats.position));
    expect(seatsInDb.map((seat) => `${seat.rowLabel}${seat.label}`)).toEqual([
      'A1',
      'A2',
      'A3',
      'B1',
    ]);
    expect(seatsInDb[0]?.status).toBe('available');

    const detail = await app.inject({
      method: 'GET',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().event.sectors).toHaveLength(1);
    expect(detail.json().event.sectors[0].seatsTotal).toBe(4);
    expect(detail.json().event.priceFromCents).toBe(5000);
  });

  it('fila nova entra e fila repetida não entra', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );
    const created = await createSector(event.id, {
      rows: [{ label: 'A', seatCount: 2 }],
    });
    const sectorId = created.json().sector.id as string;

    const added = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${sectorId}/rows`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: { label: 'B', seatCount: 3 },
    });
    expect(added.statusCode).toBe(201);
    expect(
      added.json().sector.rows.map((row: { label: string }) => row.label),
    ).toEqual(['A', 'B']);
    expect(added.json().sector.seatsTotal).toBe(5);

    const duplicated = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${sectorId}/rows`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: { label: 'A', seatCount: 3 },
    });
    expect(duplicated.statusCode).toBe(409);
    expect(duplicated.json()).toEqual({ error: 'row_label_conflict' });

    const renamedSector = await createSector(event.id, { name: 'Palco' });
    expect(renamedSector.statusCode).toBe(409);
    expect(renamedSector.json()).toEqual({ error: 'sector_conflict' });
  });

  it('fila com cadeiras vendidas não é excluída', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );
    const created = await createSector(event.id, {
      rows: [
        { label: 'A', seatCount: 2 },
        { label: 'B', seatCount: 2 },
      ],
    });
    const sectorId = created.json().sector.id as string;
    const seatsById = await fetchSeats(sectorId);
    const soldSeat = seatsById.find((seat) => seat.rowLabel === 'A');
    const freeRowSeats = seatsById.filter((seat) => seat.rowLabel === 'B');
    if (!soldSeat || freeRowSeats.length === 0) {
      throw new Error('fixture sem cadeiras');
    }
    await seedPaidSeat({
      eventId: event.id,
      seatId: soldSeat.id,
      rowId: soldSeat.rowId,
      sectorSlug: 'palco',
    });

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/organizer/rows/${soldSeat.rowId}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: 'row_has_orders' });
    const stillSeats = await testDb
      .select({ id: seats.id })
      .from(seats)
      .where(eq(seats.rowId, soldSeat.rowId));
    expect(stillSeats).toHaveLength(2);

    const freeRowId = freeRowSeats[0]?.rowId;
    if (!freeRowId) throw new Error('fixture sem fila livre');
    const freed = await app.inject({
      method: 'DELETE',
      url: `/organizer/rows/${freeRowId}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(freed.statusCode).toBe(200);
    expect(freed.json()).toEqual({ ok: true });
    const rowSeats = await testDb
      .select({ id: seats.id })
      .from(seats)
      .where(eq(seats.rowId, freeRowId));
    expect(rowSeats).toHaveLength(0);
    const rowInDb = await testDb
      .select({ id: seatRows.id })
      .from(seatRows)
      .where(eq(seatRows.id, freeRowId));
    expect(rowInDb).toHaveLength(0);

    const sectorBlocked = await app.inject({
      method: 'DELETE',
      url: `/organizer/sectors/${sectorId}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(sectorBlocked.statusCode).toBe(409);
    expect(sectorBlocked.json()).toEqual({ error: 'sector_has_orders' });
    const sectorStillThere = await testDb
      .select({ id: sectors.id })
      .from(sectors)
      .where(eq(sectors.id, sectorId));
    expect(sectorStillThere).toHaveLength(1);
  });

  it('setor de outro organizador é 403', async () => {
    await promoteOrganizers('user-a', 'user-b');
    const { category, venue } = await seedCatalog();
    const foreign = await insertEvent(
      { slug: 'show-alheio', organizerId: 'user-b', title: 'Show Alheio' },
      { category, venue },
    );
    const platform = await insertEvent(
      {
        slug: 'show-plataforma',
        organizerId: null,
        title: 'Show da Plataforma',
      },
      { category, venue },
    );

    const foreignCreate = await createSector(foreign.id);
    expect(foreignCreate.statusCode).toBe(403);
    expect(foreignCreate.json()).toEqual({ error: 'event_forbidden' });

    const platformCreate = await createSector(platform.id);
    expect(platformCreate.statusCode).toBe(403);
    expect(platformCreate.json()).toEqual({ error: 'event_forbidden' });

    await testDb.insert(sectors).values({
      eventId: foreign.id,
      slug: 'pista-alheia',
      name: 'Pista Alheia',
      priceFromCents: 1000,
    });
    const [foreignSector] = await testDb
      .select({ id: sectors.id })
      .from(sectors)
      .where(eq(sectors.eventId, foreign.id));

    const foreignRow = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${foreignSector.id}/rows`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: { label: 'A', seatCount: 2 },
    });
    expect(foreignRow.statusCode).toBe(403);
    expect(foreignRow.json()).toEqual({ error: 'sector_forbidden' });

    const foreignDelete = await app.inject({
      method: 'DELETE',
      url: `/organizer/sectors/${foreignSector.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(foreignDelete.statusCode).toBe(403);
    expect(foreignDelete.json()).toEqual({ error: 'sector_forbidden' });
  });

  it('lote é criado com vigência e o preço efetivo sai no detail e no recalc', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );
    const sector = (
      await createSector(event.id, { priceFromCents: 5000 })
    ).json().sector;

    const startsAt = new Date(Date.now() - 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const created = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${sector.id}/lots`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: { name: 'Primeiro Lote', priceCents: 12000, startsAt, endsAt },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().lot).toEqual({
      id: expect.any(String),
      name: 'Primeiro Lote',
      priceCents: 12000,
      startsAt,
      endsAt,
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(detail.json().event.sectors[0].lots).toEqual([
      {
        id: created.json().lot.id,
        name: 'Primeiro Lote',
        priceCents: 12000,
        startsAt,
        endsAt,
      },
    ]);
    expect(detail.json().event.priceFromCents).toBe(12000);

    const [persisted] = await testDb
      .select({ priceFromCents: events.priceFromCents })
      .from(events)
      .where(eq(events.id, event.id));
    expect(persisted.priceFromCents).toBe(12000);
  });

  it('sobreposição é recusada com 409 lot_overlaps e janela encostada passa', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );
    const sector = (
      await createSector(event.id, { priceFromCents: 5000 })
    ).json().sector;

    const now = Date.now();
    const createLot = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/organizer/sectors/${sector.id}/lots`,
        headers: { 'x-test-user-id': 'user-a' },
        payload,
      });

    const base = await createLot({
      name: 'Lote Ativo',
      priceCents: 12000,
      startsAt: new Date(now - 3_600_000).toISOString(),
      endsAt: new Date(now + 24 * 3_600_000).toISOString(),
    });
    expect(base.statusCode).toBe(201);

    const cortado = await createLot({
      name: 'Lote Cortando',
      priceCents: 11000,
      startsAt: new Date(now + 23 * 3_600_000).toISOString(),
      endsAt: new Date(now + 48 * 3_600_000).toISOString(),
    });
    expect(cortado.statusCode).toBe(409);
    expect(cortado.json()).toEqual({ error: 'lot_overlaps' });

    const encostado = await createLot({
      name: 'Lote Encostado',
      priceCents: 10000,
      startsAt: new Date(now + 24 * 3_600_000).toISOString(),
      endsAt: new Date(now + 48 * 3_600_000).toISOString(),
    });
    expect(encostado.statusCode).toBe(201);
  });

  it('janela inválida é recusada com 400 invalid_period', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );
    const sector = (
      await createSector(event.id, { priceFromCents: 5000 })
    ).json().sector;

    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const rejected = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${sector.id}/lots`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        name: 'Lote Torto',
        priceCents: 12000,
        startsAt,
        endsAt: startsAt,
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toEqual({ error: 'invalid_period' });

    const persisted = await testDb
      .select({ id: priceLots.id })
      .from(priceLots)
      .where(eq(priceLots.sectorId, sector.id));
    expect(persisted).toHaveLength(0);
  });

  it('update e delete de lote recalculam o preço do evento no banco', async () => {
    await promoteOrganizers('user-a');
    const { category, venue } = await seedCatalog();
    const event = await insertEvent(
      { slug: 'meu-show', organizerId: 'user-a', title: 'Meu Show' },
      { category, venue },
    );
    const sector = (
      await createSector(event.id, { priceFromCents: 5000 })
    ).json().sector;

    const now = Date.now();
    const created = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${sector.id}/lots`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        name: 'Primeiro Lote',
        priceCents: 12000,
        startsAt: new Date(now - 3_600_000).toISOString(),
        endsAt: new Date(now + 24 * 3_600_000).toISOString(),
      },
    });
    const lotId = created.json().lot.id as string;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/organizer/lots/${lotId}`,
      headers: { 'x-test-user-id': 'user-a' },
      payload: {
        name: 'Primeiro Lote Ajustado',
        priceCents: 9000,
        startsAt: new Date(now - 3_600_000).toISOString(),
        endsAt: new Date(now + 24 * 3_600_000).toISOString(),
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().lot).toMatchObject({
      name: 'Primeiro Lote Ajustado',
      priceCents: 9000,
    });
    const [afterPatch] = await testDb
      .select({ priceFromCents: events.priceFromCents })
      .from(events)
      .where(eq(events.id, event.id));
    expect(afterPatch.priceFromCents).toBe(9000);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/organizer/lots/${lotId}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ ok: true });

    const [afterDelete] = await testDb
      .select({ priceFromCents: events.priceFromCents })
      .from(events)
      .where(eq(events.id, event.id));
    expect(afterDelete.priceFromCents).toBe(5000);

    const detail = await app.inject({
      method: 'GET',
      url: `/organizer/events/${event.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(detail.json().event.sectors[0].lots).toEqual([]);
  });

  it('lotes sofrem autorização por setor e guard primeiro', async () => {
    await promoteOrganizers('user-a', 'user-b');
    const { category, venue } = await seedCatalog();
    const foreign = await insertEvent(
      { slug: 'show-alheio', organizerId: 'user-b', title: 'Show Alheio' },
      { category, venue },
    );

    const payload = {
      name: 'Primeiro Lote',
      priceCents: 12000,
      startsAt: new Date(Date.now() - 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    };

    const buyerPost = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/11111111-1111-4111-8111-111111111111/lots`,
      headers: {
        'x-test-user-id': 'user-anon',
        'x-test-anonymous': 'true',
      },
      payload,
    });
    expect(buyerPost.statusCode).toBe(403);
    expect(buyerPost.json()).toEqual({ error: 'not_organizer' });

    const anonymousDelete = await app.inject({
      method: 'DELETE',
      url: '/organizer/lots/11111111-1111-4111-8111-111111111112',
    });
    expect(anonymousDelete.statusCode).toBe(401);

    const [foreignSector] = await testDb
      .insert(sectors)
      .values({
        eventId: foreign.id,
        slug: 'pista-alheia',
        name: 'Pista Alheia',
        priceFromCents: 1000,
      })
      .returning();

    const foreignCreate = await app.inject({
      method: 'POST',
      url: `/organizer/sectors/${foreignSector.id}/lots`,
      headers: { 'x-test-user-id': 'user-a' },
      payload,
    });
    expect(foreignCreate.statusCode).toBe(403);
    expect(foreignCreate.json()).toEqual({ error: 'sector_forbidden' });

    const [foreignLot] = await testDb
      .insert(priceLots)
      .values({
        sectorId: foreignSector.id,
        name: 'Lote Alheio',
        priceCents: 20000,
        startsAt: new Date(payload.startsAt),
        endsAt: new Date(payload.endsAt),
      })
      .returning();

    const foreignPatch = await app.inject({
      method: 'PATCH',
      url: `/organizer/lots/${foreignLot.id}`,
      headers: { 'x-test-user-id': 'user-a' },
      payload,
    });
    expect(foreignPatch.statusCode).toBe(403);
    expect(foreignPatch.json()).toEqual({ error: 'lot_forbidden' });

    const foreignDelete = await app.inject({
      method: 'DELETE',
      url: `/organizer/lots/${foreignLot.id}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(foreignDelete.statusCode).toBe(403);
    expect(foreignDelete.json()).toEqual({ error: 'lot_forbidden' });

    const unknownPatch = await app.inject({
      method: 'PATCH',
      url: '/organizer/lots/11111111-1111-4111-8111-111111111113',
      headers: { 'x-test-user-id': 'user-a' },
      payload,
    });
    expect(unknownPatch.statusCode).toBe(404);
    expect(unknownPatch.json()).toEqual({ error: 'lot_not_found' });

    const unknownDelete = await app.inject({
      method: 'DELETE',
      url: '/organizer/lots/11111111-1111-4111-8111-111111111113',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(unknownDelete.statusCode).toBe(404);
    expect(unknownDelete.json()).toEqual({ error: 'lot_not_found' });

    const unknownSector = await app.inject({
      method: 'POST',
      url: '/organizer/sectors/11111111-1111-4111-8111-111111111114/lots',
      headers: { 'x-test-user-id': 'user-a' },
      payload,
    });
    expect(unknownSector.statusCode).toBe(404);
    expect(unknownSector.json()).toEqual({ error: 'sector_not_found' });
  });

  it('guard primeiro', async () => {
    const foreignId = '11111111-1111-4111-8111-111111111111';

    const buyersGet = await app.inject({
      method: 'GET',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-b' },
    });
    expect(buyersGet.statusCode).toBe(403);
    expect(buyersGet.json()).toEqual({ error: 'not_organizer' });

    const buyersPost = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-b' },
      payload: CREATE_PAYLOAD,
    });
    expect(buyersPost.statusCode).toBe(403);

    const buyersDelete = await app.inject({
      method: 'DELETE',
      url: `/organizer/events/${foreignId}`,
      headers: { 'x-test-user-id': 'user-b' },
    });
    expect(buyersDelete.statusCode).toBe(403);

    const anonymousGet = await app.inject({
      method: 'GET',
      url: '/organizer/events',
    });
    expect(anonymousGet.statusCode).toBe(401);
    expect(anonymousGet.json()).toEqual({ error: 'not_authenticated' });

    const anonymousPost = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      payload: CREATE_PAYLOAD,
    });
    expect(anonymousPost.statusCode).toBe(401);

    const anonymousDelete = await app.inject({
      method: 'DELETE',
      url: `/organizer/events/${foreignId}`,
    });
    expect(anonymousDelete.statusCode).toBe(401);

    const buyersVenues = await app.inject({
      method: 'GET',
      url: '/organizer/venues',
      headers: { 'x-test-user-id': 'user-b' },
    });
    expect(buyersVenues.statusCode).toBe(403);
    expect(buyersVenues.json()).toEqual({ error: 'not_organizer' });

    const anonymousVenuePost = await app.inject({
      method: 'POST',
      url: '/organizer/venues',
      payload: VENUE_PAYLOAD,
    });
    expect(anonymousVenuePost.statusCode).toBe(401);

    const buyersSectorPost = await app.inject({
      method: 'POST',
      url: `/organizer/events/${foreignId}/sectors`,
      headers: { 'x-test-user-id': 'user-b' },
      payload: SECTOR_PAYLOAD,
    });
    expect(buyersSectorPost.statusCode).toBe(403);

    const anonymousRowDelete = await app.inject({
      method: 'DELETE',
      url: '/organizer/rows/11111111-1111-4111-8111-111111111112',
    });
    expect(anonymousRowDelete.statusCode).toBe(401);
  });
});
