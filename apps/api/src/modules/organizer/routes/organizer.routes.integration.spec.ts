import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import {
  categories,
  events,
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
  });
});
