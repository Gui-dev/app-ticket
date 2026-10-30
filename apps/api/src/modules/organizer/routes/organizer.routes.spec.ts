import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GetSessionFn,
  SessionUser,
  UserRole,
} from '../../auth/get-session.js';
import type { OrderRecord } from '../../orders/domain/order-entity.js';
import type { OrderRepository } from '../../orders/domain/order-repository.js';
import { FakePaymentProvider } from '../../payments/infra/fake-payment-provider.js';
import { InMemoryStripeAccountStore } from '../../payments/infra/in-memory-stripe-account-store.js';
import type { TransferOrganizerShareUseCase } from '../../payments/use-cases/transfer-organizer-share.use-case.js';
import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerOrderSeed,
  InMemoryOrganizerTicketSeed,
} from '../infra/in-memory-organizer-repository.js';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository.js';
import { registerOrganizerRoutes } from './organizer.routes.js';

function seedEvent(
  values: Partial<InMemoryOrganizerEventSeed> & { title: string },
): InMemoryOrganizerEventSeed {
  return {
    description: 'Descrição suficientemente longa do evento testado.',
    categorySlug: 'shows',
    venueSlug: 'arena-sp',
    startsAt: new Date('2026-12-01T20:00:00.000Z'),
    organizerId: null,
    ...values,
  };
}

const PLATFORM_EVENT_ID = '22222222-2222-4222-8222-222222222222';
const FOREIGN_EVENT_ID = '33333333-3333-4333-8333-333333333333';
const MY_EVENT_ID = '44444444-4444-4444-8444-444444444444';

const CREATE_PAYLOAD = {
  title: 'Festival de Inverno',
  description: 'Festival com artistas locais no centro da cidade.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: '2026-12-01T20:00:00.000Z',
} as const;

const retryOrderRepository = {
  findById: async () => null,
} as unknown as OrderRepository;
const retryUseCase = {
  execute: async () => 'skipped',
} as unknown as TransferOrganizerShareUseCase;

