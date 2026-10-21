import {
  createOrderResponseSchema,
  orderResponseSchema,
} from '@ticketvibe/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { CreateOrderUseCase } from '../use-cases/create-order.use-case.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const createOrder = {
  execute: vi.fn(),
} as unknown as CreateOrderUseCase;
const orderRepository = {
  findById: vi.fn(),
} as unknown as OrderRepository;

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
  return buildApp({ createOrder, orderRepository, getSession });
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
});
