import {
  createOrderRequestSchema,
  createOrderResponseSchema,
  type OrderDto,
  orderResponseSchema,
  orderSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import type { CreateOrderUseCase } from '../use-cases/create-order.use-case.js';

interface OrderRoutesDeps {
  getSession: GetSessionFn;
  createOrder: CreateOrderUseCase;
  orderRepository: OrderRepository;
}

const orderIdSchema = orderSchema.shape.id;

function serializeOrder(order: OrderRecord): OrderDto {
  return {
    id: order.id,
    eventSlug: order.eventSlug,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotalCents: order.subtotalCents,
    serviceFeeCents: order.serviceFeeCents,
    totalCents: order.totalCents,
    items: order.items.map((item) => ({
      sectorSlug: item.sectorSlug,
      rowLabel: item.rowLabel,
      seatLabel: item.seatLabel,
      ticketType: item.ticketType,
      priceCents: item.priceCents,
    })),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
  };
}

export function registerOrderRoutes(
  app: FastifyInstance,
  deps: OrderRoutesDeps,
): void {
  app.post('/events/:slug/orders', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (session.isAnonymous) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = createOrderRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.createOrder.execute({
      userId: session.userId,
      eventSlug: slug,
      paymentMethod: parsed.data.paymentMethod,
      buyerEmail: session.email ?? null,
    });
    switch (result.kind) {
      case 'event_not_found':
        return reply.code(404).send({ error: 'event_not_found' });
      case 'empty_cart':
        return reply.code(409).send({ error: 'empty_cart' });
      case 'seat_unavailable':
        return reply
          .code(409)
          .send({ error: 'seat_unavailable', seat: result.seat });
      case 'payment_failed':
        return reply.code(502).send({ error: 'payment_failed' });
      case 'created':
        return reply.code(201).send(
          createOrderResponseSchema.parse({
            order: serializeOrder(result.order),
            payment: result.payment,
          }),
        );
    }
  });

  app.get('/orders/:id', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id } = request.params as { id: string };
    if (!orderIdSchema.safeParse(id).success) {
      return reply.code(404).send({ error: 'order_not_found' });
    }
    const order = await deps.orderRepository.findById(id);
    if (!order || order.userId !== session.userId) {
      return reply.code(404).send({ error: 'order_not_found' });
    }
    return reply.send(
      orderResponseSchema.parse({ order: serializeOrder(order) }),
    );
  });
}