describe('organizer event routes', () => {
  let app: FastifyInstance;
  let repository: InMemoryOrganizerRepository;
  let roles: Map<string, UserRole>;
  let paymentProvider: FakePaymentProvider;
  let stripeAccountStore: InMemoryStripeAccountStore;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    const role = roles.get(userId) ?? 'buyer';
    const session: SessionUser = { userId, role };
    return session;
  };

  beforeEach(() => {
    roles = new Map([['user-a', 'organizer']]);
    paymentProvider = new FakePaymentProvider();
    stripeAccountStore = new InMemoryStripeAccountStore();
    repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: [
        seedEvent({
          id: PLATFORM_EVENT_ID,
          title: 'Show da Plataforma',
          organizerId: null,
        }),
        seedEvent({
          id: FOREIGN_EVENT_ID,
          title: 'Show Alheio',
          organizerId: 'user-b',
        }),
        seedEvent({
          id: MY_EVENT_ID,
          title: 'Meu Show',
          organizerId: 'user-a',
        }),
      ],
    });
    app = Fastify({ logger: false });
    registerOrganizerRoutes(app, {
      getSession,
      organizerRepository: repository,
      paymentProvider,
      stripeAccountStore,
      orderRepository: retryOrderRepository,
      transferOrganizerShare: retryUseCase,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('roteiro de eventos exige sessão ativa', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/events',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_authenticated' });
  });

  it('roteiro de eventos exige papel de organizador', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-b' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'not_organizer' });
  });

  it('cria evento de organizador', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
      payload: CREATE_PAYLOAD,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.event.slug).toBe('festival-de-inverno');
    expect(body.event.platform).toBe(false);
    expect(body.event.priceFromCents).toBe(0);
    expect(body.event.category).toEqual({ slug: 'shows', name: 'Shows' });
    expect(body.event.venue).toEqual({
      slug: 'arena-sp',
      name: 'Arena SP',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(body.event.startsAt).toBe('2026-12-01T20:00:00.000Z');
  });

  it('rejeita corpo inválido na criação', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { ...CREATE_PAYLOAD, title: 'ab' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_body');
  });

  it('categoria inexistente retorna 404 na criação', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { ...CREATE_PAYLOAD, categorySlug: 'inexistente' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'category_not_found' });
  });

  it('local inexistente retorna 404 na criação', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { ...CREATE_PAYLOAD, venueSlug: 'inexistente' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'venue_not_found' });
  });

  it('detalhe de evento inexistente retorna 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/events/11111111-1111-4111-8111-111111111111',
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
  });

  it('evento da plataforma é legível pelo organizador', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/organizer/events/${PLATFORM_EVENT_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.event.platform).toBe(true);
    expect(body.event.sectors).toEqual([]);
  });

  it('evento alheio retorna 403 no detalhe', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/organizer/events/${FOREIGN_EVENT_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'event_forbidden' });
  });

  describe('GET /organizer/events/:id/report', () => {
    const MY_EVENT_ID = '11111111-1111-4111-8111-111111111111';

    function seedMyEventWithOrders() {
      const repositorySeed = {
        categories: [{ slug: 'shows', name: 'Shows' }],
        venues: [
          {
            slug: 'arena-sp',
            name: 'Arena SP',
            city: 'São Paulo',
            state: 'SP',
          },
        ],
        events: [
          seedEvent({
            id: MY_EVENT_ID,
            title: 'Meu Show',
            organizerId: 'user-a',
          }),
        ],
        orders: [
          {
            eventId: MY_EVENT_ID,
            status: 'paid' as const,
            paidAt: new Date('2026-06-01T10:00:00.000Z'),
            serviceFeeCents: 500,
            items: [{ priceCents: 5000 }, { priceCents: 3000 }],
          },
        ],
      };
      repository = new InMemoryOrganizerRepository(repositorySeed);
      const next = Fastify({ logger: false });
      registerOrganizerRoutes(next, {
        getSession,
        organizerRepository: repository,
        paymentProvider,
        stripeAccountStore,
        orderRepository: retryOrderRepository,
        transferOrganizerShare: retryUseCase,
      });
      return next;
    }

    it('relatório exige sessão ativa', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'not_authenticated' });
    });

    it('relatório exige papel de organizador', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report`,
        headers: { 'x-test-user-id': 'user-b' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'not_organizer' });
    });

    it('id inválido retorna 404 event_not_found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/organizer/events/nao-existe/report',
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'event_not_found' });
    });

    it('evento inexistente retorna 404 e evento alheio retorna 403', async () => {
      const notFound = await app.inject({
        method: 'GET',
        url: '/organizer/events/11111111-1111-4111-8111-111111111111/report',
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.json()).toEqual({ error: 'event_not_found' });

      const forbidden = await app.inject({
        method: 'GET',
        url: `/organizer/events/${FOREIGN_EVENT_ID}/report`,
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ error: 'event_forbidden' });
    });

    it('query inválida retorna 400 invalid_query', async () => {
      const badString = await app.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report?from=not-a-date`,
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(badString.statusCode).toBe(400);
      expect(badString.json()).toEqual({ error: 'invalid_query' });

      const inverted = await app.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report?from=2026-06-02T00:00:00.000Z&to=2026-06-01T00:00:00.000Z`,
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(inverted.statusCode).toBe(400);
      expect(inverted.json()).toEqual({ error: 'invalid_query' });
    });

    it('devolve o relatório com números e ecoa from/to nulos', async () => {
      const scoped = seedMyEventWithOrders();
      const response = await scoped.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report`,
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        report: {
          eventId: MY_EVENT_ID,
          from: null,
          to: null,
          ticketsSold: 2,
          ordersCount: 1,
          grossCents: 8000,
          platformFeeCents: 500,
          netCents: 7500,
        },
      });
      await scoped.close();
    });

    it('devolve o relatório com janela e ecoa from/to aplicados', async () => {
      const scoped = seedMyEventWithOrders();
      const inside = await scoped.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report?from=2026-06-01T00:00:00.000Z&to=2026-06-02T00:00:00.000Z`,
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(inside.statusCode).toBe(200);
      expect(inside.json().report).toEqual({
        eventId: MY_EVENT_ID,
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-02T00:00:00.000Z',
        ticketsSold: 2,
        ordersCount: 1,
        grossCents: 8000,
        platformFeeCents: 500,
        netCents: 7500,
      });

      const outside = await scoped.inject({
        method: 'GET',
        url: `/organizer/events/${MY_EVENT_ID}/report?from=2026-07-01T00:00:00.000Z&to=2026-07-02T00:00:00.000Z`,
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(outside.statusCode).toBe(200);
      expect(outside.json().report).toEqual({
        eventId: MY_EVENT_ID,
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-02T00:00:00.000Z',
        ticketsSold: 0,
        ordersCount: 0,
        grossCents: 0,
        platformFeeCents: 0,
        netCents: 0,
      });
      await scoped.close();
    });
  });

  describe('POST /organizer/events/:id/tickets/validate', () => {
    const MY_EVENT_ID = '11111111-1111-4111-8111-111111111111';

    function seedMyEventWithTickets(
      tickets: InMemoryOrganizerTicketSeed[] = [],
    ): FastifyInstance {
      repository = new InMemoryOrganizerRepository({
        categories: [{ slug: 'shows', name: 'Shows' }],
        venues: [
          {
            slug: 'arena-sp',
            name: 'Arena SP',
            city: 'São Paulo',
            state: 'SP',
          },
        ],
        events: [
          seedEvent({
            id: MY_EVENT_ID,
            title: 'Meu Show',
            organizerId: 'user-a',
          }),
        ],
        tickets,
      });
      const next = Fastify({ logger: false });
      registerOrganizerRoutes(next, {
        getSession,
        organizerRepository: repository,
        paymentProvider,
        stripeAccountStore,
        orderRepository: retryOrderRepository,
        transferOrganizerShare: retryUseCase,
      });
      return next;
    }

    it('validação exige sessão ativa e papel de organizador', async () => {
      const noSession = await app.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        payload: { code: 'TKV-1' },
      });
      expect(noSession.statusCode).toBe(401);
      expect(noSession.json()).toEqual({ error: 'not_authenticated' });

      const buyer = await app.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-b' },
        payload: { code: 'TKV-1' },
      });
      expect(buyer.statusCode).toBe(403);
      expect(buyer.json()).toEqual({ error: 'not_organizer' });
    });

    it('id de evento inválido retorna 404 event_not_found', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/organizer/events/nao-existe/tickets/validate',
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-1' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'event_not_found' });
    });

    it('corpo inválido retorna 400 invalid_body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: '' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('invalid_body');

      const missing = await app.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error).toBe('invalid_body');
    });

    it('evento inexistente retorna 404 e evento alheio retorna 403', async () => {
      const notFound = await app.inject({
        method: 'POST',
        url: '/organizer/events/11111111-1111-4111-8111-111111111112/tickets/validate',
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-1' },
      });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.json()).toEqual({ error: 'event_not_found' });

      const forbidden = await app.inject({
        method: 'POST',
        url: `/organizer/events/${FOREIGN_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-1' },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ error: 'event_forbidden' });
    });

    it('ingresso próprio novo devolve valid com assento', async () => {
      const scoped = seedMyEventWithTickets([
        {
          eventId: MY_EVENT_ID,
          code: 'TKV-1',
          sectorName: 'Pista Premium',
          rowLabel: 'A',
          seatLabel: '12',
        },
      ]);

      const response = await scoped.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        validation: {
          result: 'valid',
          usedAt: null,
          usedBy: null,
          sectorName: 'Pista Premium',
          rowLabel: 'A',
          seatLabel: '12',
        },
      });
      await scoped.close();
    });

    it('revalidação devolve already_used com usedAt ISO e quem validou', async () => {
      const scoped = seedMyEventWithTickets([
        {
          eventId: MY_EVENT_ID,
          code: 'TKV-1',
          sectorName: 'Pista Premium',
          rowLabel: 'A',
          seatLabel: '12',
        },
      ]);

      const first = await scoped.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-1' },
      });
      expect(first.json().validation.result).toBe('valid');

      const second = await scoped.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-1' },
      });

      expect(second.statusCode).toBe(200);
      const body = second.json();
      expect(body.validation.result).toBe('already_used');
      expect(typeof body.validation.usedAt).toBe('string');
      expect(new Date(body.validation.usedAt).toISOString()).toBe(
        body.validation.usedAt,
      );
      expect(typeof body.validation.usedBy).toBe('string');
      expect(body.validation.sectorName).toBe('Pista Premium');
      await scoped.close();
    });

    it('código desconhecido e ingresso de outro evento devolvem invalid', async () => {
      const scoped = seedMyEventWithTickets([
        {
          eventId: FOREIGN_EVENT_ID,
          code: 'TKV-outro',
          sectorName: 'Pista',
          rowLabel: 'A',
          seatLabel: '1',
        },
      ]);

      const unknown = await scoped.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-inexistente' },
      });
      expect(unknown.statusCode).toBe(200);
      expect(unknown.json()).toEqual({
        validation: {
          result: 'invalid',
          usedAt: null,
          usedBy: null,
          sectorName: null,
          rowLabel: null,
          seatLabel: null,
        },
      });

      const foreign = await scoped.inject({
        method: 'POST',
        url: `/organizer/events/${MY_EVENT_ID}/tickets/validate`,
        headers: { 'x-test-user-id': 'user-a' },
        payload: { code: 'TKV-outro' },
      });
      expect(foreign.statusCode).toBe(200);
      expect(foreign.json().validation.result).toBe('invalid');
      await scoped.close();
    });
  });

  describe('organizer payments connect routes', () => {
    it('onboarding exige sessão ativa e papel de organizador', async () => {
      const noSession = await app.inject({
        method: 'POST',
        url: '/organizer/payments/connect',
      });
      expect(noSession.statusCode).toBe(401);
      expect(noSession.json()).toEqual({ error: 'not_authenticated' });

      const buyer = await app.inject({
        method: 'POST',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-b' },
      });
      expect(buyer.statusCode).toBe(403);
      expect(buyer.json()).toEqual({ error: 'not_organizer' });
    });

    it('status exige sessão ativa e papel de organizador', async () => {
      const noSession = await app.inject({
        method: 'GET',
        url: '/organizer/payments/connect',
      });
      expect(noSession.statusCode).toBe(401);
      expect(noSession.json()).toEqual({ error: 'not_authenticated' });

      const buyer = await app.inject({
        method: 'GET',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-b' },
      });
      expect(buyer.statusCode).toBe(403);
      expect(buyer.json()).toEqual({ error: 'not_organizer' });
    });

    it('cria a conta connect, persiste no store e devolve onboardingUrl', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        onboardingUrl:
          'https://connect.stripe.com/fake/acct_fake_user-a/onboarding',
      });
      await expect(stripeAccountStore.getByUserId('user-a')).resolves.toEqual({
        stripeAccountId: 'acct_fake_user-a',
      });
    });

    it('reutiliza a conta existente no segundo onboarding', async () => {
      await app.inject({
        method: 'POST',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-a' },
      });
      const spy = vi.spyOn(paymentProvider, 'createConnectOnboarding');

      const second = await app.inject({
        method: 'POST',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(second.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledWith({
        userId: 'user-a',
        accountId: 'acct_fake_user-a',
      });
      await expect(stripeAccountStore.getByUserId('user-a')).resolves.toEqual({
        stripeAccountId: 'acct_fake_user-a',
      });
    });

    it('status devolve connected false para organizador sem conta', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        connected: false,
        payoutsEnabled: false,
      });
    });

    it('status devolve connected e payoutsEnabled com conta pronta', async () => {
      await app.inject({
        method: 'POST',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-a' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/organizer/payments/connect',
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        connected: true,
        payoutsEnabled: true,
      });
    });
  });
});

