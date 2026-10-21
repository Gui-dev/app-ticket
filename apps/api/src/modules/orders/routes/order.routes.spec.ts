import {
  createOrderResponseSchema,
  orderDetailResponseSchema,
  orderListResponseSchema,
  orderResponseSchema,
} from '@ticketvibe/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import type { EventEntity } from '../../events/domain/event-entity.js';
import type { EventsRepository } from '../../events/domain/events-repository.js';
import type {
  OrderRecord,
  OrderSummaryRecord,
} from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { TicketRecord } from '../domain/ticket-entity.js';
import type { TicketRepository } from '../domain/ticket-repository.js';
import type { CreateOrderUseCase } from '../use-cases/create-order.use-case.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_SEAT_ID = '55555555-5555-4555-8555-555555555555';

const createOrder = {
  execute: vi.fn(),
} as unknown as CreateOrderUseCase;
const orderRepository = {
  findById: vi.fn(),
  listByUser: vi.fn(),
} as unknown as OrderRepository;
const ticketRepository = {
  findByOrderId: vi.fn(),
} as unknown as TicketRepository;
const eventsRepository = {
  findAll: vi.fn(),
  findBySlug: vi.fn(),
  findBySlugs: vi.fn(),
} as unknown as EventsRepository;

const getSession: GetSessionFn = async (headers) => {
  const userId = headers['x-test-user-id'];
  if (typeof userId !== 'string') return null;
  const email = headers['x-test-user-email'];
  return {
    userId,
    email: typeof email === 'string' ? email : null,
    isAnonymous: headers['x-test-anonymous'] === 'true',
  };
};

function buildTestApp() {
  return buildApp({
    createOrder,
    orderRepository,
    ticketRepository,
    eventsRepository,
    getSession,
  });
}

const orderFixture: OrderRecord = {
  id: ORDER_ID,
  userId: 'user-a',
  eventId: '22222222-2222-4222-8222-222222222222',
  eventSlug: 'o-fantasma-da-opera',
  status: 'pending',
  paymentMethod: 'card',
  provider: 'stripe',
  providerRef: 'pi_1',
  buyerEmail: 'comprador@example.com',
  subtotalCents: 18000,
  serviceFeeCents: 1800,
  totalCents: 19800,
  createdAt: new Date('2026-10-18T12:00:00.000Z'),
  paidAt: null,
  items: [
    {
      seatId: '33333333-3333-4333-8333-333333333333',
      rowId: '44444444-4444-4444-8444-444444444444',
      sectorSlug: 'plateia',
      sectorName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
      priceCents: 6000,
    },
  ],
};

const summaryFixture: OrderSummaryRecord = {
  id: ORDER_ID,
  eventSlug: 'o-fantasma-da-opera',
  status: 'paid',
  subtotalCents: 18000,
  serviceFeeCents: 1800,
  totalCents: 19800,
  itemCount: 2,
  createdAt: new Date('2026-10-18T12:00:00.000Z'),
};

const eventFixture: EventEntity = {
  id: '77777777-7777-4777-8777-777777777777',
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  description: 'Um clássico do teatro musical.',
  categorySlug: 'teatro',
  categoryName: 'Teatro',
  venueSlug: 'teatro-municipal',
  venueName: 'Teatro Municipal',
  venueCity: 'São Paulo',
  venueState: 'SP',
  startsAt: new Date('2026-10-22T20:00:00.000Z'),
  priceFromCents: 12000,
  imageUrl: null,
  badgeLabel: null,
  featured: true,
  isHot: false,
};

const paidOrder: OrderRecord = {
  ...orderFixture,
  status: 'paid',
  paidAt: new Date('2026-10-18T12:05:00.000Z'),
  items: [
    ...orderFixture.items,
    {
      seatId: SECOND_SEAT_ID,
      rowId: '66666666-6666-4666-8666-666666666666',
      sectorSlug: 'plateia',
      sectorName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '7',
      ticketType: 'inteira',
      priceCents: 12000,
    },
  ],
};

function ticketFor(seatId: string, code: string): TicketRecord {
  return {
    id: `ticket-${code}`,
    orderId: ORDER_ID,
    orderItemId: `item-${code}`,
    seatId,
    code,
    createdAt: new Date('2026-10-18T12:05:00.000Z'),
  };
}

