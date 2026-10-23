import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  GetSessionFn,
  SessionUser,
  UserRole,
} from '../../auth/get-session.js';
import type { InMemoryOrganizerEventSeed } from '../infra/in-memory-organizer-repository.js';
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

const CREATE_PAYLOAD = {
  title: 'Festival de Inverno',
  description: 'Festival com artistas locais no centro da cidade.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: '2026-12-01T20:00:00.000Z',
} as const;

describe('organizer event routes', () => {
  let app: FastifyInstance;
  let repository: InMemoryOrganizerRepository;
  let roles: Map<string, UserRole>;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    const role = roles.get(userId) ?? 'buyer';
    const session: SessionUser = { userId, role };
    return session;
  };

  beforeEach(() => {
    roles = new Map([['user-a', 'organizer']]);
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
      ],
    });
    app = Fastify({ logger: false });
    registerOrganizerRoutes(app, {
      getSession,
      organizerRepository: repository,
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
});