describe('organizer payments transfers routes', () => {
  const MY_EVENT_ID = '44444444-4444-4444-8444-444444444444';
  const FOREIGN_EVENT_ID = '33333333-3333-4333-8333-333333333333';
  const PLATFORM_EVENT_ID = '22222222-2222-4222-8222-222222222222';
  const ORDER_ID = '550e8400-e29b-41d4-a716-446655440000';
  const OTHER_ORDER_ID = '660f9511-f90c-52e5-b827-557766551111';

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    const role: UserRole = userId === 'user-a' ? 'organizer' : 'buyer';
    return { userId, role };
  };

  function seedEvent(
    values: Partial<InMemoryOrganizerEventSeed> & { title: string },
  ): InMemoryOrganizerEventSeed {
    return {
      description: 'Descrição suficientemente longa do evento testado.',
      categorySlug: 'shows',
      venueSlug: 'arena-sp',
      startsAt: new Date('2026-12-01T20:00:00.000Z'),
      organizerId: null,
      ...values,
    };
  }

  function retryOrder(values: {
    id: string;
    eventId: string;
    transferStatus: 'none' | 'pending' | 'succeeded' | 'failed' | 'skipped';
  }): OrderRecord {
    return {
      id: values.id,
      eventId: values.eventId,
      transferStatus: values.transferStatus,
    } as unknown as OrderRecord;
  }

  async function createTransfersApp(options: {
    events: InMemoryOrganizerEventSeed[];
    orders: InMemoryOrganizerOrderSeed[];
    ordersById?: Map<string, OrderRecord>;
    execute?: (input: {
      orderId: string;
    }) => Promise<'transferred' | 'skipped' | 'failed'>;
  }) {
    const repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: options.events,
      orders: options.orders,
    });
    const app = Fastify({ logger: false });
    registerOrganizerRoutes(app, {
      getSession,
      organizerRepository: repository,
      paymentProvider: new FakePaymentProvider(),
      stripeAccountStore: new InMemoryStripeAccountStore(),
      orderRepository: {
        findById: async (id: string) => options.ordersById?.get(id) ?? null,
      } as unknown as OrderRepository,
      transferOrganizerShare: {
        execute: options.execute ?? (async () => 'transferred'),
      } as unknown as TransferOrganizerShareUseCase,
    });
    await app.ready();
    return app;
  }

  it('roteiro de repasses exige sessão ativa', async () => {
    const app = await createTransfersApp({ events: [], orders: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/organizer/payments/transfers',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_authenticated' });
    await app.close();
  });

  it('organizador lista repasses dos próprios pedidos com bruto, taxa e líquido do splitAmounts', async () => {
    const app = await createTransfersApp({
      events: [
        seedEvent({
          id: MY_EVENT_ID,
          title: 'Meu Show',
          organizerId: 'user-a',
        }),
        seedEvent({
          id: FOREIGN_EVENT_ID,
          title: 'Show Alheio',
          organizerId: 'user-b',
        }),
        seedEvent({ id: PLATFORM_EVENT_ID, title: 'Show da Plataforma' }),
      ],
      orders: [
        {
          id: ORDER_ID,
          eventId: MY_EVENT_ID,
          status: 'paid',
          totalCents: 13200,
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
        },
        {
          id: OTHER_ORDER_ID,
          eventId: MY_EVENT_ID,
          status: 'paid',
          totalCents: 5000,
          createdAt: new Date('2026-06-03T10:00:00.000Z'),
        },
        {
          id: randomUUID(),
          eventId: MY_EVENT_ID,
          status: 'pending',
          totalCents: 2000,
          createdAt: new Date('2026-06-04T10:00:00.000Z'),
        },
        {
          id: randomUUID(),
          eventId: FOREIGN_EVENT_ID,
          status: 'paid',
          totalCents: 9000,
        },
        {
          id: randomUUID(),
          eventId: PLATFORM_EVENT_ID,
          status: 'paid',
          totalCents: 7000,
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/organizer/payments/transfers',
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transfers: [
        {
          orderId: OTHER_ORDER_ID,
          eventTitle: 'Meu Show',
          eventSlug: 'meu-show',
          grossCents: 5000,
          platformFeeCents: 500,
          organizerNetCents: 4500,
          transferStatus: 'none',
          createdAt: '2026-06-03T10:00:00.000Z',
        },
        {
          orderId: ORDER_ID,
          eventTitle: 'Meu Show',
          eventSlug: 'meu-show',
          grossCents: 13200,
          platformFeeCents: 1320,
          organizerNetCents: 11880,
          transferStatus: 'none',
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      ],
    });
    await app.close();
  });

  it('reinvoca o repasse para um pedido com transfer_status failed', async () => {
    const execute = vi.fn(
      async (): Promise<'transferred' | 'skipped' | 'failed'> => 'transferred',
    );
    const app = await createTransfersApp({
      events: [
        seedEvent({
          id: MY_EVENT_ID,
          title: 'Meu Show',
          organizerId: 'user-a',
        }),
      ],
      orders: [],
      ordersById: new Map([
        [
          ORDER_ID,
          retryOrder({
            id: ORDER_ID,
            eventId: MY_EVENT_ID,
            transferStatus: 'failed',
          }),
        ],
      ]),
      execute,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/organizer/payments/transfers/${ORDER_ID}/retry`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transferStatus: 'succeeded' });
    expect(execute).toHaveBeenCalledWith({ orderId: ORDER_ID });
    await app.close();
  });

  it('devolve transferStatus failed quando o repasse falha de novo', async () => {
    const execute = vi.fn(
      async (): Promise<'transferred' | 'skipped' | 'failed'> => 'failed',
    );
    const app = await createTransfersApp({
      events: [
        seedEvent({
          id: MY_EVENT_ID,
          title: 'Meu Show',
          organizerId: 'user-a',
        }),
      ],
      orders: [],
      ordersById: new Map([
        [
          ORDER_ID,
          retryOrder({
            id: ORDER_ID,
            eventId: MY_EVENT_ID,
            transferStatus: 'failed',
          }),
        ],
      ]),
      execute,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/organizer/payments/transfers/${ORDER_ID}/retry`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transferStatus: 'failed' });
    await app.close();
  });

  it('devolve transfer_not_retryable quando o repasse não está failed', async () => {
    for (const transferStatus of ['succeeded', 'none', 'skipped'] as const) {
      const execute = vi.fn();
      const app = await createTransfersApp({
        events: [
          seedEvent({
            id: MY_EVENT_ID,
            title: 'Meu Show',
            organizerId: 'user-a',
          }),
        ],
        orders: [],
        ordersById: new Map([
          [
            ORDER_ID,
            retryOrder({
              id: ORDER_ID,
              eventId: MY_EVENT_ID,
              transferStatus,
            }),
          ],
        ]),
        execute,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/organizer/payments/transfers/${ORDER_ID}/retry`,
        headers: { 'x-test-user-id': 'user-a' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'transfer_not_retryable' });
      expect(execute).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it('devolve order_not_found para pedido de evento alheio sem revelar proibição', async () => {
    const execute = vi.fn();
    const app = await createTransfersApp({
      events: [
        seedEvent({
          id: FOREIGN_EVENT_ID,
          title: 'Show Alheio',
          organizerId: 'user-b',
        }),
      ],
      orders: [],
      ordersById: new Map([
        [
          ORDER_ID,
          retryOrder({
            id: ORDER_ID,
            eventId: FOREIGN_EVENT_ID,
            transferStatus: 'failed',
          }),
        ],
      ]),
      execute,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/organizer/payments/transfers/${ORDER_ID}/retry`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'order_not_found' });
    expect(execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('devolve order_not_found para pedido desconhecido', async () => {
    const execute = vi.fn();
    const app = await createTransfersApp({
      events: [
        seedEvent({
          id: MY_EVENT_ID,
          title: 'Meu Show',
          organizerId: 'user-a',
        }),
      ],
      orders: [],
      execute,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/organizer/payments/transfers/${ORDER_ID}/retry`,
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'order_not_found' });
    expect(execute).not.toHaveBeenCalled();
    await app.close();
  });
});