const createdResult = {
  kind: 'created' as const,
  order: orderFixture,
  payment: {
    provider: 'stripe',
    providerRef: 'pi_1',
    clientSecret: 'cs_test_1',
  },
};

describe('order routes (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ticketRepository.findByOrderId).mockResolvedValue([]);
    vi.mocked(eventsRepository.findBySlugs).mockResolvedValue([]);
  });

  it('exige sessão no POST de pedido', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(createOrder.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejeita a criação de pedido para uma sessão anônima', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: {
        'x-test-user-id': 'anon-user',
        'x-test-anonymous': 'true',
      },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(createOrder.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejeita um método de pagamento inválido', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'pix' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_body');
    expect(createOrder.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('mapeia event_not_found para 404', async () => {
    vi.mocked(createOrder.execute).mockResolvedValueOnce({
      kind: 'event_not_found',
    });
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
    await app.close();
  });

  it('mapeia empty_cart para 409', async () => {
    vi.mocked(createOrder.execute).mockResolvedValueOnce({
      kind: 'empty_cart',
    });
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'empty_cart' });
    await app.close();
  });

  it('mapeia seat_unavailable para 409 com o assento', async () => {
    const seat = { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '7' };
    vi.mocked(createOrder.execute).mockResolvedValueOnce({
      kind: 'seat_unavailable',
      seat,
    });
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'seat_unavailable', seat });
    await app.close();
  });

  it('mapeia payment_failed para 502', async () => {
    vi.mocked(createOrder.execute).mockResolvedValueOnce({
      kind: 'payment_failed',
    });
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'payment_failed' });
    await app.close();
  });

  it('cria o pedido com 201 e devolve o client secret', async () => {
    vi.mocked(createOrder.execute).mockResolvedValueOnce(createdResult);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: {
        'x-test-user-id': 'user-a',
        'x-test-user-email': 'comprador@example.com',
      },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(201);
    expect(createOrder.execute).toHaveBeenCalledWith({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      paymentMethod: 'card',
      buyerEmail: 'comprador@example.com',
    });
    const body = createOrderResponseSchema.parse(response.json());
    expect(body.payment).toEqual({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'cs_test_1',
    });
    expect(body.order.id).toBe(ORDER_ID);
    expect(body.order.createdAt).toBe('2026-10-18T12:00:00.000Z');
    expect(body.order.paidAt).toBeNull();
    await app.close();
  });

  it('devolve 503 quando o pedido concorrente ainda não tem pagamento', async () => {
    vi.mocked(createOrder.execute).mockResolvedValueOnce({
      kind: 'created',
      order: { ...orderFixture, providerRef: null },
      payment: {
        provider: 'stripe',
        providerRef: null,
        clientSecret: null,
      },
    });
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'x-test-user-id': 'user-a' },
      payload: { paymentMethod: 'card' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'order_in_progress' });
    await app.close();
  });

  it('exige sessão no GET de pedido', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(orderRepository.findById).not.toHaveBeenCalled();
    await app.close();
  });

  it('devolve 404 para o pedido de outro usuário', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce({
      ...orderFixture,
      userId: 'user-b',
    });
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'order_not_found' });
    await app.close();
  });

  it('devolve 404 para um id malformado sem consultar o repositório', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/orders/abc',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'order_not_found' });
    expect(orderRepository.findById).not.toHaveBeenCalled();
    await app.close();
  });

  it('devolve o próprio pedido com datas em ISO', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce(orderFixture);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    expect(orderRepository.findById).toHaveBeenCalledWith(ORDER_ID);
    const body = orderResponseSchema.parse(response.json());
    expect(body.order).toMatchObject({
      id: ORDER_ID,
      eventSlug: 'o-fantasma-da-opera',
      status: 'pending',
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
      createdAt: '2026-10-18T12:00:00.000Z',
      paidAt: null,
    });
    expect(body.order.items).toEqual([
      {
        sectorSlug: 'plateia',
        sectorName: 'Plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
        priceCents: 6000,
        ticket: null,
      },
    ]);
    await app.close();
  });

  it('devolve o evento do pedido no detalhe', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce(orderFixture);
    vi.mocked(eventsRepository.findBySlugs).mockResolvedValueOnce([
      eventFixture,
    ]);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    expect(eventsRepository.findBySlugs).toHaveBeenCalledWith([
      'o-fantasma-da-opera',
    ]);
    const body = orderDetailResponseSchema.parse(response.json());
    expect(body.event).toEqual({
      slug: 'o-fantasma-da-opera',
      title: 'O Fantasma da Ópera',
      startsAt: '2026-10-22T20:00:00.000Z',
    });
    await app.close();
  });

  it('devolve evento nulo quando o evento não existe mais', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce(orderFixture);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    const body = orderDetailResponseSchema.parse(response.json());
    expect(body.event).toBeNull();
    await app.close();
  });

  it('exige sessão no histórico de pedidos', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/orders' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(orderRepository.listByUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejeita a sessão anônima no histórico de pedidos', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/orders',
      headers: {
        'x-test-user-id': 'anon-user',
        'x-test-anonymous': 'true',
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(orderRepository.listByUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('devolve o histórico do usuário autenticado', async () => {
    vi.mocked(orderRepository.listByUser).mockResolvedValueOnce([
      summaryFixture,
    ]);
    vi.mocked(eventsRepository.findBySlugs).mockResolvedValueOnce([
      eventFixture,
    ]);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/orders',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    expect(orderRepository.listByUser).toHaveBeenCalledWith({
      userId: 'user-a',
      limit: 50,
    });
    expect(eventsRepository.findBySlugs).toHaveBeenCalledWith([
      'o-fantasma-da-opera',
    ]);
    const body = orderListResponseSchema.parse(response.json());
    expect(body.orders).toEqual([
      {
        id: ORDER_ID,
        eventSlug: 'o-fantasma-da-opera',
        eventTitle: 'O Fantasma da Ópera',
        eventStartsAt: '2026-10-22T20:00:00.000Z',
        status: 'paid',
        subtotalCents: 18000,
        serviceFeeCents: 1800,
        totalCents: 19800,
        itemCount: 2,
        createdAt: '2026-10-18T12:00:00.000Z',
      },
    ]);
    await app.close();
  });

  it('devolve o histórico quando o evento não existe mais', async () => {
    vi.mocked(orderRepository.listByUser).mockResolvedValueOnce([
      summaryFixture,
    ]);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/orders',
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    const body = orderListResponseSchema.parse(response.json());
    expect(body.orders[0]).toMatchObject({
      eventSlug: 'o-fantasma-da-opera',
      eventTitle: 'o-fantasma-da-opera',
      eventStartsAt: '2026-10-18T12:00:00.000Z',
    });
    await app.close();
  });

  it('devolve o ingresso válido de cada item de um pedido pago', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce(paidOrder);
    vi.mocked(ticketRepository.findByOrderId).mockResolvedValueOnce([
      ticketFor('33333333-3333-4333-8333-333333333333', 'code-6'),
      ticketFor(SECOND_SEAT_ID, 'code-7'),
    ]);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    expect(ticketRepository.findByOrderId).toHaveBeenCalledWith(ORDER_ID);
    const body = orderResponseSchema.parse(response.json());
    expect(body.order.items.map((item) => item.ticket)).toEqual([
      { code: 'code-6', status: 'valid' },
      { code: 'code-7', status: 'valid' },
    ]);
    await app.close();
  });

  it('devolve o ingresso como não válido quando o pedido expirou', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce({
      ...orderFixture,
      status: 'expired',
    });
    vi.mocked(ticketRepository.findByOrderId).mockResolvedValueOnce([
      ticketFor('33333333-3333-4333-8333-333333333333', 'code-6'),
    ]);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    const body = orderResponseSchema.parse(response.json());
    expect(body.order.items[0]?.ticket).toEqual({
      code: 'code-6',
      status: 'invalid',
    });
    await app.close();
  });

  it('não devolve ingresso para um pedido pendente', async () => {
    vi.mocked(orderRepository.findById).mockResolvedValueOnce(orderFixture);
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/orders/${ORDER_ID}`,
      headers: { 'x-test-user-id': 'user-a' },
    });
    expect(response.statusCode).toBe(200);
    const body = orderResponseSchema.parse(response.json());
    expect(body.order.items[0]?.ticket).toBeNull();
    await app.close();
  });
});
